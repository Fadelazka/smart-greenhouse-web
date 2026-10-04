import { useEffect, useRef, useState } from 'react';
import { Cpu, Droplet, Gauge, History, Monitor, Pin, RotateCcw, Thermometer, Zap } from 'lucide-react';
import { HARDWARE_PARTS, HARDWARE_WIRES, STATUS_LABEL } from './hardwareData';
import { ComponentMiniPreview } from './ComponentMiniPreview';
import { useHardwareLogStore } from '@/store/hardwareLogStore';
import { selectReading, useSensorStore } from '@/store/sensorStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HardwareVerdict } from './useHardwareStatus';
import type { HardwareComponentId, HardwareStatus } from '@/types';

/**
 * Detail lengkap satu komponen yang sedang dipilih.
 *
 * Isinya lima blok, diurut dari yang paling sering dibutuhkan ke yang paling
 * jarang: identitas, fungsi, pemetaan pin, pembacaan langsung, lalu riwayat
 * status. Urutan ini berdampingan dengan panel Log di sebelahnya: log menjawab
 * "apa yang terjadi terakhir", panel ini menjawab "bagaimana perangkat ini
 * bekerja".
 */

const STATUS_VARIANT: Record<HardwareStatus, 'success' | 'warning' | 'destructive'> = {
  normal: 'success',
  warning: 'warning',
  error: 'destructive',
};

type IconComponent = typeof Cpu;

const ICONS: Record<HardwareComponentId, IconComponent> = {
  esp32: Cpu,
  dht22: Thermometer,
  potentiometer: Droplet,
  relay: Zap,
  lcd: Monitor,
};

/** Pin daya dan ground, tidak dianggap pin sinyal. */
const POWER_PINS = new Set(['3V3', '5V', 'VCC', 'GND']);

/**
 * Pin milik komponen ini yang membawa sinyal, bukan daya.
 *
 * Diturunkan dari `HARDWARE_WIRES`, bukan ditulis manual, supaya tabel pin
 * tetap benar kalau wiring digambar ulang. Untuk ESP32, label pin pada
 * `HARDWARE_PARTS` sama persis dengan `toPin` di kabel.
 */
function signalPins(component: HardwareComponentId): Set<string> {
  const result = new Set<string>();

  for (const wire of HARDWARE_WIRES) {
    if (wire.from === component && !POWER_PINS.has(wire.fromPin)) result.add(wire.fromPin);
    if (wire.to === component && !POWER_PINS.has(wire.toPin)) result.add(wire.toPin);
  }

  return result;
}

/**
 * Komponen yang terhubung ke sebuah pin ESP32.
 *
 * Untuk pin bersama seperti GND dan 3V3, satu pin dipakai beberapa modul,
 * jadi semuanya dikumpulkan dan digabung jadi satu nama per modul.
 */
function espPinTargets(espPin: string): string[] {
  const names = new Set<string>();

  for (const wire of HARDWARE_WIRES) {
    if (wire.to === 'esp32' && wire.toPin === espPin) {
      names.add(HARDWARE_PARTS[wire.from].shortName);
    }
  }

  return [...names];
}

/** Fungsi pin kalau `note` pada data tidak mengatakannya. */
function pinFunction(label: string, note?: string): string {
  if (note) return note;
  if (label === 'GND') return 'Ground, 0 volt';
  if (label === '3V3') return 'Catu daya 3.3 volt';
  if (label === 'VCC') return 'Catu daya dari pin 3V3';
  return 'Tidak keterangan';
}

/** Warna tepi sesuai status, dipakai pada bingkai pratinjau. */
const FRAME: Record<HardwareStatus, string> = {
  normal: 'border-success/35',
  warning: 'border-warning/40',
  error: 'border-destructive/45',
};

