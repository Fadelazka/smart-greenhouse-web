import { cn } from '@/lib/utils';
import type { HistoryRange } from '@/types';

const RANGE_OPTIONS: Array<{ value: HistoryRange; label: string }> = [
  { value: '1h', label: '1 jam' },
  { value: '6h', label: '6 jam' },
  { value: '24h', label: '24 jam' },
  { value: '7d', label: '7 hari' },
];

type Props = {
  range: HistoryRange;
  onRangeChange: (range: HistoryRange) => void;
};

/**
 * TimeRangePicker berbasis radiogroup, bukan <select>, supaya bisadinavigasi
 * dengan tombol panah dan tetap terbaca screen reader sebagai satu grup.
 * Roving tabindex: hanya opsi aktif yang bisa difokus.
 */
export function TimeRangePicker({ range, onRangeChange }: Props) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = RANGE_OPTIONS.findIndex((option) => option.value === range);

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        onRangeChange(RANGE_OPTIONS[(index + 1) % RANGE_OPTIONS.length].value);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        onRangeChange(
          RANGE_OPTIONS[(index - 1 + RANGE_OPTIONS.length) % RANGE_OPTIONS.length].value,
        );
        break;
      case 'Home':
        event.preventDefault();
        onRangeChange(RANGE_OPTIONS[0].value);
        break;
      case 'End':
        event.preventDefault();
        onRangeChange(RANGE_OPTIONS[RANGE_OPTIONS.length - 1].value);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Rentang waktu grafik"
      onKeyDown={onKeyDown}
      className="inline-flex rounded-[10px] bg-[color:var(--color-bg-deep)] p-1"
    >
      {RANGE_OPTIONS.map((option) => {
        const active = option.value === range;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onRangeChange(option.value)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-[13px] transition-colors duration-200',
              active
                ? 'bg-[color:var(--color-canopy)] font-semibold text-[color:var(--color-bg-deep)]'
                : 'text-[color:var(--color-fg-muted)] hover:bg-[color:var(--color-surface-raised)] hover:text-[color:var(--color-fg)]',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}