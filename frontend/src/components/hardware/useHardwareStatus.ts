import { useEffect, useRef, useState } from 'react';
import { selectReading, useSensorStore } from '@/store/sensorStore';
import { useHardwareLogStore } from '@/store/hardwareLogStore';
import { api } from '@/lib/api';
import type { HardwareComponentId, HardwareStatus, Telemetry } from '@/types';

/**
 * Deteksi status tiap komponen dari telemetry.
 *
 * Empat aturan, semuanya dari spesifikasi:
 *
 * 1. Syarat tidak langsung dianggap error. Status baru naik ke `error` atau
 *    `warning` setelah bertahan 10 detik. Tanpa itu, satu telemetry jelek
 *    akan berkedip merah sekejap lalu hilang, dan itu lebih merepotkan daripada
 *    tidak dilaporkan sama sekali.
 *
 * 2. Hanya `error` yang dikirim ke backend lewat `POST /api/logs/activity`
 *    dengan tipe `sensor_error`. `warning` tetap lokal supaya log aktivitas
 *    tidak cepat terisi kejadian ringan.
 *
 * 3. Status yang dipaksa dari DevSimulationPanel selalu menang atas deteksi
 *    otomatis, dan ditandai `source: 'simulation'` di log.
 *
 * 4. Potentiometer dideteksi dari nilai yang macet, bukan dari ambang 0 atau
 *    100. Subsection di bawah menjelaskan alasannya.
 *
 * Kenapa potentiometer tidak memakai ambang 0 dan 100
 * ---------------------------------------------------
 * Versi pertama memakai ambang itu, dengan argumen bahwa ADC mentok di 0 atau
 * 4095 menandakan kabel putus. Itu keliru, karena firmware memetakan
 * `analogRead` 0..4095 ke 0..100 persen, sehingga ADC mentok muncul sebagai
 * `humTanah` 0 atau 100 - dan kedua nilai itu kondisi tanah yang sah. Tanah
 * kering total memang 0 persen, jadi ambang itu akan menandai sistem yang
 * sehat sebagai mati.
 *
 * Yang dipakai sekarang adalah deteksi "stuck value": kalau rentang seluruh
 * pembacaan dalam jendela 30 detik kurang dari 5 poin persen, barulah
 * dianggap macet. Tanah boleh kering atau basah sesukaunya; yang tidak
 * mungkin adalah sensor yang sama sekali tidak bergerak sama sekali.
 *
 * Batas yang perlu diketahui: tanah yang benar-benar stabil pun bisa diam
 * selama 30 detik lebih, jadi deteksi ini bisa positif palsu pada sistem
 * yang sehat dan tanahnya tidak berubah. Itu karakteristik dari metode ini,
 * dan alasan statusnya `error` dengan alasan yang eksplisit, bukan diam-diam.
 */

/** Berapa lama kondisi harus bertahan sebelum naik status, dalam ms. */
const STICKY_MS = 10_000;
/** Kapan kondisi dievaluasi ulang, dalam ms. */
const CHECK_INTERVAL_MS = 1_000;

/**
 * Jendela pengamatan untuk deteksi macet, dalam ms.
 *
 * Harus lebih besar dari interval telemetry supaya cukup sampel terkumpul.
 * Simulator mengirim telemetry setiap 2 detik, jadi 30 detik memberi sekitar
 * 15 sampel - cukup untuk declaring angka tidak bergerak.
 */
const STUCK_WINDOW_MS = 30_000;

/**
 * Rentang maksimum, dalam poin persen, yang masih dianggap "diam".
 *
 * `humTanah` adalah nilai 0..100, jadi 5 di sini setara sekitar 205 unit ADC
 * mentah pada rentang 0..4095.
 *
 * Yang dibandingkan adalah max dan min dalam jendela, bukan sampel pertama dan
 * terakhir. Bedanya nyata untuk pola yang naik lalu turun kembali, misalnya
 * 45 lalu 52 lalu 45: perbandingan oldest-newest melihat selisih 0 dan salah
 * menyebutnya macet, sedangkan rentangnya 7 sehingga terbaca bergerak.
 *
 * Batasnya yang perlu diterima: semua pergerakan dengan amplitudo di bawah 5
 * poin dianggap macet, termasuk kemiringan halus seperti 45 ke 46 ke 47.
 * Itu memang definisi "selisih <5" dari spesifikasi, bukan kelemahan
 * implementasi di sini.
 */
