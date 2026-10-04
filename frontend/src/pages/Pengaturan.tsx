import { useEffect, useState } from 'react';
import { Power, RotateCcw, Save, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { SENSOR_META, type Calibration, type SensorName, type Thresholds } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useSensorStore } from '@/store/sensorStore';

const SENSORS: SensorName[] = ['suhu', 'humUdara', 'humTanah'];

const FALLBACK: Thresholds = {
  suhu: { min: 18, max: 30 },
  humUdara: { min: 60, max: 85 },
  humTanah: { min: 40, max: 70 },
};

/**
 * Batas offset kalibrasi per sensor.
 *
 * Nilainya meniru `calibrationSchema` di `backend/src/config/schemas.ts`.
 * Backend menolak nilai di luar rentang ini dengan 400, jadi input di sini
 * wajib memakai angka yang sama persis - kalau UI lebih longgar, user mengetik
 * offset 999 lalu hanya tahu ada error dari pesan 400 yang opaque.
 *
 * PENTING: rentang ini sudah disepakati -10/+10 untuk suhu dan -20/+20 untuk
 * kelembapan, dan PLANNING.md F2.3 sekarang menulis angka yang sama. Kalau
 * nanti diubah ke rentang lain, ubah tiga angka ini DAN schema backend-nya
 * sekaligus, kalau tidak ESP32 akan menerima offset yang lalu ditolak server.
 */
const CALIBRATION_LIMIT: Record<SensorName, number> = {
  suhu: 10,
  humUdara: 20,
  humTanah: 20,
};

/** Batasi dan bulatkan nilai agar selalu valid menurut backend. */
function clampCalibration(sensor: SensorName, raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  const limit = CALIBRATION_LIMIT[sensor];
  return Math.round(Math.min(limit, Math.max(-limit, raw)) * 10) / 10;
}

