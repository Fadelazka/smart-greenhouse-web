import { motion } from 'framer-motion';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { SENSOR_META, type SensorName, type Telemetry } from '@/types';
import { SENSOR_STATE_LABEL, cn, sensorState } from '@/lib/utils';
import { useCountUp } from '@/hooks/useCountUp';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { SensorGlyph } from './SensorGlyph';

type Props = {
  sensor: SensorName;
  value: number | null;
  buffer: Telemetry[];
  threshold: { min: number; max: number } | null;
};

const STATE_STYLE = {
  ok: {
    ring: '',
    text: 'text-[color:var(--color-success)]',
    label: 'text-[color:var(--color-fg-muted)]',
  },
  warning: {
    ring: 'pulse-warning',
    text: 'text-[color:var(--color-warning)]',
    label: 'text-[color:var(--color-warning)]',
  },
  critical: {
    ring: 'pulse-critical',
    text: 'text-[color:var(--color-destructive)]',
    label: 'text-[color:var(--color-destructive)]',
  },
} as const;

export function SensorCard({ sensor, value, buffer, threshold }: Props) {
  const meta = SENSOR_META[sensor];
  const reducedMotion = useReducedMotion();

  const animated = useCountUp(value ?? 0, 600, meta.decimals);
  const display = value === null ? null : animated;

  const state = value !== null && threshold ? sensorState(value, threshold) : 'ok';
  const style = STATE_STYLE[state];

  const sparkData = buffer.slice(-40).map((t) => ({ v: t[sensor] }));

  return (
    <motion.article
      initial={reducedMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] }}
      className={cn('glass group relative overflow-hidden p-5', style.ring)}
      style={{ transition: 'transform 200ms var(--ease-out)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-[color:var(--color-fg-muted)]">{meta.label}</p>
          <p
            className={cn(
              'value-tabular mt-1 font-[family-name:var(--font-display)] text-[clamp(28px,3vw,40px)] leading-none font-semibold',
              style.text,
            )}
          >
            {display === null ? '--' : display.toFixed(meta.decimals)}
            <span className="ml-1 text-[18px] font-normal text-[color:var(--color-fg-muted)]">
              {meta.unit}
            </span>
          </p>
        </div>

        <div
          className="shrink-0 rounded-xl p-2.5"
          style={{
            color: meta.accent,
            backgroundColor: 'color-mix(in oklab, currentColor 12%, transparent)',
          }}
        >
          <SensorGlyph sensor={sensor} className="size-7" />
        </div>
      </div>

      <div className="mt-4 h-8 w-full">
        {sparkData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-${sensor}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={meta.accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={meta.accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={meta.accent}
                strokeWidth={1.75}
                fill={`url(#spark-${sensor})`}
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="skeleton h-full w-full" />
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-[12px]">
        <span className={cn('inline-flex items-center gap-1.5', style.label)}>
          {/* Warna tidak pernah jadi satu-satunya penanda status - selalu ada ikon + teks */}
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full"
            style={{
              backgroundColor:
                state === 'ok'
                  ? 'var(--color-success)'
                  : state === 'warning'
                    ? 'var(--color-warning)'
                    : 'var(--color-destructive)',
            }}
          />
          {SENSOR_STATE_LABEL[state]}
        </span>
        {threshold && (
          <span className="value-tabular text-[color:var(--color-fg-subtle)]">
            {threshold.min}–{threshold.max}
            {meta.unit}
          </span>
        )}
      </div>
    </motion.article>
  );
}