const STUCK_DELTA = 5;

/** Severitas sebelum aturan 10 detik diterapkan. */
type RawSeverity = 'none' | 'warning' | 'error';

/**
 * Rentang yang masih masuk akal untuk DHT22, mengikuti datasheet:
 * -40 sampai 80 derajat C dan 0 sampai 100 persen RH. Pembacaan di luar itu
 * hampir pasti salah baca, bukan cuaca ekstrem.
 */
const DHT_TEMP_MIN = -40;
const DHT_TEMP_MAX = 80;

const ALL: HardwareComponentId[] = ['esp32', 'dht22', 'potentiometer', 'relay', 'lcd'];

export type HardwareVerdict = Record<HardwareComponentId, { status: HardwareStatus; reason: string }>;

function severityToStatus(severity: RawSeverity): HardwareStatus {
  if (severity === 'error') return 'error';
  if (severity === 'warning') return 'warning';
  return 'normal';
}

function initialVerdict(): HardwareVerdict {
  return {
    esp32: { status: 'normal', reason: 'Belum ada data' },
    dht22: { status: 'normal', reason: 'Belum ada data' },
    potentiometer: { status: 'normal', reason: 'Belum ada data' },
    relay: { status: 'normal', reason: 'Tidak ada telemetry status relay' },
    lcd: { status: 'normal', reason: 'Tidak ada telemetry perubahan teks LCD' },
  };
}

/** Components whose status can never be derived from telemetry. */
const MANUAL_ONLY: HardwareComponentId[] = ['relay', 'lcd'];

/** Satu pembacaan ADC beserta waktu tibanya. */
type Sample = { at: number; value: number };

/** Hasil pemeriksaan "stuck value" untuk potentiometer. */
type StuckResult = { stuck: boolean; reason: string };

const NOT_STUCK: StuckResult = {
  stuck: false,
  reason: 'Pembacaan masih bergerak',
};

/**
 * Deteksi ADC yang macet.
 *
 * Syaratnya: rentang seluruh sampel dalam jendela 30 detik kurang dari
 * `STUCK_DELTA` poin persen.
 *
 * Dua hal yang dijaga di sini:
 *
 * 1. **Butuh data yang cukup.** Kalau telemetry baru datang 5 detik lalu,
 *    belum boleh simpul apa pun. Tanpa penjaga ini, setiap muat halaman akan
 *    menampilkan error palsu setelah beberapa detik.
 *
 * 2. **Hanya dievaluasi saat sampel baru masuk.** Kalau telemetry berhenti
 *    datang, buffer tidak bertambah dan rentangnya tetap kecil selamanya, yang
 *    akan menghasilkan "macet" palsu. Perangkat yang diam ditangani oleh
 *    pemeriksaan konektivitas ESP32, bukan oleh fungsi ini.
 */