export function Pengaturan() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const online = useSensorStore((s) => s.online);
  const firmware = useSensorStore((s) => s.firmware);
  const uptime = useSensorStore((s) => s.uptime);

  const [thresholds, setThresholds] = useState<Thresholds>(FALLBACK);
  const [calibration, setCalibration] = useState<Calibration>({ suhu: 0, humUdara: 0, humTanah: 0 });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Restart memutus telemetry, jadi butuh dua langkah: klik tombol dulu, lalu
  // tombol konfirmasi. State konfirmasi dipisah supaya membatalkan tidak
  // ikut mengubah state section lain.
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void api
      .settings()
      .then((settings) => {
        if (cancelled) return;
        setThresholds(settings.thresholds);
        setCalibration(settings.calibration);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setPending(true);
    setStatus(null);
    setError(null);
    try {
      // Dijepit ulang saat kirim, bukan hanya saat mengetik: nilai bisa berasal
      // dari config lama di server yang disimpan sebelum batas ini ada, dan satu
      // nilai di luar rentang membuat seluruh request ditolak 400.
      const safeCalibration = SENSORS.reduce<Calibration>(
        (acc, sensor) => ({ ...acc, [sensor]: clampCalibration(sensor, calibration[sensor]) }),
        { ...calibration },
      );
      setCalibration(safeCalibration);

      await api.saveThresholds(thresholds);
      await api.saveCalibration(safeCalibration);
      setStatus('Threshold dan kalibrasi berhasil disimpan dan dikirim ke ESP32.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan');
    } finally {
      setPending(false);
    }
  }

  async function restart() {
    setRestarting(true);
    setError(null);
    setStatus(null);
    try {
      const result = await api.restart();
      setStatus(result.message);
      setConfirmRestart(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim perintah restart');
    } finally {
      setRestarting(false);
    }
  }

  const uptimeLabel = (() => {
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.round((uptime % 3600) / 60);
    if (hours > 0) return `${hours} jam ${minutes} menit`;
    return `${minutes} menit`;
  })();

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-5">
        <h1 className="font-[family-name:var(--font-display)] text-[clamp(20px,3vw,28px)]">
          Pengaturan
        </h1>
        <p className="mt-1 text-[14px] text-[color:var(--color-fg-muted)]">
          Batas ideal sensor dan offset kalibrasi. Nilai dikirim ke ESP32 lewat topik config.
        </p>
      </header>

      {!isAdmin && (
        <p className="mb-4 flex items-start gap-2 rounded-[10px] border border-[color:color-mix(in_oklab,var(--color-warning)_40%,transparent)] bg-[color:color-mix(in_oklab,var(--color-warning)_12%,transparent)] px-3 py-2 text-[13px] text-[color:var(--color-warning)]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Anda masuk sebagai <strong>{user?.role ?? 'operator'}</strong>. Hanya admin yang
            dapat menyimpan perubahan threshold dan me-restart perangkat.
          </span>
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-[10px] border border-[color:color-mix(in_oklab,var(--color-destructive)_40%,transparent)] bg-[color:color-mix(in_oklab,var(--color-destructive)_12%,transparent)] px-3 py-2 text-[13px] text-[color:var(--color-destructive)]"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-4">
        <section className="glass flex flex-col gap-6 p-5">
          <fieldset disabled={!isAdmin || pending} className="flex flex-col gap-5">
            <legend className="text-[15px] font-medium">Batas ideal</legend>

            {SENSORS.map((sensor) => {
              const meta = SENSOR_META[sensor];
              return (
                <div key={sensor} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <div>
                    <p className="text-[14px] font-medium">{meta.label}</p>
                    <p className="text-[12px] text-[color:var(--color-fg-subtle)]">
                      Nilai di luar rentang ini memicu alert otomatis.
                    </p>
                  </div>
                  <label className="flex flex-col gap-1 text-[12px] text-[color:var(--color-fg-muted)]">
                    Minimum
                    <input
                      type="number"
                      step="0.5"
                      value={thresholds[sensor].min}
                      onChange={(e) =>
                        setThresholds((prev) => ({
                          ...prev,
                          [sensor]: { ...prev[sensor], min: Number(e.target.value) },
                        }))
                      }
                      className="value-tabular w-24 rounded-[10px] border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-deep)] px-2.5 py-2 text-[14px] outline-none focus:border-[color:var(--color-canopy)]"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[12px] text-[color:var(--color-fg-muted)]">
                    Maksimum
                    <input
                      type="number"
                      step="0.5"
                      value={thresholds[sensor].max}
                      onChange={(e) =>
                        setThresholds((prev) => ({
                          ...prev,
                          [sensor]: { ...prev[sensor], max: Number(e.target.value) },
                        }))
                      }
                      className="value-tabular w-24 rounded-[10px] border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-deep)] px-2.5 py-2 text-[14px] outline-none focus:border-[color:var(--color-canopy)]"
                    />
                  </label>
                </div>
              );
            })}
          </fieldset>

          <fieldset disabled={!isAdmin || pending} className="flex flex-col gap-5">
            <legend className="text-[15px] font-medium">Kalibrasi sensor (offset)</legend>
            {SENSORS.map((sensor) => {
              const meta = SENSOR_META[sensor];
              const limit = CALIBRATION_LIMIT[sensor];
              return (
                <label key={sensor} className="flex items-center justify-between gap-4 text-[14px]">
                  <span>{meta.label}</span>
                  <span className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min={-limit}
                      max={limit}
                      value={calibration[sensor]}
                      onChange={(e) =>
                        setCalibration((prev) => ({
                          ...prev,
                          // Dikunci saat mengetik, bukan hanya divalidasi saat
                          // simpan: min/max di atas tetap bisa dilewati lewat
                          // paste atau spin button, jadi nilainya ikut dijepit.
                          [sensor]: clampCalibration(sensor, Number(e.target.value)),
                        }))
                      }
                      aria-describedby={`calib-hint-${sensor}`}
                      className="value-tabular w-24 rounded-[10px] border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-deep)] px-2.5 py-2 text-[14px] outline-none focus:border-[color:var(--color-canopy)]"
                    />
                    <span
                      id={`calib-hint-${sensor}`}
                      className="value-tabular w-14 shrink-0 text-[12px] text-[color:var(--color-fg-subtle)]"
                    >
                      {meta.unit}
                    </span>
                  </span>
                </label>
              );
            })}
            <p className="text-[12px] text-[color:var(--color-fg-subtle)]">
              Offset -{CALIBRATION_LIMIT.suhu} sampai +{CALIBRATION_LIMIT.suhu} untuk suhu, dan
              -{CALIBRATION_LIMIT.humUdara} sampai +{CALIBRATION_LIMIT.humUdara} untuk kelembapan.
              Nilai di luar rentang dijepit otomatis.
            </p>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={!isAdmin || pending}
              className="inline-flex items-center gap-2 rounded-[10px] bg-[color:var(--color-canopy)] px-4 py-2.5 text-[14px] font-semibold text-[color:var(--color-bg-deep)] transition-colors hover:bg-[color:var(--color-canopy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="size-4" aria-hidden="true" />
              {pending ? 'Menyimpan...' : 'Simpan perubahan'}
            </button>
            {status && (
              <p aria-live="polite" className="text-[13px] text-[color:var(--color-fg-muted)]">
                {status}
              </p>
            )}
          </div>
        </section>

        <section className="glass flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-medium">Perangkat</h2>
              <p className="mt-1 text-[13px] text-[color:var(--color-fg-muted)]">
                Restart memutus telemetry selama 10–20 detik lalu perangkat boot ulang.
              </p>
            </div>

            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-border)] px-3 py-1 text-[12px]"
              style={{
                color: online ? 'var(--color-success)' : 'var(--color-fg-subtle)',
              }}
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ backgroundColor: online ? 'var(--color-success)' : 'var(--color-fg-subtle)' }}
              />
              {online ? 'Online' : 'Offline'}
            </span>
          </div>

          <dl className="grid gap-3 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="text-[color:var(--color-fg-subtle)]">ID perangkat</dt>
              <dd className="value-tabular font-[family-name:var(--font-mono)]">esp32-greenhouse-01</dd>
            </div>
            <div>
              <dt className="text-[color:var(--color-fg-subtle)]">Versi firmware</dt>
              <dd className="value-tabular">{firmware}</dd>
            </div>
            <div>
              <dt className="text-[color:var(--color-fg-subtle)]">Uptime</dt>
              <dd className="value-tabular">{uptime > 0 ? uptimeLabel : 'Belum dilaporkan'}</dd>
            </div>
          </dl>

          {!isAdmin ? (
            <p className="text-[13px] text-[color:var(--color-fg-subtle)]">
              Hanya admin yang dapat me-restart perangkat.
            </p>
          ) : confirmRestart ? (
            <div
              role="group"
              aria-label="Konfirmasi restart perangkat"
              className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[color:color-mix(in_oklab,var(--color-destructive)_40%,transparent)] bg-[color:color-mix(in_oklab,var(--color-destructive)_10%,transparent)] p-3"
            >
              <p className="flex-1 text-[13px] text-[color:var(--color-fg)]">
                Yakin restart perangkat? Data di EEPROM hilang, telemetry terputus
                sementara.
              </p>
              <button
                type="button"
                onClick={() => setConfirmRestart(false)}
                disabled={restarting}
                className="rounded-[10px] border border-[color:var(--color-border-strong)] px-3 py-1.5 text-[13px] transition-colors hover:bg-[color:var(--color-surface-raised)]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void restart()}
                disabled={restarting}
                className="inline-flex items-center gap-2 rounded-[10px] bg-[color:var(--color-destructive)] px-3 py-1.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                {restarting ? 'Mengirim...' : 'Ya, restart'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRestart(true)}
              disabled={!online}
              className="inline-flex items-center gap-2 self-start rounded-[10px] border border-[color:color-mix(in_oklab,var(--color-destructive)_45%,transparent)] px-3.5 py-2 text-[13px] text-[color:var(--color-destructive)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--color-destructive)_12%,transparent)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Power className="size-4" aria-hidden="true" />
              Restart perangkat
            </button>
          )}
        </section>

        <section className="glass flex flex-col gap-2 p-5">
          <h2 className="text-[15px] font-medium">Tentang sistem</h2>
          <p className="text-[13px] text-[color:var(--color-fg-muted)]">
            Smart IoT Greenhouse — monitoring dan kontrol rumah hijau berbasis ESP32.
            Keputusan mode otomatis diambil perangkat, bukan server, sehingga rumah hijau
            tetap berjalan walau backend mati.
          </p>
          <p className="text-[12px] text-[color:var(--color-fg-subtle)]">
            Green house Malam · design tokens dari PLANNING.md bagian 6
          </p>
        </section>
      </div>
    </div>
  );
}
