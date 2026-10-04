import { useMemo } from 'react';
import {
  Area,
  Bar,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSensorStore } from '@/store/sensorStore';
import {
  SENSOR_META,
  type HistoryPeriod,
  type HistoryPoint,
  type SensorName,
  type Thresholds,
} from '@/types';
import { formatOffset, formatTime } from '@/lib/utils';
import { LeafTooltip } from './LeafTooltip';

const SENSORS: SensorName[] = ['suhu', 'humUdara', 'humTanah'];

/** Kunci dataKey seri periode pembanding. */
type CompareKey = `${SensorName}__compare`;

const compareKey = (sensor: SensorName): CompareKey => `${sensor}__compare`;

/**
 * Satu baris grafik saat mode compare aktif.
 *
 * Kedua periode diselaraskan ke sumbu waktu relatif: baris ke-i mewakili
 * persentase yang sama dari akhir periode masing-masing, bukan jam yang sama.
 * Dengan begitu periode dengan panjang berbeda tetap bisa dibandingkan karena
 * yang dipakai adalah posisi relatif, bukan timestamp absolut.
 */
type CompareRow = {
  offsetLabel: string;
  /** Waktu absolut dari periode terkini pada baris ini. */
  timeCurrent: string;
  /** Waktu absolut dari periode pembanding pada baris ini. */
  timeCompare: string;
} & Partial<Record<SensorName | CompareKey, number>>;

type Props = {
  current: HistoryPeriod | null;
  compare: HistoryPeriod | null;
  active: Record<SensorName, boolean>;
  thresholds: Thresholds | null;
  loading: boolean;
};

/**
 * Histogram + garis per sensor.
 *
 * Sumbu Y kiri untuk suhu (°C), sumbu Y kanan untuk kelembapan (%). Bucket
 * AGO mengirim rata-rata, jadi batang mewakili rata-rata dalam interval itu
 * sementara garis smoothed memperlihatkan tren halus.
 *
 * Saat `compare` diisi, batang disembunyikan dan periode pembanding digambar
 * sebagai garis putus-putus di atas garis periode terkini, karena membandingkan
 * dua tren jauh lebih terbaca daripada membandingkan dua histogram.
 */
