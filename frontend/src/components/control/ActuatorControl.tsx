import { useEffect, useState } from 'react';
import { CheckCircle2, Droplets, Fan, Lightbulb, RotateCcw } from 'lucide-react';
import { ACTUATOR_META, type ActuatorName, type ActuatorState } from '@/types';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useRipple } from '@/components/ui/useRipple';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const OVERRIDE_SECONDS = 60;

/** Lama centang hijau tetap terlihat setelah perintah terkonfirmasi. */
const APPLIED_FEEDBACK_MS = 2500;

const ICONS = {
  pump: Droplets,
  fan: Fan,
  light: Lightbulb,
} satisfies Record<ActuatorName, typeof Droplets>;

const OPTIONS: Array<{ value: ActuatorState; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

type Props = {
  actuator: ActuatorName;
  state: ActuatorState;
  disabled: boolean;
  onLocalState: (actuator: ActuatorName, state: ActuatorState) => void;
};

export function ActuatorControl({ actuator, state, disabled, onLocalState }: Props) {
  const meta = ACTUATOR_META[actuator];
  const Icon = ICONS[actuator];
  const { onPointerDown } = useRipple();

  const [overrideUntil, setOverrideUntil] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** Nilai yang menunggu persetujuan user di dialog, belum dikirim. */
  const [confirmTarget, setConfirmTarget] = useState<ActuatorState | null>(null);
  /** Nilai yang barusan terkonfirmasi, menggerakkan centang hijau. */
  const [applied, setApplied] = useState<ActuatorState | null>(null);

  useEffect(() => {
    if (overrideUntil === null) {
      setRemaining(0);
      return;
    }

    const tick = () => {
      const left = Math.max(0, Math.ceil((overrideUntil - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setOverrideUntil(null);
        onLocalState(actuator, 'auto');
        setMessage('Override selesai, kembali ke mode auto');
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [overrideUntil, actuator, onLocalState]);

  /**
   * Klik pertama HANYA membuka dialog - perintah belum menyentuh jaringan.
   * PLANNING.md 6.1 "Klik pompa -> dialog konfirmasi -> publish cmd" jadi
   * publish harus terjadi di applySelect, bukan di sini.
   */
  function handleSelect(next: ActuatorState) {
    if (next === state || pending) return;
    setMessage(null);
    setApplied(null);
    setConfirmTarget(next);
  }

  async function applySelect() {
    if (!confirmTarget) return;
    const next = confirmTarget;

    setPending(true);

    try {
      await api.setActuator(actuator, next, OVERRIDE_SECONDS);
      onLocalState(actuator, next);
      setOverrideUntil(next === 'auto' ? null : Date.now() + OVERRIDE_SECONDS * 1000);
      setApplied(next);
      setMessage(
        next === 'auto'
          ? 'Dikembalikan ke mode auto'
          : `Manual override aktif ${OVERRIDE_SECONDS} detik`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal mengirim perintah');
    } finally {
      setPending(false);
      setConfirmTarget(null);
    }
  }

  // Centang hijau hanya umpan balik sesaat, lalu kembali ke teks biasa.
  useEffect(() => {
    if (applied === null) return;
    const timer = setTimeout(() => setApplied(null), APPLIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [applied]);

  return (
    <div className="glass flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-xl"
            style={{
              color: meta.accent,
              backgroundColor: 'color-mix(in oklab, currentColor 14%, transparent)',
            }}
          >
            <Icon className="size-5" />
          </span>
          <div>
            <h3 className="text-[15px] font-medium">{meta.label}</h3>
            <p className="text-[12px] text-[color:var(--color-fg-muted)]">{meta.description}</p>
          </div>
        </div>

        {overrideUntil !== null && (
          <span className="value-tabular flex shrink-0 items-center gap-1 rounded-full border border-[color:var(--color-warning)] px-2 py-0.5 text-[11px] text-[color:var(--color-warning)]">
            <RotateCcw className="size-3" aria-hidden="true" />
            {remaining}s
          </span>
        )}
      </div>

      <div
        role="radiogroup"
        aria-label={`Kontrol ${meta.label}`}
        className="grid grid-cols-3 gap-1.5 rounded-[10px] bg-[color:var(--color-bg-deep)] p-1"
      >
        {OPTIONS.map((option) => {
          const active = option.value === state;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled || pending}
              onPointerDown={onPointerDown}
              onClick={() => void handleSelect(option.value)}
              className={cn(
                'ripple-host relative rounded-lg px-2 py-2 text-[13px] font-medium transition-colors duration-200',
                'disabled:cursor-not-allowed disabled:opacity-45',
                active
                  ? 'bg-[color:var(--color-canopy)] text-[color:var(--color-bg-deep)]'
                  : 'text-[color:var(--color-fg-muted)] hover:bg-[color:var(--color-surface-raised)] hover:text-[color:var(--color-fg)]',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <p
        aria-live="polite"
        className="flex min-h-[16px] items-center gap-1.5 text-[12px] text-[color:var(--color-fg-muted)]"
      >
        {/* Centang hijau = verifikasi bahwa perintah sampai ke perangkat */}
        {applied !== null && (
          <span className="inline-flex shrink-0 items-center gap-1 text-[color:var(--color-success)]">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Perintah terkonfirmasi</span>
          </span>
        )}
        {message ??
          (disabled
            ? 'Perangkat offline, kontrol dinonaktifkan'
            : state === 'auto'
              ? 'Keputusan diambil ESP32 secara otomatis'
              : `Perintah manual aktif, ESP32 kembali ke auto dalam ${OVERRIDE_SECONDS} detik`)}
      </p>

      <Dialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          // Jangan tutup dialog selagi perintah sedang dikirim, supaya user
          // tidak mengira gagal padahal request-nya masih berjalan.
          if (!open && !pending) setConfirmTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmTitle(actuator, confirmTarget)}</DialogTitle>
            <DialogDescription>{confirmDescription(actuator, confirmTarget)}</DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirmTarget(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant={confirmTarget === 'on' ? 'destructive' : 'default'}
              disabled={pending}
              onClick={() => void applySelect()}
            >
              {pending
                ? 'Mengirim...'
                : confirmTarget === 'auto'
                  ? 'Kembalikan ke auto'
                  : `Jalankan ${confirmTarget === 'on' ? 'ON' : 'OFF'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Judul dialog: menyebut nama aktuator dan tujuannya, bukan sekadar "Konfirmasi". */
function confirmTitle(actuator: ActuatorName, next: ActuatorState | null): string {
  if (next === null) return '';
  const label = ACTUATOR_META[actuator].label;
  if (next === 'auto') return `Kembalikan ${label} ke auto?`;
  return `${next === 'on' ? 'Nyalakan' : 'Matikan'} ${label}?`;
}

/** Menjelaskan akibat nyata, supaya user tahu apa yang berubah di greenhouse. */
function confirmDescription(actuator: ActuatorName, next: ActuatorState | null): string {
  if (next === null) return '';
  const label = ACTUATOR_META[actuator].label.toLowerCase();

  if (next === 'auto') {
    return `${label} dinilai ulang sendiri oleh ESP32 setiap tick. Perintah manual yang sedang berjalan akan dihentikan.`;
  }

  const action = next === 'on' ? 'menyalakan' : 'mematikan';
  return `Perintah manual ${action} ${label} selama ${OVERRIDE_SECONDS} detik, lalu ESP32 kembali ke mode auto. Perintah ini menggantikan keputusan otomatis perangkat.`;
}
