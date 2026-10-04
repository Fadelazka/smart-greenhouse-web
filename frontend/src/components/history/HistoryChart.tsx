import { useMemo } from 'react';
import {
  Area,
  Bar,
  ComposedChart,
  CartesianGrid,
  Legend,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSensorStore } from '@/store/sensorStore';
import { SENSOR_META, type HistoryPoint, type SensorName, type Thresholds } from '@/types';
import { formatTime } from '@/lib/utils';
import { LeafTooltip } from './LeafTooltip';

const SENSORS: SensorName[] = ['suhu', 'humUdara', 'humTanah'];

type Props = {
  points: HistoryPoint[];
  active: Record<SensorName, boolean>;
  thresholds: Thresholds | null;
  bucketSeconds: number;
  loading: boolean;
};

/**
 * Histogram + garis per sensor.
 *
 * Sumbu Y kiri untuk suhu (°C), sumbu Y kanan untuk kelembapan (%). Bucket
 *AGO mengirim rata-rata, jadi batang mewakili rata-rata dalam interval itu
 * sementara garis smoothed memperlihatkan tren halus.
 */
export function HistoryChart({ points, active, thresholds, bucketSeconds, loading }: Props) {
  const liveBuffer = useSensorStore((s) => s.buffer);

  const data = useMemo<HistoryPoint[]>(() => {
    if (liveBuffer.length === 0) return points;

    const last = points.at(-1);
    // Kalau bucket terakhir masih "segar", data live akan menggandakan titik.
    if (last && Date.now() - new Date(last.time).getTime() < bucketSeconds * 1000) {
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
  }, [points, liveBuffer, bucketSeconds]);

  const visible = SENSORS.filter((sensor) => active[sensor]);
  const humidityVisible = visible.includes('humUdara') || visible.includes('humTanah');

  if (loading && points.length === 0) {
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

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: -12 }}>
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
            dataKey="time"
            stroke="var(--color-fg-subtle)"
            tick={{ fontSize: 11, fill: 'var(--color-fg-subtle)' }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(240,253,244,0.12)' }}
            tickFormatter={(value: string) => formatTime(value)}
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
            content={<HistoryTooltip />}
            cursor={{ stroke: 'var(--color-fg-subtle)', strokeDasharray: '4 4' }}
          />

          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => (
              <span className="text-[12px] text-[color:var(--color-fg-muted)]">
                {SENSOR_META[value as SensorName]?.label ?? value}
              </span>
            )}
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

          {visible.includes('suhu') && (
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
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

type TooltipPayloadEntry = {
  dataKey?: string | number;
  payload?: HistoryPoint;
};

function HistoryTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;

  return (
    <LeafTooltip className="text-[12px]">
      <p className="mb-1.5 font-medium text-[color:var(--color-fg)]">{formatTime(String(label))}</p>
      <div className="flex flex-col gap-1">
        {SENSORS.filter((sensor) =>
          payload.some((entry) => entry.dataKey === sensor),
        ).map((sensor) => {
          const value = point?.[sensor];
          if (value === undefined) return null;
          const meta = SENSOR_META[sensor];
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
      {point?.samples !== undefined && point.samples > 1 && (
        <p className="mt-1.5 border-t border-[color:var(--color-border)] pt-1.5 text-[11px] text-[color:var(--color-fg-subtle)]">
          Rata-rata {point.samples} sampel
        </p>
      )}
    </LeafTooltip>
  );
}