export function HistoryChart({ current, compare, active, thresholds, loading }: Props) {
  const liveBuffer = useSensorStore((s) => s.buffer);

  /**
   * Periode terkini digabung dengan buffer live supaya grafik tidak terlihat
   * berhenti saat bucket terakhir sudah lama. Hanya berlaku di mode biasa:
   * pada mode compare, buffer live hanya boleh masuk ke periode terkini dan
   * tidak boleh menggeser titik-titiknya.
   */
  const data = useMemo<HistoryPoint[]>(() => {
    const points = current?.points ?? [];
    if (compare || liveBuffer.length === 0) return points;

    const last = points.at(-1);
    // Kalau bucket terakhir masih "segar", data live akan menggandakan titik.
    if (last && Date.now() - new Date(last.time).getTime() < (current?.bucketSeconds ?? 60) * 1000) {
      return points;
    }

    return [
      ...points,
      ...liveBuffer.map((t) => ({
        time: t.ts,
        suhu: t.suhu,
        humUdara: t.humUdara,
        humTanah: t.humTanah,
        samples: 1,
      })),
    ];
  }, [current, compare, liveBuffer]);

  const visible = SENSORS.filter((sensor) => active[sensor]);
  const humidityVisible = visible.includes('humUdara') || visible.includes('humTanah');

  /**
   * Gabung dua periode pada sumbu waktu relatif.
   *
   * Jumlah baris diambil dari periode yang lebih panjang supaya periode pendek
   * tidak membuat periode panjang terlihat terpotong. Indeks tiap periode
   * dihitung dari fraksi baris yang sama, jadi bucket yang berbeda besar
   * (12 detik untuk 1 jam vs 30 menit untuk 7 hari) tetap sejajar.
   */
  const compareRows = useMemo<CompareRow[] | null>(() => {
    if (!compare || !current) return null;

    const base = data;
    const other = compare.points;
    if (base.length === 0 || other.length === 0) return null;

    const size = Math.max(base.length, other.length);
    const endMs = new Date(current.to).getTime();
    const pick = (source: HistoryPoint[], index: number) =>
      source[Math.round((index / (size - 1)) * (source.length - 1))] ?? source[source.length - 1];

    return Array.from({ length: size }, (_, index) => {
      const a = pick(base, index);
      const b = pick(other, index);

      const row: CompareRow = {
        offsetLabel: formatOffset(endMs - new Date(a.time).getTime()),
        timeCurrent: a.time,
        timeCompare: b.time,
      };
      for (const sensor of SENSORS) {
        row[sensor] = a[sensor];
        row[compareKey(sensor)] = b[sensor];
      }
      return row;
    });
  }, [compare, current, data]);

  const isCompare = compareRows !== null;

  /** Nama seri untuk legend, dibedakan periode saat mode compare aktif. */
  const seriesLabel = (sensor: SensorName, isCompareSeries: boolean): string => {
    const base = SENSOR_META[sensor].label;
    if (!isCompareSeries) return base;
    return `${base} (${compareLabel(compare)})`;
  };

  const chartData = isCompare ? compareRows : data;
  const xKey = isCompare ? 'offsetLabel' : 'time';

  if (loading && data.length === 0) {
    return <div className="skeleton h-[320px] w-full" />;
  }

  if (data.length === 0) {
    return (
      <div className="grid h-[320px] place-items-center rounded-[10px] border border-dashed border-[color:var(--color-border-strong)]">
        <p className="text-[14px] text-[color:var(--color-fg-muted)]">
          Belum ada data pada rentang ini.
        </p>
      </div>
    );
  }

  if (isCompare && compareRows.length === 0) {
    return (
      <div className="grid h-[320px] place-items-center rounded-[10px] border border-dashed border-[color:var(--color-border-strong)]">
        <p className="text-[14px] text-[color:var(--color-fg-muted)]">
          Periode pembanding tidak punya data pada rentang tersebut.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 12, right: 8, bottom: 4, left: -12 }}>
          <defs>
            {SENSORS.map((sensor) => (
              <linearGradient
                key={sensor}
                id={`history-fill-${sensor}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={SENSOR_META[sensor].accent} stopOpacity={0.28} />
                <stop offset="100%" stopColor={SENSOR_META[sensor].accent} stopOpacity={0.01} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid stroke="rgba(240,253,244,0.07)" vertical={false} />

          <XAxis
            dataKey={xKey}
            stroke="var(--color-fg-subtle)"
            tick={{ fontSize: 11, fill: 'var(--color-fg-subtle)' }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(240,253,244,0.12)' }}
            tickFormatter={
              isCompare ? undefined : (value: string) => formatTime(value)
            }
            minTickGap={28}
          />

          <YAxis
            yAxisId="temp"
            stroke="var(--color-sun)"
            tick={{ fontSize: 11, fill: 'var(--color-fg-subtle)' }}
            tickLine={false}
            axisLine={false}
            width={46}
            unit="°"
            domain={['dataMin - 2', 'dataMax + 2']}
          />

          {humidityVisible && (
            <YAxis
              yAxisId="humidity"
              orientation="right"
              stroke="var(--color-water)"
              tick={{ fontSize: 11, fill: 'var(--color-fg-subtle)' }}
              tickLine={false}
              axisLine={false}
              width={42}
              unit="%"
              domain={['dataMin - 5', 'dataMax + 5']}
            />
          )}

          <Tooltip
            content={<HistoryTooltip compare={isCompare} compareLabel={compareLabel(compare)} />}
            cursor={{ stroke: 'var(--color-fg-subtle)', strokeDasharray: '4 4' }}
          />

          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => {
              const key = value as SensorName | CompareKey;
              const isCompareSeries = key.endsWith('__compare');
              const sensor = (isCompareSeries
                ? (key.slice(0, -'__compare'.length) as SensorName)
                : key) as SensorName;
              return (
                <span className="text-[12px] text-[color:var(--color-fg-muted)]">
                  {seriesLabel(sensor, isCompareSeries)}
                </span>
              );
            }}
          />

          {/* Area hijau di dalam rentang ideal bikin penyimpangan langsung terlihat */}
          {thresholds && active.suhu && (
            <ReferenceArea
              yAxisId="temp"
              y1={thresholds.suhu.min}
              y2={thresholds.suhu.max}
              fill="var(--color-canopy)"
              fillOpacity={0.05}
              stroke="none"
            />
          )}

          {thresholds &&
            active.suhu &&
            [thresholds.suhu.min, thresholds.suhu.max].map((value) => (
              <ReferenceLine
                key={`suhu-${value}`}
                yAxisId="temp"
                y={value}
                stroke="var(--color-canopy)"
                strokeDasharray="3 4"
                strokeOpacity={0.45}
                label={{
                  value,
                  position: 'insideTopLeft',
                  fontSize: 10,
                  fill: 'var(--color-fg-subtle)',
                }}
              />
            ))}

          {/* Batang hanya bermakna pada mode satu periode: dua histogram hanya menambah bacaan. */}
          {!isCompare &&
            visible.includes('suhu') && (
              <Bar
                yAxisId="temp"
                dataKey="suhu"
                fill="var(--color-sun)"
                fillOpacity={0.18}
                radius={[3, 3, 0, 0]}
                maxBarSize={18}
                isAnimationActive={false}
                name="suhu"
              />
            )}

          {visible.map((sensor) => (
            <Area
              key={sensor}
              yAxisId={sensor === 'suhu' ? 'temp' : 'humidity'}
              type="monotone"
              dataKey={sensor}
              stroke={SENSOR_META[sensor].accent}
              strokeWidth={2}
              fill={`url(#history-fill-${sensor})`}
              dot={false}
              activeDot={{ r: 3.5, strokeWidth: 0 }}
              name={sensor}
              isAnimationActive={false}
            />
          ))}

          {isCompare &&
            visible.map((sensor) => (
              <Line
                key={compareKey(sensor)}
                yAxisId={sensor === 'suhu' ? 'temp' : 'humidity'}
                type="monotone"
                dataKey={compareKey(sensor)}
                stroke={SENSOR_META[sensor].accent}
                strokeWidth={1.5}
                strokeOpacity={0.7}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
                name={compareKey(sensor)}
                isAnimationActive={false}
              />
            ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Label human-readable untuk periode pembanding, dipakai legend dan tooltip. */
function compareLabel(compare: HistoryPeriod | null): string {
  if (!compare) return 'pembanding';
  if (compare.offset === 0) return 'lainnya';
  if (compare.offset === 1) return 'periode sebelumnya';
  return `${compare.offset} periode sebelumnya`;
}

type TooltipPayloadEntry = {
  dataKey?: string | number;
  payload?: CompareRow;
};

function HistoryTooltip({
  active,
  payload,
  label,
  compare: isCompare,
  compareLabel: compareCaption,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  compare: boolean;
  compareLabel: string;
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload;

  /** Sensor yang punya nilai pada baris ini, termasuk periode pembanding. */
  const shown = SENSORS.filter((sensor) =>
    isCompare
      ? payload.some((entry) => entry.dataKey === sensor || entry.dataKey === compareKey(sensor))
      : payload.some((entry) => entry.dataKey === sensor),
  );

  return (
    <LeafTooltip className="text-[12px]">
      <p className="mb-1.5 font-medium text-[color:var(--color-fg)]">
        {isCompare ? String(label) : formatTime(String(label))}
      </p>

      <div className="flex flex-col gap-1">
        {shown.map((sensor) => {
          const meta = SENSOR_META[sensor];
          const value = row?.[sensor];
          if (value === undefined) return null;
          return (
            <p key={sensor} className="flex items-center gap-1.5 whitespace-nowrap">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ backgroundColor: meta.accent }}
              />
              <span className="text-[color:var(--color-fg-muted)]">{meta.short}</span>
              <span className="value-tabular ml-auto font-medium">
                {value.toFixed(1)}
                {meta.unit}
              </span>
            </p>
          );
        })}
      </div>

      {isCompare && row && (
        <div className="mt-1.5 flex flex-col gap-1 border-t border-[color:var(--color-border)] pt-1.5">
          <p className="text-[11px] text-[color:var(--color-fg-subtle)]">
            {compareCaption}: {formatTime(row.timeCompare)}
          </p>
          <div className="flex flex-col gap-1">
            {shown.map((sensor) => {
              const meta = SENSOR_META[sensor];
              const valueCompare = row[compareKey(sensor)];
              if (valueCompare === undefined) return null;
              return (
                <p key={sensor} className="flex items-center gap-1.5 whitespace-nowrap">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: meta.accent, opacity: 0.7 }}
                  />
                  <span className="text-[color:var(--color-fg-muted)]">{meta.short}</span>
                  <span className="value-tabular ml-auto font-medium">
                    {valueCompare.toFixed(1)}
                    {meta.unit}
                  </span>
                </p>
              );
            })}
          </div>
          <p className="text-[11px] text-[color:var(--color-fg-subtle)]">
            Periode kini: {formatTime(row.timeCurrent)}
          </p>
        </div>
      )}
    </LeafTooltip>
  );
}
