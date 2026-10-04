import { Volume2, VolumeX } from 'lucide-react';
import { useAlertSound } from '@/hooks/useAlertSound';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Tombol bunyi alert yang selalu terlihat di header (PLANNING.md F2.5).
 *
 * Diletakkan persisten, bukan hanya di dalam banner: kalau tombolnya hanya
 * muncul saat ada alert, user baru bisa mematikan bunyi setelah mendengarnya
 * pertama kali - umpan balik yang terlambat.
 *
 */
export function SoundToggle({ className = '' }: { className?: string }) {
  const { muted, toggleMuted } = useAlertSound();

  const label = muted ? 'Nyalakan bunyi alert' : 'Matikan bunyi alert';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleMuted}
          aria-pressed={!muted}
          aria-label={label}
          className={className}
          style={{
            color: muted ? 'var(--color-fg-subtle)' : 'var(--color-canopy)',
          }}
        >
          {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
