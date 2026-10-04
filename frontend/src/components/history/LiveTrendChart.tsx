import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSensorStore } from '@/store/sensorStore';
import { SENSOR_META, type Telemetry, type Thresholds } from '@/types';
import { formatTime } from '@/lib/utils';
import { LeafTooltip } from './LeafTooltip';

const SENSORS = ['suhu', 'humUdara', 'humTanah'] as const;

type Props = {
  buffer: Telemetry[];
  thresholds: Thresholds | null;
};

/**
 * Grafik tren dari buffer Socket.io, bukan dari API riwayat.
 *
 * Bedanya dengan `HistoryChart`: ini untuk menunjukkan "apa yang terjadi
 * sekarang", jadi tidak ada fetching, tidak ada skeleton, dan tidak menunggu
 * data historis termuat. Kalau buffer belum cukup, tampil instruksi, bukan
 * sumbu kosong yang membingungkan.
 *
 * Cakupannya hanya sepanjang buffer (300 laporan terakhir, sekitar 10 menit
 * pada interval 2 detik). Karena itu tidak ada pemilih rentang di sini -
 * rentang panjang milik halaman Riwayat yang menarik data dari API. Menyembunyikan
 * batas ini lebih jujur daripada menampilkan pilihan 7 hari yang tidak menambah data.
 *
 * Sumbu Y kiri untuk suhu (°C), kanan untuk kelembapan (%), sama seperti
 * halaman Riwayat supaya otaknya tidak perlu switching scale.
 */
export function LiveTrendChart({ buffer, thresholds }: Props) {
  const online = useSensorStore((s) => s.online);

  const data = useMemo(
    () => buffer.map((t) => ({ time: t.ts, suhu: t.suhu, humUdara: t.humUdara, humTanah: t.humTanah })),
    [buffer],
  );

  if (data.length < 2) {
    return (
      <div className="grid h-56 place-items-center rounded-[10px] border border-[color:var(--color-border)] bg-[color:var(--color-bg-deep)] px-4 text-center">
        <p className="text-[13px] text-[color:var(--color-fg-muted)]">
          {online
            ? 'Mengumpulkan sampel... grafik muncul setelah ada dua laporan sensor.'
            : 'Perangkat offline. Grafik akan terisi otomatis begitu koneksi kembali.'}
        </p>
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
          <defs>
            {SENSORS.map((sensor) => (
              <linearGradient key={sensor} id={`live-fill-${sensor}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SENSOR_META[sensor].accent} stopOpacity={0.28} />
                <stop offset="100%" stopColor={SENSOR_META[sensor].accent} stopOpacity={0.01} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid stroke="var(--color-border)" strokeOpacity={0.5} vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={formatTime}
            tick={{ fill: 'var(--color-fg-subtle)', fontSize: 11 }}
            stroke="var(--color-border)"
            minTickGap={28}
          />
          <YAxis
            yAxisId="temp"
            tick={{ fill: 'var(--color-fg-subtle)', fontSize: 11 }}
            stroke="var(--color-border)"
            width={44}
            domain={['dataMin - 2', 'dataMax + 2']}
          />
          <YAxis
            yAxisId="humidity"
            orientation="right"
            tick={{ fill: 'var(--color-fg-subtle)', fontSize: 11 }}
            stroke="var(--color-border)"
            width={36}
            domain={[0, 100]}
          />

          {thresholds && (
            <ReferenceArea
              yAxisId="temp"
              y1={thresholds.suhu.min}
              y2={thresholds.suhu.max}
              fill="var(--color-canopy)"
              fillOpacity={0.05}
              stroke="none"
            />
          )}

          {/* PLANNING.md F1.10: pita ambang digaris putus-putus, bukan hanya
              diisi. Tanpa garis, batas bawah dan atas tidak terbaca jelas di
              layar kecil. Polanya diulang dari HistoryChart supaya kedua chart
              tidak terlihat seperti dua produk berbeda.

              Hanya suhu yang digaris. Humiditas memakai sumbu yang sama, jadi
              empat garis tambahan akan saling tumpang tindih dan hanya menambah
              kebisingan visual - pita di ReferenceArea sudah cukup untuk keduanya. */}
          {thresholds &&
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

          {SENSORS.map((sensor) => (
            <Area
              key={sensor}
              yAxisId={sensor === 'suhu' ? 'temp' : 'humidity'}
              type="monotone"
              dataKey={sensor}
              stroke={SENSOR_META[sensor].accent}
              strokeWidth={1.75}
              fill={`url(#live-fill-${sensor})`}
              dot={false}
              activeDot={{ r: 3.5, strokeWidth: 0 }}
              isAnimationActive={false}
              name={sensor}
            />
          ))}

          <Tooltip content={<LiveTooltip />} cursor={{ stroke: 'var(--color-canopy)', strokeOpacity: 0.35 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type PayloadEntry = {
  dataKey?: string | number;
  value?: number;
  payload?: { time: string };
};

function LiveTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: PayloadEntry[];
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <LeafTooltip className="text-[12px]">
      <p className="mb-1.5 font-medium text-[color:var(--color-fg)]">{formatTime(point.time)}</p>
      <div className="flex flex-col gap-1">
        {SENSORS.filter((sensor) =>
          payload.some((entry) => entry.dataKey === sensor && entry.value !== undefined),
        ).map((sensor) => {
          const value = payload.find((entry) => entry.dataKey === sensor)?.value;
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
    </LeafTooltip>
  );
}