export function ComponentDetailFull({
  component,
  verdict,
  still,
  onClear,
}: {
  component: HardwareComponentId;
  verdict: HardwareVerdict;
  still: boolean;
  onClear: () => void;
}) {
  const forced = useHardwareLogStore((s) => s.forced);
  const part = HARDWARE_PARTS[component];
  const current = verdict[component];
  const Icon = ICONS[component];
  const isForced = forced[component] !== undefined;

  return (
    <div className="flex flex-col gap-4">
      {/*
        Header: pratinjau di kiri, identitas dan status di kanan.
        Di bawah 768px (`max-sm:`) become bertumpuk dan pratinjau melebar
        penuh, karena 160px di layar sempit hanya-serobot ruang.
      */}
      <div className="flex max-sm:flex-col-reverse max-sm:items-stretch gap-4">
        <div className={cn('shrink-0 rounded-xl border bg-card/40 p-1', FRAME[current.status])}>
          <ComponentMiniPreview
            component={component}
            still={still}
            size={160}
            className="max-sm:aspect-square max-sm:h-auto max-sm:w-full"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12">
              <Icon className="size-4.5 text-primary" aria-hidden />
            </span>
            <h3 className="min-w-0 text-[20px] font-bold leading-tight tracking-tight text-foreground">
              {part.name}
            </h3>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[current.status]} className="text-[12px]">
              {STATUS_LABEL[current.status]}
            </Badge>
            <span className="font-[family-name:var(--font-mono)] text-[11px] text-fg-subtle">
              {part.shortName}
            </span>
          </div>

          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            {part.description}
          </p>
        </div>
      </div>

      {isForced && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 font-[family-name:var(--font-mono)] text-[11px] text-warning">
          Status dipaksa dari Dev Mode
        </p>
      )}

      <div className="rounded-lg border border-border bg-surface-soft/50 px-3 py-2.5">
        <p className="text-[12px] leading-relaxed text-foreground">{current.reason}</p>
      </div>

      <PinTable component={component} />
      <LiveReadings component={component} still={still} />
      <StatusHistory component={component} />

      <Button variant="ghost" size="sm" onClick={onClear} className="w-full">
        <RotateCcw className="size-3.5" aria-hidden />
        Reset Pilihan
      </Button>
    </div>
  );
}

/**
 * Tabel pemetaan pin.
 *
 * Untuk modul, kolom pertama adalah pin modul dan kolom kedua pin ESP32.
 * Untuk ESP32 sendiri kedua kolom itu identik, jadi kolom pertama diganti
 * menjadi daftar modul yang terhubung ke pin tersebut, yang jauh lebih berguna
 * saat troubleshoting.
 */
