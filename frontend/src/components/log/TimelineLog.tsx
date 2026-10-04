import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Leaf,
  LogIn,
  Power,
  RotateCcw,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { ACTIVITY_META, type ActivityRow, type ActivityType } from '@/types';
import { cn, formatDateTime } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const ICONS: Record<string, LucideIcon> = {
  actuator_on: Power,
  actuator_off: Power,
  mode_change: SlidersHorizontal,
  threshold_change: SlidersHorizontal,
  calibration_change: SlidersHorizontal,
  restart: RotateCcw,
  alert: AlertTriangle,
  sensor_error: AlertTriangle,
  login: LogIn,
};

function iconFor(type: string): LucideIcon {
  return ICONS[type] ?? Leaf;
}

function colorFor(type: string): string {
  const known = ACTIVITY_META[type as ActivityType];
  return known?.color ?? 'var(--color-fg-subtle)';
}

function labelFor(type: string): string {
  const known = ACTIVITY_META[type as ActivityType];
  return known?.label ?? type;
}

/** Node bulat + sehelai daun, warna dan ikon ikut tipe event. */
function TimelineNode({ type, index }: { type: string; index: number }) {
  const Icon = iconFor(type);
  const color = colorFor(type);

  // `initial={false}` membuat node langsung dirender pada state akhir
  // (scale 1, opacity 1) tanpa animasi masuk. Ini penting karena kedua node
  // ini memakai `whileInView` + `viewport={{ once: true }}`: kalau initial
  // tetap ada tapi reduced motion aktif, node bisa terkunci di scale 0
  // dan tidak pernah terlihat.
  const reducedMotion = useReducedMotion();

  return (
    <div className="relative flex w-9 shrink-0 justify-center">
      {/* Batang tumbuh dari atas; ruas terakhir dibuat transparan */}
      <span
        aria-hidden="true"
        className="absolute top-0 bottom-0 w-px -translate-x-1/2 bg-[color:var(--color-border)]"
      />

      {/* Daun di kiri batang, tumbuh sedikit berputar dari pangkal */}
      <motion.span
        aria-hidden="true"
        className="absolute top-1/2 -left-1 h-2.5 w-4 origin-right -translate-y-1/2 rounded-[60%_0_60%_0]"
        style={{ backgroundColor: color, opacity: 0.55 }}
        initial={reducedMotion ? false : { scale: 0, rotate: -70 }}
        whileInView={{ scale: 1, rotate: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.4, delay: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
      />

      <motion.span
        className="relative grid size-7 place-items-center rounded-full border-2 bg-[color:var(--color-bg-deep)]"
        style={{ borderColor: color, color }}
        initial={reducedMotion ? false : { scale: 0, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.35, delay: index * 0.03, ease: [0, 0, 0.2, 1] }}
      >
        <Icon className="size-3.5" />
      </motion.span>
    </div>
  );
}

type Props = {
  entries: ActivityRow[];
  loading: boolean;
};

export function TimelineLog({ entries, loading }: Props) {
  const ordered = useMemo(
    () => [...entries].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()),
    [entries],
  );

  if (loading) {
    return (
      <div className="glass flex flex-col gap-3 p-5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton size-9 rounded-full" />
            <div className="skeleton h-8 flex-1" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <ol className="glass p-5">
      {ordered.map((entry, index) => (
        <li key={entry.id} className="flex gap-3">
          <TimelineNode type={entry.type} index={index} />

          <div className="min-w-0 flex-1 pb-5 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="flex items-center gap-2 text-[14px] font-medium">
                <span style={{ color: colorFor(entry.type) }}>{labelFor(entry.type)}</span>
                <span className="text-[12px] font-normal text-[color:var(--color-fg-muted)]">
                  oleh {entry.actor}
                </span>
              </span>

              <time
                dateTime={entry.time}
                className="value-tabular shrink-0 text-[12px] text-[color:var(--color-fg-subtle)]"
              >
                {formatDateTime(entry.time)}
              </time>
            </div>

            <p className="mt-1 text-[13px] leading-snug text-[color:var(--color-fg-muted)]">
              {entry.message}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function TimelineEmpty() {
  return (
    <div className="glass grid place-items-center gap-2 px-5 py-12 text-center">
      <Leaf className="size-8 text-[color:var(--color-canopy)]" aria-hidden="true" />
      <p className="text-[14px] font-medium">Belum ada aktivitas</p>
      <p className="max-w-sm text-[13px] text-[color:var(--color-fg-muted)]">
        Setiap perubahan mode, aktuator, dan ambang akan muncul di sini sebagai
        ruas batang baru.
      </p>
    </div>
  );
}

export function TimelineFilterChip({
  active,
  count,
  label,
  color,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-colors',
        active
          ? 'border-transparent'
          : 'border-[color:var(--color-border)] text-[color:var(--color-fg-subtle)] hover:text-[color:var(--color-fg-muted)]',
      )}
      style={
        active && color
          ? { color, backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)` }
          : undefined
      }
    >
      {color && (
        <span
          aria-hidden="true"
          className="size-2 rounded-full"
          style={{ backgroundColor: active ? color : 'currentColor', opacity: active ? 1 : 0.5 }}
        />
      )}
      {label}
      <span className="value-tabular opacity-70">({count})</span>
    </button>
  );
}
