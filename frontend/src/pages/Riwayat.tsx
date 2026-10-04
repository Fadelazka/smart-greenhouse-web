import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, TrendingDown, TrendingUp } from 'lucide-react';
import { HistoryChart } from '@/components/history/HistoryChart';
import { TimeRangePicker } from '@/components/history/TimeRangePicker';
import { useSensorStore } from '@/store/sensorStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { api, getToken } from '@/lib/api';
import { SENSOR_META, type HistoryRange, type SensorName, type Thresholds } from '@/types';
import { cn, formatDateTime } from '@/lib/utils';

const SENSORS: SensorName[] = ['suhu', 'humUdara', 'humTanah'];

const DEFAULT_THRESHOLDS: Thresholds = {
  suhu: { min: 18, max: 32 },
  humUdara: { min: 50, max: 85 },
  humTanah: { min: 40, max: 75 },
};

const EMPTY_ACTIVE: Record<SensorName, boolean> = {
  suhu: true,
  humUdara: true,
  humTanah: true,
};

type HistoryState = {
  points: Awaited<ReturnType<typeof api.history>>['points'];
  bucketSeconds: number;
  from: string;
  to: string;
};

export function Riwayat() {
  const storeThresholds = useSensorStore((s) => s.thresholds);
  const reducedMotion = useReducedMotion();

  const [range, setRange] = useState<HistoryRange>('1h');
  const [history, setHistory] = useState<HistoryState | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(storeThresholds);
  const [active, setActive] = useState(EMPTY_ACTIVE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (storeThresholds) setThresholds(storeThresholds);
  }, [storeThresholds]);

  useEffect(() => {
    if (thresholds) return;
    let cancelled = false;

    void api
      .settings()
      .then((settings) => {
        if (!cancelled) setThresholds(settings.thresholds);
      })
      .catch(() => {
        if (!cancelled) setThresholds(DEFAULT_THRESHOLDS);
      });

    return () => {
      cancelled = true;
    };
  }, [thresholds]);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    void api
      .history(range)
      .then((result) => {
        if (cancelled) return;
        setHistory({
          points: result.points,
          bucketSeconds: result.bucketSeconds,
          from: result.from,
          to: result.to,
        });
        setThresholds(result.thresholds);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Gagal memuat riwayat');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [range]);

  const stats = useMemo(() => {
    const points = history?.points ?? [];
    if (points.length === 0) return null;

    const result = {} as Record<SensorName, { min: number; max: number; avg: number; delta: number | null }>;

    for (const sensor of SENSORS) {
      const values = points.map((p) => p[sensor]);
      const first = values[0];
      const last = values[values.length - 1];
      result[sensor] = {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((sum, v) => sum + v, 0) / values.length,
        delta: first === last ? null : last - first,
      };
    }

    return result;
  }, [history]);

  const toggleSensor = useCallback((sensor: SensorName) => {
    setActive((prev) => {
      // Jangan biarkan semua sensor disembunyikan, grafik jadi kosong tanpa konteks.
      const enabled = SENSORS.filter((s) => prev[s]);
      if (enabled.length === 1 && prev[sensor]) return prev;
      return { ...prev, [sensor]: !prev[sensor] };
    });
  }, []);

  async function downloadCsv() {
    const token = getToken();
    if (!token) return;

    try {
      const response = await fetch(api.exportUrl(range), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Gagal mengunduh CSV');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `greenhouse-${range}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunduh CSV');
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-[clamp(20px,3vw,28px)]">Riwayat</h1>
          <p className="mt-1 text-[14px] text-[color:var(--color-fg-muted)]">
            {history
              ? `${formatDateTime(history.from)} sampai ${formatDateTime(history.to)} · interval ${history.bucketSeconds} detik`
              : 'Memuat data historis...'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TimeRangePicker range={range} onRangeChange={setRange} />
          <button
            type="button"
            onClick={() => void downloadCsv()}
            className="inline-flex items-center gap-2 rounded-[10px] border border-[color:var(--color-border-strong)] px-3 py-2 text-[13px] transition-colors hover:border-[color:var(--color-canopy)]"
          >
            <Download className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Unduh CSV</span>
          </button>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-[10px] border border-[color:color-mix(in_oklab,var(--color-destructive)_40%,transparent)] bg-[color:color-mix(in_oklab,var(--color-destructive)_12%,transparent)] px-3 py-2 text-[13px] text-[color:var(--color-destructive)]"
        >
          {error}
        </p>
      )}

      <section aria-label="Grafik riwayat" className="glass p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {SENSORS.map((sensor) => {
            const meta = SENSOR_META[sensor];
            const on = active[sensor];
            return (
              <button
                key={sensor}
                type="button"
                aria-pressed={on}
                onClick={() => toggleSensor(sensor)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-colors',
                  on
                    ? 'border-transparent'
                    : 'border-[color:var(--color-border)] text-[color:var(--color-fg-subtle)] hover:text-[color:var(--color-fg-muted)]',
                )}
                style={
                  on
                    ? {
                        color: meta.accent,
                        backgroundColor: `color-mix(in oklab, ${meta.accent} 14%, transparent)`,
                      }
                    : undefined
                }
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: on ? meta.accent : 'currentColor', opacity: on ? 1 : 0.5 }}
                />
                {meta.label}
              </button>
            );
          })}
        </div>

        <HistoryChart
          points={history?.points ?? []}
          active={active}
          thresholds={thresholds}
          bucketSeconds={history?.bucketSeconds ?? 60}
          loading={loading}
        />

        <p className="mt-3 text-[12px] text-[color:var(--color-fg-subtle)]">
          Batang menunjukkan rata-rata per interval, garis menunjukkan tren. Area hijau
          menandai rentang ideal suhu.
        </p>
      </section>

      {stats && (
        <section aria-label="Ringkasan periode" className="mt-4 grid gap-4 sm:grid-cols-3">
          {SENSORS.filter((s) => active[s]).map((sensor, index) => {
            const stat = stats[sensor];
            const meta = SENSOR_META[sensor];
            const rising = (stat.delta ?? 0) > 0;

            return (
              <motion.article
                key={sensor}
                initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: reducedMotion ? 0 : index * 0.05 }}
                className="glass p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[13px] text-[color:var(--color-fg-muted)]">{meta.label}</h2>
                  {stat.delta !== null && (
                    <span
                      className="value-tabular inline-flex items-center gap-1 text-[12px]"
                      style={{ color: rising ? meta.accent : 'var(--color-fg-subtle)' }}
                    >
                      {rising ? (
                        <TrendingUp className="size-3.5" aria-hidden="true" />
                      ) : (
                        <TrendingDown className="size-3.5" aria-hidden="true" />
                      )}
                      {rising ? '+' : ''}
                      {stat.delta.toFixed(1)}
                      {meta.unit}
                    </span>
                  )}
                </div>

                <p
                  className="value-tabular mt-2 font-[family-name:var(--font-display)] text-[30px] leading-none font-semibold"
                  style={{ color: meta.accent }}
                >
                  {stat.avg.toFixed(1)}
                  <span className="ml-1 text-[15px] font-normal text-[color:var(--color-fg-muted)]">
                    rata-rata {meta.unit}
                  </span>
                </p>

                <dl className="mt-3 flex gap-5 text-[12px]">
                  <div>
                    <dt className="text-[color:var(--color-fg-subtle)]">Min</dt>
                    <dd className="value-tabular">
                      {stat.min.toFixed(1)}
                      {meta.unit}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[color:var(--color-fg-subtle)]">Maks</dt>
                    <dd className="value-tabular">
                      {stat.max.toFixed(1)}
                      {meta.unit}
                    </dd>
                  </div>
                  {thresholds && (
                    <div>
                      <dt className="text-[color:var(--color-fg-subtle)]">Ideal</dt>
                      <dd className="value-tabular">
                        {thresholds[sensor].min}–{thresholds[sensor].max}
                        {meta.unit}
                      </dd>
                    </div>
                  )}
                </dl>
              </motion.article>
            );
          })}
        </section>
      )}
    </div>
  );
}