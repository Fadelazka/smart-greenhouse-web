import { motion } from 'framer-motion';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { Clock, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSensorStore } from '@/store/sensorStore';
import { useCountUp } from '@/hooks/useCountUp';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn, formatUptime } from '@/lib/utils';

/**
 * Kartu ke-4 di Dashboard: status koneksi perangkat (PLANNING.md 1.1 "4 kartu").
 *
 * Bedanya dengan kartu sensor: yang diukur adalah kualitas sinyal (RSSI dBm),
 * bukan nilai lingkungan. RSSI ESP32 di indoor biasanya bergerak antara -30
 * (sangat dekat) sampai -90 (hampir lepas). Di bawah -75 koneksi tidak stabil,
 * jadi itulah batas "lemah".
 *
 * Dua status ditampilkan terpisah karena bisa berbeda penyebab:
 *  - `connected`: socket backend ke broker (jalur.transport)
 *  - `online`: perangkat greenhouse masih mengirim telemetry (perangkat)
 */

/** Batas bawah tiap tingkat, dari terkuat ke terlemah (dBm). */
const LEVELS = [
  { min: -55, label: 'Sangat kuat', accent: 'var(--color-canopy)' },
  { min: -65, label: 'Kuat', accent: 'var(--color-canopy)' },
  { min: -72, label: 'Cukup', accent: 'var(--color-sun)' },
  { min: -80, label: 'Lemah', accent: 'var(--color-warning)' },
  { min: -Infinity, label: 'Sangat lemah', accent: 'var(--color-destructive)' },
] as const;

/** Jumlah bar yang menyala: 5 = paling kuat. */
const LIT_COUNT = [5, 4, 3, 2, 1];

function levelIndex(rssi: number): number {
  const index = LEVELS.findIndex((level) => rssi >= level.min);
  return index === -1 ? LEVELS.length - 1 : index;
}

export function ConnectionCard() {
  const reducedMotion = useReducedMotion();
  const online = useSensorStore((s) => s.online);
  const connected = useSensorStore((s) => s.connected);
  const firmware = useSensorStore((s) => s.firmware);
  const uptime = useSensorStore((s) => s.uptime);
  const lastSeen = useSensorStore((s) => s.lastSeen);
  const latencyMs = useSensorStore((s) => s.latencyMs);
  const buffer = useSensorStore((s) => s.buffer);

  // "3 detik lalu" harus ikut maju tanpa re-render kartu ini tiap detik, jadi
  // hanya labelnya yang di-state ulang.
  const [, setClockTick] = useState(0);
  useEffect(() => {
    if (lastSeen === null) return;
    const timer = setInterval(() => setClockTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [lastSeen]);

  const rssi = buffer.at(-1)?.rssi ?? null;
  const animated = useCountUp(rssi ?? 0, 600, 0);

  const index = rssi === null ? LEVELS.length - 1 : levelIndex(rssi);
  const level = LEVELS[index];
  const lit = rssi === null ? 0 : LIT_COUNT[index];

  const sparkData = buffer.slice(-40).map((t) => ({ v: t.rssi }));

  return (
    <motion.article
      initial={reducedMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] }}
      className="glass group relative overflow-hidden p-5"
      style={{ transition: 'transform 200ms var(--ease-out)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-[color:var(--color-fg-muted)]">Sinyal WiFi</p>
          <p
            className="value-tabular mt-1 font-[family-name:var(--font-display)] text-[clamp(28px,3vw,40px)] leading-none font-semibold"
            style={{ color: rssi === null ? 'var(--color-fg-subtle)' : level.accent }}
          >
            {rssi === null ? '--' : Math.round(animated)}
            <span className="ml-1 text-[18px] font-normal text-[color:var(--color-fg-muted)]">
              dBm
            </span>
          </p>
        </div>

        <div
          className="shrink-0 rounded-xl p-2.5"
          style={{
            color: online ? level.accent : 'var(--color-fg-subtle)',
            backgroundColor: 'color-mix(in oklab, currentColor 12%, transparent)',
          }}
        >
          {online ? (
            <Wifi className="size-7" aria-hidden="true" />
          ) : (
            <WifiOff className="size-7" aria-hidden="true" />
          )}
        </div>
      </div>

      <div className="mt-4 h-8 w-full">
        {sparkData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="spark-rssi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={level.accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={level.accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={level.accent}
                strokeWidth={1.75}
                fill="url(#spark-rssi)"
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="skeleton h-full w-full" />
        )}
      </div>

      {/* Lima bar sinyal, menyala dari bawah sesuai kekuatan */}
      <div className="mt-3 flex h-3 items-end gap-1.5" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((bar) => (
          <span
            key={bar}
            className="flex-1 rounded-t-[2px]"
            style={{
              height: `${34 + bar * 16}%`,
              backgroundColor: bar < lit ? level.accent : 'var(--color-surface-raised)',
              opacity: bar < lit ? 0.9 : 0.45,
              transition: 'background-color 300ms var(--ease-out), opacity 300ms var(--ease-out)',
            }}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-[12px]">
        {/* Warna tidak pernah jadi satu-satunya penanda status: ada ikon + teks */}
        <span
          className={cn(
            'inline-flex items-center gap-1.5',
            online ? 'text-[color:var(--color-success)]' : 'text-[color:var(--color-destructive)]',
          )}
        >
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full"
            style={{
              backgroundColor: online ? 'var(--color-success)' : 'var(--color-destructive)',
            }}
          />
          {online ? 'Online' : 'Offline'}
        </span>

        <span className="text-[color:var(--color-fg-subtle)]">
          {rssi === null ? 'Menunggu sinyal' : level.label}
        </span>
      </div>

      <p className="mt-2 text-[11px] text-[color:var(--color-fg-subtle)]">
        {!connected ? 'Koneksi broker terputus' : `Uptime ${formatUptime(uptime)} · firmware ${firmware}`}
      </p>

      {/* PLANNING.md F1.2: lastSeen + latency. Dipisah dari uptime karena
          uptime adalah umur perangkat sejak boot, lastSeen adalah kapan data
          terakhir sampai - dua hal yang sering dikira sama. */}
      <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-[color:var(--color-border-subtle)] pt-3 text-[11px]">
        <div className="min-w-0">
          <dt className="text-[color:var(--color-fg-subtle)]">Terakhir terlihat</dt>
          <dd className="value-tabular mt-0.5 truncate text-[color:var(--color-fg-muted)]">
            {lastSeen === null ? 'Belum ada data' : relativeTime(lastSeen)}
          </dd>
        </div>

        <div className="min-w-0">
          <dt className="flex items-center gap-1 text-[color:var(--color-fg-subtle)]">
            Penundaan data
            <span title="Selisih jam perangkat dan jam browser. Bukan latency jaringan murni.">
              <Clock className="size-3" aria-hidden="true" />
            </span>
          </dt>
          <dd className="value-tabular mt-0.5 truncate text-[color:var(--color-fg-muted)]">
            {latencyMs === null ? 'Tidak diketahui' : formatLatency(latencyMs)}
          </dd>
        </div>
      </dl>
    </motion.article>
  );
}

/** Waktu relatif dalam bahasa Indonesia, dari jam browser. */
function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));

  if (seconds < 5) return 'Baru saja';
  if (seconds < 60) return `${seconds} detik lalu`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} menit lalu`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;

  return `${Math.round(hours / 24)} hari lalu`;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} detik`;
}
