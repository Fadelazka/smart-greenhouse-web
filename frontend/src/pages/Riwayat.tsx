import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, GitCompare, TrendingDown, TrendingUp } from 'lucide-react';
import { HistoryChart } from '@/components/history/HistoryChart';
import { TimeRangePicker } from '@/components/history/TimeRangePicker';
import { useSensorStore } from '@/store/sensorStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { api, getToken } from '@/lib/api';
import {
  SENSOR_META,
  type HistoryPeriod,
  type HistoryPoint,
  type HistoryRange,
  type SensorName,
  type Thresholds,
} from '@/types';
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

function toPeriod(result: Awaited<ReturnType<typeof api.history>>): HistoryPeriod {
  return {
    range: result.range,
    offset: result.offset,
    bucketSeconds: result.bucketSeconds,
    from: result.from,
    to: result.to,
    points: result.points,
  };
}

/** Rata-rata tiap sensor, atau `null` untuk sensor yang tidak punya data. */
function averages(points: HistoryPoint[]): Record<SensorName, number | null> {
  const out = {} as Record<SensorName, number | null>;
  for (const sensor of SENSORS) {
    if (points.length === 0) {
      out[sensor] = null;
      continue;
    }
    out[sensor] = points.reduce((sum, p) => sum + p[sensor], 0) / points.length;
  }
  return out;
}

