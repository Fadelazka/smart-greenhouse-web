import { useState } from 'react';
import { Bot, Hand, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useSensorStore } from '@/store/sensorStore';
import { useAuthStore } from '@/store/authStore';
import { useRipple } from '@/components/ui/useRipple';
import { cn } from '@/lib/utils';
import type { DeviceMode } from '@/types';

/**
 * Toggle global Auto/Manual (PLANNING.md F1.5 - MUST HAVE).
 *
 * Mode menentukan siapa yang memutuskan aktuator:
 *  - auto   : ESP32 menilai sendiri dari sensor (mode bawaan)
 *  - manual : perintah operator yang menang sampai dikembalikan ke auto
 *
 * Backend, MQTT, dan simulator sudah mendukung mode sejak awal - yang belum
 * ada adalah jalan masuk dari UI. Tanpa komponen ini, `api.setMode()` tidak
 * pernah terpakai dan user tidak bisa berintervensi ke keputusan perangkat.
 *
 * Operator boleh memakai ini. Yang dibatasi hanya kalibrasi dan restart
 * (PLANNING.md F5: "role operator tidak bisa akses kalibrasi/restart"),
 * karena menyalakan pompa adalah operasi harian, bukan tindakan administratif.
 */

const OPTIONS: Array<{ value: DeviceMode; label: string; Icon: typeof Bot }> = [
  { value: 'auto', label: 'Otomatis', Icon: Bot },
  { value: 'manual', label: 'Manual', Icon: Hand },
];

export function ModeToggle() {
  const { onPointerDown } = useRipple();

  const mode = useSensorStore((s) => s.mode);
  const setMode = useSensorStore((s) => s.actions.setMode);
  const online = useSensorStore((s) => s.online);
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');

  const [pendingMode, setPendingMode] = useState<DeviceMode | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isManual = mode === 'manual';

  async function apply(next: DeviceMode) {
    setPendingMode(next);

    try {
      const result = await api.setMode(next);
      setMode(next);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal mengubah mode');
    } finally {
      setPendingMode(null);
    }
  }

  return (
    <section aria-label="Mode operasi" className="glass mt-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-[family-name:var(--font-display)] text-[16px]">Mode operasi</h2>
          <p className="mt-1 text-[13px] text-[color:var(--color-fg-muted)]">
            {isManual
              ? 'Perintah operator yang berlaku. ESP32 menunggu perintah, bukan menilai sendiri.'
              : 'ESP32 menilai sendiri setiap tick dan menyalakan aktuator bila perlu.'}
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="Pilih mode operasi"
          className="grid shrink-0 grid-cols-2 gap-1.5 rounded-[10px] bg-[color:var(--color-bg-deep)] p-1"
        >
          {OPTIONS.map(({ value, label, Icon }) => {
            const active = mode === value;
            const pending = pendingMode === value;

            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!online || pendingMode !== null}
                onPointerDown={onPointerDown}
                onClick={() => void apply(value)}
                className={cn(
                  'ripple-host relative inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-200',
                  'disabled:cursor-not-allowed disabled:opacity-45',
                  active
                    ? 'bg-[color:var(--color-canopy)] text-[color:var(--color-bg-deep)]'
                    : 'text-[color:var(--color-fg-muted)] hover:bg-[color:var(--color-surface-raised)] hover:text-[color:var(--color-fg)]',
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {pending ? 'Menyimpan...' : label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Peringatan hanya tampil di mode manual, saat device vital tidak diawasi */}
      {isManual && (
        <p className="mt-3 flex items-start gap-2 rounded-[10px] border border-[color:color-mix(in_oklab,var(--color-warning)_40%,transparent)] bg-[color:color-mix(in_oklab,var(--color-warning)_10%,transparent)] px-3 py-2 text-[13px] text-[color:var(--color-warning)]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Mode manual aktif. Perangkat tidak lagi menyalakan pompa atau kipas secara
            otomatis. Semua keputusan diambil oleh operator.
          </span>
        </p>
      )}

      {!online && (
        <p className="mt-3 text-[13px] text-[color:var(--color-destructive)]">
          Perangkat offline, mode tidak bisa diubah.
        </p>
      )}

      <p
        aria-live="polite"
        className="mt-2 min-h-[16px] text-[12px] text-[color:var(--color-fg-subtle)]"
      >
        {message ??
          (isAdmin
            ? 'Mode tersimpan di perangkat dan bertahan sampai diubah lagi.'
            : 'Operator boleh mengubah mode; kalibrasi dan restart tetap khusus admin.')}
      </p>
    </section>
  );
}
