import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, LineChart as LineChartIcon } from 'lucide-react';
import { useSensorStore } from '@/store/sensorStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { SensorCard } from '@/components/sensor/SensorCard';
import { ConnectionCard } from '@/components/sensor/ConnectionCard';
import { ActuatorControl } from '@/components/control/ActuatorControl';
import { ModeToggle } from '@/components/control/ModeToggle';
import { LiveTrendChart } from '@/components/history/LiveTrendChart';
import { api } from '@/lib/api';
import { cn, formatTime } from '@/lib/utils';
import type { ActuatorName, Telemetry, Thresholds } from '@/types';

const DEFAULT_THRESHOLDS: Thresholds = {
  suhu: { min: 18, max: 30 },
  humUdara: { min: 60, max: 85 },
  humTanah: { min: 40, max: 70 },
};

const SENSORS = ['suhu', 'humUdara', 'humTanah'] as const;

const ACTUATORS: ActuatorName[] = ['pump', 'fan', 'light'];

export function Dashboard() {
  const telemetry = useSensorStore((s) => s.telemetry);
  const buffer = useSensorStore((s) => s.buffer);
  const thresholds = useSensorStore((s) => s.thresholds);
  const actuators = useSensorStore((s) => s.actuators);
  const setActuator = useSensorStore((s) => s.actions.setActuator);
  const online = useSensorStore((s) => s.online);
  const mode = useSensorStore((s) => s.mode);

  const reducedMotion = useReducedMotion();
  const [fallbackThresholds, setFallbackThresholds] = useState<Thresholds | null>(null);

  const effectiveThresholds = thresholds ?? fallbackThresholds;
  const bufferSpan = formatBufferSpan(buffer);

  useEffect(() => {
    if (thresholds || fallbackThresholds) return;
    let cancelled = false;

    void api
      .settings()
      .then((settings) => {
        if (!cancelled) setFallbackThresholds(settings.thresholds);
      })
      .catch(() => {
        if (!cancelled) setFallbackThresholds(DEFAULT_THRESHOLDS);
      });

    return () => {
      cancelled = true;
    };
  }, [thresholds, fallbackThresholds]);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-[clamp(20px,3vw,28px)]">
              Dashboard
            </h1>
            <p className="mt-1 text-[14px] text-[color:var(--color-fg-muted)]">
              {telemetry
                ? `Data terakhir ${formatTime(telemetry.ts)} · RSSI ${telemetry.rssi} dBm`
                : 'Menunggu data pertama dari ESP32...'}
            </p>
          </div>

          <span
            className={cn(
              'rounded-full border px-3 py-1 text-[12px]',
              mode === 'auto'
                ? 'border-[color:color-mix(in_oklab,var(--color-canopy)_45%,transparent)] text-[color:var(--color-canopy)]'
                : 'border-[color:color-mix(in_oklab,var(--color-sun)_45%,transparent)] text-[color:var(--color-sun)]',
            )}
          >
            Mode {mode === 'auto' ? 'otomatis' : 'manual'}
          </span>
        </div>
      </header>

      {/* Empat kartu: tiga sensor lingkungan + satu koneksi. xl dipakai karena
          di layar sempit kartu keempat turun ke baris sendiri, bukan squeeze. */}
      <section
        aria-label="Pembacaan sensor dan koneksi"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {SENSORS.map((sensor, index) => (
          <motion.div
            key={sensor}
            initial={reducedMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: reducedMotion ? 0 : index * 0.06 }}
          >
            <SensorCard
              sensor={sensor}
              value={telemetry ? telemetry[sensor] : null}
              buffer={buffer}
              threshold={effectiveThresholds?.[sensor] ?? null}
            />
          </motion.div>
        ))}

        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: reducedMotion ? 0 : SENSORS.length * 0.06 }}
        >
          <ConnectionCard />
        </motion.div>
      </section>

      <section aria-label="Tren langsung" className="glass mt-4 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-[16px]">
              <LineChartIcon className="size-4 text-[color:var(--color-canopy)]" aria-hidden="true" />
              Tren langsung
            </h2>
            <p className="mt-1 text-[13px] text-[color:var(--color-fg-muted)]">
              Grafik buffered di peramban, langsung terisi setiap laporan sensor tanpa
              perlu memuat ulang halaman.
            </p>
          </div>

          <Link
            to="/riwayat"
            className="inline-flex items-center gap-1.5 self-start rounded-[10px] border border-[color:var(--color-border-strong)] px-3 py-1.5 text-[12px] text-[color:var(--color-fg-muted)] transition-colors hover:bg-[color:var(--color-surface-raised)]"
          >
            Lihat riwayat lengkap
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        <LiveTrendChart buffer={buffer} thresholds={effectiveThresholds} />

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[color:var(--color-fg-subtle)]">
          <span>{buffer.length} sampel terakhir</span>
          {/* Buffer dibatasi 300 titik, jadi rentang 1 jam-7 hari tidak akan
              menambah data di sini. Tampilkan rentang waktu nyata supaya label
              tidak menjanjikan data yang tidak ada. */}
          {bufferSpan && <span>{bufferSpan}</span>}
          <Link
            to="/riwayat"
            className="inline-flex items-center gap-1 text-[color:var(--color-canopy)] hover:underline"
          >
            Riwayat lengkap
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Mode menentukan siapa yang memutuskan aktuator di bawah, jadi
          diletakkan tepat di atasnya, bukan di header yang jauh dari konteks. */}
      <ModeToggle />

      <section aria-label="Kontrol aktuator" className="mt-4 grid gap-4 lg:grid-cols-3">
        {ACTUATORS.map((actuator) => (
          <ActuatorControl
            key={actuator}
            actuator={actuator}
            state={actuators[actuator]}
            disabled={!online}
            onLocalState={setActuator}
          />
        ))}
      </section>
    </div>
  );
}

/**
 * Rentang waktu yang benar-benar tercakup buffer, bukan rentang yang dipilih.
 *
 * Buffer berisi 300 laporan terakhir, jadi sekitar 10 menit pada interval
 * simulator 2 detik. Label "jendela 7 hari" di sini akan berbohong, karena
 * grafik tidak pernah menarik lebih dari 300 titik.
 */
function formatBufferSpan(buffer: Telemetry[]): string | null {
  if (buffer.length < 2) return null;

  const first = new Date(buffer[0].ts).getTime();
  const last = new Date(buffer[buffer.length - 1].ts).getTime();
  const minutes = Math.round((last - first) / 60_000);

  if (minutes < 1) return 'kurang dari 1 menit terakhir';
  if (minutes < 60) return `${minutes} menit terakhir`;
  return `${(minutes / 60).toFixed(1).replace('.', ',')} jam terakhir`;
}