export function Riwayat() {
  const storeThresholds = useSensorStore((s) => s.thresholds);
  const reducedMotion = useReducedMotion();

  const [range, setRange] = useState<HistoryRange>('1h');
  const [compareOn, setCompareOn] = useState(false);
  const [compareRange, setCompareRange] = useState<HistoryRange>('24h');
  const [current, setCurrent] = useState<HistoryPeriod | null>(null);
  const [comparePeriod, setComparePeriod] = useState<HistoryPeriod | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(storeThresholds);
  const [active, setActive] = useState(EMPTY_ACTIVE);
  const [loading, setLoading] = useState(true);
  const [compareLoading, setCompareLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Periode pembanding memakai rentang yang sama persis dengan periode utama
   * agar tweak-nya tidak ambigu, dan baru bergeser ke `offset=1` kalau rentang
   * yang dipilih identik. Dua rentang berbeda tetap dibandingkan pada posisi
   * relatif, jadi hasilnya sah secara visual.
   */
  const compareOffset = compareRange === range ? 1 : 0;

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
        setCurrent(toPeriod(result));
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

  /**
   * Periode pembanding dimuat terpisah supaya periode utama tidak ikut
   * loading, dan kegagalan periode kedua tidak membatalkan grafik pertama.
   */
  useEffect(() => {
    if (!compareOn) {
      setComparePeriod(null);
      setCompareLoading(false);
      return;
    }

    let cancelled = false;
    setCompareLoading(true);

    void api
      .history(compareRange, compareOffset)
      .then((result) => {
        if (!cancelled) setComparePeriod(toPeriod(result));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setComparePeriod(null);
        setError(
          err instanceof Error
            ? `Gagal memuat periode pembanding: ${err.message}`
            : 'Gagal memuat periode pembanding',
        );
      })
      .finally(() => {
        if (!cancelled) setCompareLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [compareOn, compareRange, compareOffset]);

  const stats = useMemo(() => {
    const points = current?.points ?? [];
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
  }, [current]);

  /** Rata-rata periode pembanding, dipakai untuk baris pembanding di kartu ringkasan. */
  const compareAverages = useMemo(
    () => (comparePeriod ? averages(comparePeriod.points) : null),
    [comparePeriod],
  );

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

      if (!response.ok) {
        // Server membalas JSON untuk error, bukan CSV. Tampilkan pesan aslinya
        // supaya "Gagal mengunduh" tidak menutupi penyebab sebenarnya.
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Gagal mengunduh CSV (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `greenhouse-${range}.csv`;

      // Firefox hanya mengunduh link yang sudah menempel di DOM, dan revokeObjectURL
      // yang dipanggil sinkron setelah click bisa membatalkan unduhan sebelum
      // browser sempat membaca blob-nya.
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
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
            {current
              ? `${formatDateTime(current.from)} sampai ${formatDateTime(current.to)} · interval ${current.bucketSeconds} detik`
              : 'Memuat data historis...'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TimeRangePicker range={range} onRangeChange={setRange} />

          <button
            type="button"
            aria-pressed={compareOn}
            onClick={() => setCompareOn((prev) => !prev)}
            className={cn(
              'inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[13px] transition-colors',
              compareOn
                ? 'border-transparent bg-[color:var(--color-canopy)] text-[color:var(--color-bg-deep)]'
                : 'border-[color:var(--color-border-strong)] hover:border-[color:var(--color-canopy)]',
            )}
          >
            <GitCompare className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Bandingkan</span>
          </button>

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

      {compareOn && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[10px] border border-[color:var(--color-border)] bg-[color:var(--color-bg-deep)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-[color:var(--color-fg-subtle)]">Bandingkan dengan</span>
            <TimeRangePicker range={compareRange} onRangeChange={setCompareRange} />
          </div>

          <p className="text-[12px] text-[color:var(--color-fg-subtle)]">
            {compareLoading && 'Memuat periode pembanding...'}
            {!compareLoading && comparePeriod && (
              <>
                {formatDateTime(comparePeriod.from)} sampai {formatDateTime(comparePeriod.to)}
                {compareOffset > 0 && (
                  <span className="text-[color:var(--color-fg-muted)]">
                    {' '}
                    (periode sebelumnya)
                  </span>
                )}
              </>
            )}
            {!compareLoading && !comparePeriod && 'Belum ada data periode pembanding.'}
          </p>
        </div>
      )}

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
          current={current}
          compare={comparePeriod}
          active={active}
          thresholds={thresholds}
          loading={loading}
        />

        <p className="mt-3 text-[12px] text-[color:var(--color-fg-subtle)]">
          {compareOn && comparePeriod ? (
            <>
              Sumbu X memakai waktu relatif terhadap ujung periode, jadi kedua garis bisa
              Sumbu X memakai waktu relatif terhadap ujung periode, jadi kedua garis bisa
              dibandingkan meski panjang rentangnya berbeda. Garis putus-putus adalah periode
            </>
          ) : (
            <>
              Batang menunjukkan rata-rata per interval, garis menunjukkan tren. Area hijau
              menandai rentang ideal suhu.
            </>
          )}
        </p>
      </section>

      {stats && (
        <section aria-label="Ringkasan periode" className="mt-4 grid gap-4 sm:grid-cols-3">
          {SENSORS.filter((s) => active[s]).map((sensor, index) => {
            const stat = stats[sensor];
            const meta = SENSOR_META[sensor];
            const rising = (stat.delta ?? 0) > 0;
            const before = compareAverages?.[sensor] ?? null;
            const diff = before === null ? null : stat.avg - before;

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

                {compareAverages && before !== null && (
                  <div className="mt-3 border-t border-[color:var(--color-border)] pt-3 text-[12px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[color:var(--color-fg-subtle)]">vs pembanding</span>
                      <span className="value-tabular text-[color:var(--color-fg-muted)]">
                        {before.toFixed(1)}
                        {meta.unit}
                      </span>
                    </div>
                    {diff !== null && (
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-[color:var(--color-fg-subtle)]">Selisih</span>
                        <span
                          className="value-tabular font-medium"
                          style={{
                            color:
                              Math.abs(diff) < 0.05
                                ? 'var(--color-fg-muted)'
                                : diff > 0
                                  ? meta.accent
                                  : 'var(--color-sun)',
                          }}
                        >
                          {diff > 0 ? '+' : ''}
                          {diff.toFixed(1)}
                          {meta.unit}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </motion.article>
            );
          })}
        </section>
      )}
    </div>
  );
}