function PinTable({ component }: { component: HardwareComponentId }) {
  const part = HARDWARE_PARTS[component];
  const isEsp32 = component === 'esp32';
  const signals = signalPins(component);

  return (
    <section>
      <h4 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Pin className="size-3.5" aria-hidden />
        Pemetaan Pin
      </h4>

      {/*
        `overflow-x-auto` supaya tabel bisa digeser di layar sempit alih-alih
        memaksa panel melebar. `min-w-full` pada tabel menjaga lebarnya
        mengikuti kolom saat tidak ada yang perlu digeser.
      */}
      <div className="mt-2 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[420px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-primary/12">
              <Th>{isEsp32 ? 'Pin ESP32' : 'Pin Komponen'}</Th>
              <Th>{isEsp32 ? 'Terhubung ke' : 'Pin ESP32'}</Th>
              <Th>Fungsi</Th>
            </tr>
          </thead>
          <tbody>
            {part.pins.map((pin, index) => {
              const isSignal = signals.has(pin.label);
              const targets = isEsp32 ? espPinTargets(pin.label) : [];
              return (
                <tr
                  key={pin.label}
                  className={cn(
                    'border-b border-border/50 last:border-b-0',
                    // Zebra halus agar baris yang panjang masih bisa dibaca
                    // tanpa mengandalkan warna teks yang lebih terang.
                    index % 2 === 1 && 'bg-surface-soft/30',
                    // Border kiri menandai baris yang membawa sinyal, supaya
                    // penandanya tidak bergantung pada warna latar saja.
                    isSignal && 'border-l-2 border-l-primary bg-primary/8',
                  )}
                >
                  <Td mono>{pin.label}</Td>
                  <Td mono>
                    {isEsp32 ? (targets.length > 0 ? targets.join(', ') : 'Tidak dipakai') : pin.espPin}
                  </Td>
                  <Td>{pinFunction(pin.label, pin.note)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-1.5 text-[11px] text-fg-subtle">
        Baris dengan garis hijau kiri membawa sinyal, sedangkan 3V3 dan GND hanya catu daya.
      </p>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-2.5 py-1.5 font-[family-name:var(--font-mono)] text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
      {children}
    </th>
  );
}

function Td({
  children,
  mono,
}: {
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <td
      className={cn(
        'px-2.5 py-1.5 align-top text-[11px] leading-relaxed',
        mono ? 'font-[family-name:var(--font-mono)] text-foreground' : 'text-muted-foreground',
      )}
    >
      {children}
    </td>
  );
}

/** Pembacaan langsung dari telemetry. */
function LiveReadings({ component, still }: { component: HardwareComponentId; still: boolean }) {
  const firmware = useSensorStore((s) => s.firmware);
  const uptime = useSensorStore((s) => s.uptime);
  const online = useSensorStore((s) => s.online);
  const lastSeen = useSensorStore((s) => s.lastSeen);
  const pump = useSensorStore((s) => s.actuators.pump);

  // Sensor analog dijadikan kartu angka besar; status biner tetap memakai
  // baris label-value karena tidak ada angka yang perlu dianimasikan.
  if (component === 'dht22' || component === 'potentiometer') {
    return <SensorCards component={component} still={still} />;
  }

  const rows: Array<{ label: string; value: string }> = [];

  if (component === 'esp32') {
    rows.push(
      { label: 'Koneksi', value: online ? 'Online' : 'Offline' },
      { label: 'Firmware', value: firmware },
      { label: 'Uptime', value: `${Math.floor(uptime / 3600)}j ${Math.floor((uptime % 3600) / 60)}m` },
      {
        label: 'Terakhir Seen',
        value: lastSeen === null ? 'Belum pernah' : `${Math.round((Date.now() - lastSeen) / 1000)} dtk lalu`,
      },
    );
  } else if (component === 'relay') {
    rows.push({ label: 'Pompa', value: pump === 'on' ? 'Aktif' : 'Idle' });
  } else {
    rows.push(
      { label: 'Baris 1', value: 'M:xx% T:xx.xC' },
      { label: 'Baris 2', value: `PUMP: ${pump === 'on' ? 'ACTIVE' : 'IDLE'}` },
    );
  }

  return (
    <section>
      <h4 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Gauge className="size-3.5" aria-hidden />
        Pembacaan
      </h4>
      <dl className="mt-2 flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-[12px] text-muted-foreground">{row.label}</dt>
            <dd className="font-[family-name:var(--font-mono)] text-[12px] text-foreground">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Kartu angka besar untuk sensor analog. */
function SensorCards({ component, still }: { component: HardwareComponentId; still: boolean }) {
  const telemetry = useSensorStore((s) => s.telemetry);

  if (component === 'dht22') {
    return (
      <section>
        <h4 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Thermometer className="size-3.5" aria-hidden />
          Pembacaan
        </h4>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <ReadingCard
            icon={Thermometer}
            label="Suhu"
            unit="C"
            value={selectReading(telemetry, 'suhu')}
            decimals={1}
            still={still}
          />
          <ReadingCard
            icon={Droplet}
            label="Lembap udara"
            unit="%"
            value={selectReading(telemetry, 'humUdara')}
            decimals={1}
            still={still}
          />
        </div>
      </section>
    );
  }

  const moisture = selectReading(telemetry, 'humTanah');

  return (
    <section>
      <h4 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Droplet className="size-3.5" aria-hidden />
        Pembacaan
      </h4>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <ReadingCard
          icon={Droplet}
          label="Kelembapan tanah"
          unit="%"
          value={moisture}
          decimals={1}
          still={still}
        />
        {/* ADC mentah bukan sensor terpisah, jadi ditampilkan sebagai
            catatan kecil di bawah kartu utama. */}
        <div className="flex flex-col justify-center rounded-lg border border-border px-2.5 py-2">
          <span className="text-[11px] text-muted-foreground">ADC mentah</span>
          <span className="mt-0.5 font-[family-name:var(--font-mono)] text-[13px] text-foreground">
            {moisture === null ? 'Belum ada data' : Math.round((moisture / 100) * 4095)}
          </span>
        </div>
      </div>
    </section>
  );
}

/** Satu kartu: ikon, label, angka besar, dan satuan. */
function ReadingCard({
  icon: Icon,
  label,
  value,
  unit,
  decimals,
  still,
}: {
  icon: IconComponent;
  label: string;
  value: number | null;
  unit: string;
  decimals: number;
  still: boolean;
}) {
  const shown = useCountUp(value, still);

  return (
    <div className="rounded-lg border border-border bg-surface-soft/40 px-2.5 py-2">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </span>
      {value === null ? (
        <span className="mt-0.5 block font-[family-name:var(--font-mono)] text-[13px] text-fg-subtle">
          Belum ada data
        </span>
      ) : (
        <span className="mt-0.5 block font-[family-name:var(--font-mono)] text-[18px] leading-tight text-foreground">
          {shown.toFixed(decimals)}
          <span className="ml-0.5 text-[12px] text-muted-foreground">{unit}</span>
        </span>
      )}
    </div>
  );
}

/**
 * Angka yang menghitung naik dari nilai lama ke nilai baru.
 *
 * Animasi ini memakai `requestAnimationFrame` dan tidak aktif saat pengguna
 * mengaktifkan reduced motion, karena gerakan terus-menerus di panel yang
 * yang diperbarui setiap beberapa detik adalah jenis konten yang mengganggu
 * orang dengan gangguan vestibular.
 */
function useCountUp(target: number | null, still: boolean): number {
  const [shown, setShown] = useState(target ?? 0);
  const fromRef = useRef(target ?? 0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === null) return;
    if (still) {
      setShown(target);
      return;
    }

    const from = fromRef.current;
    // Nilai sudah hampir sama: melompat langsung lebih halus daripada
    // menjalankan animasi yang tidak terlihat.
    if (Math.abs(target - from) < 0.05) {
      fromRef.current = target;
      setShown(target);
      return;
    }

    const startedAt = performance.now();
    const duration = 420;

    const step = (now: number) => {
      const t = Math.min((now - startedAt) / duration, 1);
      // easeOutCubic supaya gerak melambat di akhir, tidak berhenti mendadak.
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from + (target - from) * eased;
      setShown(value);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, still]);

  return target === null ? 0 : shown;
}

/** Riwayat perubahan status terakhir untuk komponen ini saja. */
function StatusHistory({ component }: { component: HardwareComponentId }) {
  const entries = useHardwareLogStore((s) => s.entries);
  // Store menyimpan entri terbaru lebih dulu, jadi slice tanpa perlu diurutkan.
  const mine = entries.filter((entry) => entry.component === component).slice(0, 5);

  return (
    <section>
      <h4 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        <History className="size-3.5" aria-hidden />
        Riwayat Status
      </h4>

      {mine.length === 0 ? (
        <p className="mt-2 rounded-lg border border-border px-3 py-2.5 text-[12px] text-muted-foreground">
          Belum ada perubahan status untuk komponen ini.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {mine.map((entry) => (
            <li
              key={entry.id}
              className={cn(
                'flex items-start justify-between gap-2 rounded-md border border-border/70',
                // Garis kiri memakai severity tujuan, jadi urutan waktu bisa
                // dibaca tanpa harus membaca setiap badge.
                'border-l-2 bg-surface-soft/30 py-1.5 pl-2.5 pr-2.5',
                EDGE[entry.to],
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Badge variant={STATUS_VARIANT[entry.to]} className="px-1.5 py-0 text-[10px]">
                    {STATUS_LABEL[entry.to]}
                  </Badge>
                  <span className="truncate text-[11px] text-muted-foreground">
                    dari {STATUS_LABEL[entry.from]}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-foreground">{entry.reason}</p>
              </div>
              <span className="shrink-0 pt-0.5 font-[family-name:var(--font-mono)] text-[10px] text-fg-subtle">
                {formatTime(entry.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Garis kiri riwayat, mengikuti severity status tujuan. */
const EDGE: Record<HardwareStatus, string> = {
  normal: 'border-l-success',
  warning: 'border-l-warning',
  error: 'border-l-destructive',
};

/** Jam lokal 24 jam tanpa detik, sama dengan panel Log. */
function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