function checkStuck(samples: Sample[], now: number): StuckResult {
  if (samples.length < 2) return NOT_STUCK;

  const oldest = samples[0];
  // Jendela belum penuh: belum ada yang bisa disimpulkan.
  if (now - oldest.at < STUCK_WINDOW_MS) return NOT_STUCK;

  let min = samples[0].value;
  let max = samples[0].value;
  for (let i = 1; i < samples.length; i += 1) {
    const value = samples[i].value;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const range = max - min;
  if (range >= STUCK_DELTA) return NOT_STUCK;

  const seconds = Math.round((now - oldest.at) / 1000);
  return {
    stuck: true,
    reason:
      `Pembacaan macet di ${max.toFixed(1)} persen ` +
      `(rentang ${range.toFixed(1)} poin selama ${seconds} detik). ` +
      'Kemungkinan sensor rusak atau potensio macet.',
  };
}

/**
 * Nilai mentah tiap komponen beserta alasan yang tampil di log.
 *
 * `persistent` menandai kondisi yang sudah ditunggu oleh pemeriksanya sendiri,
 * sehingga tidak perlu ditahan lagi oleh aturan 10 detik.
 */
type Raw = Record<
  HardwareComponentId,
  { severity: RawSeverity; reason: string; persistent: boolean }
>;

function evaluate(telemetry: Telemetry | null, online: boolean, stuck: StuckResult): Raw {
  const suhu = selectReading(telemetry, 'suhu');
  const humUdara = selectReading(telemetry, 'humUdara');
  const humTanah = selectReading(telemetry, 'humTanah');

  // --- DHT22, satu sensor untuk suhu dan kelembapan udara ---
  let dhtSeverity: RawSeverity = 'none';
  let dhtReason = 'Pembacaan dalam rentang normal';
  if (suhu === null || humUdara === null) {
    dhtSeverity = 'error';
    dhtReason = 'Pembacaan NaN, firmware mencetak "Gagal baca DHT22!"';
  } else if (suhu < DHT_TEMP_MIN || suhu > DHT_TEMP_MAX) {
    dhtSeverity = 'warning';
    dhtReason = `Suhu ${suhu.toFixed(1)} C di luar rentang datasheet ${DHT_TEMP_MIN} sampai ${DHT_TEMP_MAX}`;
  } else if (humUdara < 0 || humUdara > 100) {
    dhtSeverity = 'warning';
    dhtReason = `Kelembapan udara ${humUdara.toFixed(0)} persen di luar rentang 0 sampai 100`;
  }

  // --- Potensiometer: hanya macet dan tidak melapor yang dianggap error ---
  let soilSeverity: RawSeverity = 'none';
  let soilReason = 'Pembacaan dalam rentang normal';
  let soilPersistent = false;
  if (humTanah === null) {
    soilSeverity = 'error';
    soilReason = 'Tidak ada pembacaan ADC';
  } else if (stuck.stuck) {
    soilSeverity = 'error';
    soilReason = stuck.reason;
    soilPersistent = true;
  }

  // --- ESP32: kehilangan koneksi membuat telemetry berhenti ---
  const espSeverity: RawSeverity = online ? 'none' : 'error';
  const espReason = online ? 'ESP32 online dan telemetry mengalir' : 'ESP32 tidak merespons, telemetry berhenti';

  return {
    esp32: { severity: espSeverity, reason: espReason, persistent: false },
    dht22: { severity: dhtSeverity, reason: dhtReason, persistent: false },
    potentiometer: { severity: soilSeverity, reason: soilReason, persistent: soilPersistent },
    relay: { severity: 'none', reason: 'Tidak ada telemetry status relay', persistent: false },
    lcd: { severity: 'none', reason: 'Tidak ada telemetry perubahan teks LCD', persistent: false },
  };
}

export function useHardwareStatus(): HardwareVerdict {
  const telemetry = useSensorStore((s) => s.telemetry);
  const online = useSensorStore((s) => s.online);
  const forced = useHardwareLogStore((s) => s.forced);
  const push = useHardwareLogStore((s) => s.push);

  const [verdict, setVerdict] = useState<HardwareVerdict>(initialVerdict);

  /** Kapan kondisi mentah terakhir kali teramati, per komponen. */
  const sinceRef = useRef<Partial<Record<HardwareComponentId, number>>>({});

  /**
   * Riwayat pembacaan ADC untuk deteksi macet.
   *
   * Dipakai sebagai ref, bukan state: buffer ini bertambah setiap telemetry
   * arrive dan tidak boleh memicu render. yang memicu render hanyalah `verdict`.
   */
  const soilSamplesRef = useRef<Sample[]>([]);

  /**
   * `ts` telemetry terakhir yang sudah dimasukkan ke buffer.
   *
   * Dipakai agar pemeriksaan macet hanya berjalan saat ada sampel baru. Tanpa
   * ini, ketika telemetry berhenti datang buffer membeku dengan rentang kecil
   * dan akan dilaporkan macet - padahal yang salah adalah koneksinya.
   */
  const lastSampleTsRef = useRef<string | null>(null);

  /**
   * Cerminan `verdict` yang selalu mutakhir, dibaca di dalam `tick`.
   *
   * Ini diperlukan karena `verdict` sengaja tidak ada di dependensi interval.
   * Kalau `tick` membaca `verdict` dari closure, closure itu tertinggal di
   * nilai awal: setiap detak akan menganggap semua status berubah dari
   * `normal` dan mencatat log yang sama berulang-ulang. `sinceRef` juga
   * butuh waktu yang tidak bergantung pada render.
   */
  const appliedRef = useRef<HardwareVerdict>(verdict);

  useEffect(() => {
    function tick() {
      const now = Date.now();

      // Kumpulkan sampel ADC terbaru dan potong yang sudah di luar jendela.
      const humTanah = selectReading(telemetry, 'humTanah');
      const ts = telemetry?.ts ?? null;
      let freshSample = false;

      if (humTanah !== null && ts !== null && ts !== lastSampleTsRef.current) {
        lastSampleTsRef.current = ts;
        soilSamplesRef.current.push({ at: now, value: humTanah });
        freshSample = true;
      }
      // Buang sampel yang lebih tua dari jendela plus margin, supaya buffer
      // tidak tumbuh terus selama halaman terbuka.
      const cutoff = now - STUCK_WINDOW_MS - CHECK_INTERVAL_MS;
      soilSamplesRef.current = soilSamplesRef.current.filter((s) => s.at >= cutoff);

      // Hanya periksa macet kalau ada sampel baru yang masuk.
      const stuck: StuckResult = freshSample
        ? checkStuck(soilSamplesRef.current, now)
        : NOT_STUCK;

      const raw = evaluate(telemetry, online, stuck);
      const applied = appliedRef.current;

      // Status hasil stickiness, dihitung dari verdict yang sudah diterapkan.
      let changed = false;
      const next: HardwareVerdict = {
        esp32: { ...applied.esp32 },
        dht22: { ...applied.dht22 },
        potentiometer: { ...applied.potentiometer },
        relay: { ...applied.relay },
        lcd: { ...applied.lcd },
      };

      for (const id of ALL) {
        const override = forced[id];
        if (override) {
          if (next[id].status !== override) {
            next[id] = { status: override, reason: 'Status dipaksa dari Dev Mode' };
            changed = true;
          }
          continue;
        }

        if (MANUAL_ONLY.includes(id)) {
          // Tanpa telemetry, tidak ada yang bisa dinaikkan otomatis.
          if (next[id].status !== 'normal') {
            next[id] = { status: 'normal', reason: raw[id].reason };
            changed = true;
          }
          continue;
        }

        const { severity, reason, persistent } = raw[id];

        if (severity === 'none') {
          sinceRef.current[id] = undefined;
          if (next[id].status !== 'normal') {
            next[id] = { status: 'normal', reason };
            changed = true;
          }
          continue;
        }

        /*
         * Kondisi yang sudah persisten oleh pengamatnya sendiri (deteksi
         * macet yang jendelanya 30 detik) tidak perlu menunggu aturan 10 detik
         * lagi, yang akan menambah delay yang tidak ada gunanya. `since`
         * dip mundurkan supaya langsung lolos pemeriksaan di bawah.
         */
        if (persistent && sinceRef.current[id] === undefined) {
          sinceRef.current[id] = now - STICKY_MS;
        }

        // Syarat baru muncul: catat waktunya, jangan naikkan status dulu.
        const since = sinceRef.current[id];
        if (since === undefined) {
          sinceRef.current[id] = now;
          continue;
        }

        if (now - since < STICKY_MS) continue;

        const status = severityToStatus(severity);
        if (next[id].status !== status) {
          next[id] = { status, reason };
          changed = true;
        }
      }

      if (!changed) return;

      // Catat transisi ke log lokal, lalu kirim yang `error` ke backend.
      for (const id of ALL) {
        const before = applied[id].status;
        const after = next[id].status;
        if (before === after) continue;

        push({
          component: id,
          from: before,
          to: after,
          reason: next[id].reason,
          source: forced[id] ? 'simulation' : 'auto',
        });

        // Hanya `error` yang naik ke backend. `deviceId` tidak dikirim dari
        // klien karena endpoint menentukannya dari sesi terautentikasi.
        if (after === 'error') {
          void api.logHardwareChange({
            component: id,
            from: before,
            to: after,
            reason: next[id].reason,
          });
        }
      }

      appliedRef.current = next;
      setVerdict(next);
    }

    tick();
    const timer = setInterval(tick, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [telemetry, online, forced, push]);

  return verdict;
}
