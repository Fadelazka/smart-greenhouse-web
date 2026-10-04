import { HARDWARE_PARTS, STATUS_LABEL } from './hardwareData';
import { useHardwareLogStore } from '@/store/hardwareLogStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HardwareComponentId, HardwareStatus } from '@/types';

/**
 * Panel Dev Mode untuk memaksa status komponen.
 *
 * Kenapa panel ini ada
 * --------------------
 * Dua komponen tidak punya telemetry status sama sekali, jadi tidak ada
 * sumber data untuk mendeteksi kelainannya:
 *
 *  - Relay: telemetry hanya melaporkan kelembapan tanah, suhu, dan kelembapan.
 *    Perubahan status relay tidak pernah dikirim.
 *  - LCD: yang dikirim adalah hasil `lcd.print()` di serial monitor, bukan
 *    status tautan I2C-nya. LCD bisa saja gagal inisialisasi tanpa jejak.
 *
 * Jadi status keduanya hanya bisa disimulasikan, dan itu lewat sini.
 *
 * DHT22 dan ESP32 sebenarnya bisa dideteksi otomatis, tapi tetap diberi
 * tombol simulasi supaya alur error bisa dicoba tanpa harus mencabut kabel
 * atau mematikan Wi-Fi.
 *
 * Status yang dipaksa selalu menang atas deteksi telemetry dan ditandai
 * `simulation` di panel log, supaya tidak tertukar dengan kegagalan nyata.
 */

/** Komponen yang bisa dipaksa, dengan label tombolnya. */
const CONTROLLABLE: Array<{ id: HardwareComponentId; hint: string }> = [
  { id: 'dht22', hint: 'NaN, firmware mencetak "Gagal baca DHT22!"' },
  { id: 'potentiometer', hint: 'Pembacaan macet: tidak bergerak selama 30 detik' },
  { id: 'esp32', hint: 'Telemetry berhenti total' },
  { id: 'relay', hint: 'Tidak ada telemetry status relay' },
  { id: 'lcd', hint: 'Tidak ada telemetry status LCD' },
];

const OPTIONS: Array<{ value: HardwareStatus; label: string }> = [
  { value: 'normal', label: STATUS_LABEL.normal },
  { value: 'warning', label: STATUS_LABEL.warning },
  { value: 'error', label: STATUS_LABEL.error },
];

export function DevSimulationPanel() {
  const forced = useHardwareLogStore((s) => s.forced);
  const setForced = useHardwareLogStore((s) => s.setForced);
  const clearForced = useHardwareLogStore((s) => s.clearForced);

  const activeCount = Object.keys(forced).length;

  return (
    <div className="rounded-xl border border-border bg-card/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-foreground">Dev Mode</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Paksa status komponen untuk mencoba tampilan error dan menguji log. Status yang
            dipaksa ditandai di panel log.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={clearForced} disabled={activeCount === 0}>
          Reset
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {CONTROLLABLE.map(({ id, hint }) => {
          const current = forced[id];
          return (
            <div key={id}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] font-medium text-foreground">
                  {HARDWARE_PARTS[id].shortName}
                </span>
                {current && (
                  <span className="font-[family-name:var(--font-mono)] text-[10px] text-warning">
                    dipaksa
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-fg-subtle">{hint}</p>
              <div
                role="group"
                aria-label={`Paksa status ${HARDWARE_PARTS[id].name}`}
                className="mt-1.5 flex gap-1"
              >
                {OPTIONS.map((option) => {
                  const isOn = current === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      // Klik status yang sama membatalkan paksaan, jadi
                      // pengguna tidak perlu menekan "Reset" untuk
                      // mengembalikan satu komponen saja.
                      aria-pressed={isOn}
                      onClick={() => setForced(id, isOn ? null : option.value)}
                      className={cn(
                        'flex-1 rounded-md border px-2 py-1 text-[11px] transition-colors',
                        isOn
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-border bg-transparent text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
