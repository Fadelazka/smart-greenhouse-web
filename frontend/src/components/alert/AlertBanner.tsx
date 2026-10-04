import { useEffect, useRef } from 'react';
import { AlertTriangle, Info, Volume2, VolumeX, X } from 'lucide-react';
import { SENSOR_META } from '@/types';
import { useSensorStore } from '@/store/sensorStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAlertSound } from '@/hooks/useAlertSound';
import { motion, AnimatePresence } from 'framer-motion';

const AUTO_DISMISS_MS = 10_000;

/**
 * Narasi arah yang sama dengan `backend/src/services/alert.service.ts`.
 *
 * Backend sudah menentukan sisi dengan benar (bukan asal menebak dari
 * `value < min`), jadi frontend harus pakai aturan yang sama. Kalau di sini
 * ditulis "di luar batas" untuk semua severity, nilai yang masih di dalam
 * rentang tapi mendekati batas akan salah terbaca sebagai pelanggaran.
 *
 * Satuan selalu lewat parameter, bukan ditebak dari angka ambang, supaya tidak
 * salah label kalau ambang diganti lewat Settings.
 */
function describeSide(
  value: number,
  threshold: { min: number; max: number },
  unit: string,
): string {
  const { min, max } = threshold;

  if (value < min) return `, di bawah batas minimum ${min}${unit}.`;
  if (value > max) return `, di atas batas maksimum ${min}–${max}${unit}.`;

  // Masih di dalam rentang: pasti mendekati salah satu batas.
  const span = max - min;
  const nearLow = span > 0 && value < min + span * 0.1;
  const side = nearLow ? 'minimum' : 'maksimum';
  return `, mendekati batas ${side} ${min}–${max}${unit}.`;
}

export function AlertBanner() {
  const lastAlert = useSensorStore((s) => s.lastAlert);
  const clearAlert = useSensorStore((s) => s.actions.clearAlert);
  const reducedMotion = useReducedMotion();
  const { muted, play, toggleMuted } = useAlertSound();

  // Bunyi hanya untuk alert yang baru masuk. Tanpa ini, hook ini akan
  // berbunyi lagi setiap kali komponen render ulang, dan `lastAlert` yang
  // sama akan berbunyi berulang.
  const lastPlayedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!lastAlert) return;
    const timer = setTimeout(clearAlert, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [lastAlert, clearAlert]);

  useEffect(() => {
    if (!lastAlert) {
      lastPlayedRef.current = null;
      return;
    }

    const key = `${lastAlert.ts}-${lastAlert.sensor}`;
    if (lastPlayedRef.current === key) return;

    lastPlayedRef.current = key;
    play(lastAlert.severity);
  }, [lastAlert, play]);

  const meta = lastAlert ? SENSOR_META[lastAlert.sensor] : null;

  const accent =
    lastAlert?.severity === 'critical'
      ? 'var(--color-destructive)'
      : lastAlert?.severity === 'warning'
        ? 'var(--color-warning)'
        : 'var(--color-water)';

  const Icon = lastAlert?.severity === 'critical' ? AlertTriangle : Info;

  const label =
    lastAlert?.severity === 'critical'
      ? 'Kritis'
      : lastAlert?.severity === 'warning'
        ? 'Perhatian'
        : 'Informasi';

  /**
   * Ikon dan warna tidak boleh sama untuk "kritis" dan "perhatian" - kalau
   * keduanya AlertTriangle, satu-satunya pembeda warna akan hilang untuk
   * pengguna yang mengandalkan bentuk ikon. Peringatan memakai Info.
   */
  const isCritical = lastAlert?.severity === 'critical';

  return (
    <AnimatePresence>
      {lastAlert && meta && (
        <motion.div
          key={`${lastAlert.ts}-${lastAlert.sensor}`}
          role="alert"
          aria-live={lastAlert.severity === 'critical' ? 'assertive' : 'polite'}
          initial={reducedMotion ? false : { opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.25, ease: [0, 0, 0.2, 1] }}
          className="glass-strong fixed top-5 right-5 z-50 flex w-[min(380px,calc(100vw-2.5rem))] items-start gap-3 p-4"
          style={{
            borderColor: `color-mix(in oklab, ${accent} ${isCritical ? 65 : 40}%, transparent)`,
            // Kritis diberi garis lebih tebal supaya bedanya terlihat tanpa warna
            borderLeftWidth: isCritical ? 4 : 1,
          }}
        >
          <Icon
            className="mt-0.5 size-5 shrink-0"
            style={{ color: accent }}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            {/* Border tebal distinguishes severity without relying only on hue */}
            <p className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: accent }}>
              {label}
            </p>
            <p className="mt-1 text-[14px] leading-snug">
              <span className="font-medium">{meta.label}</span>{' '}
              {lastAlert.value.toFixed(meta.decimals)}
              {describeSide(lastAlert.value, lastAlert.threshold, meta.unit)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <button
              type="button"
              onClick={toggleMuted}
              aria-pressed={!muted}
              title={muted ? 'Nyalakan bunyi alert' : 'Matikan bunyi alert'}
              className="rounded-md p-1 text-[color:var(--color-fg-muted)] transition-colors hover:bg-[color:var(--color-surface-raised)] hover:text-[color:var(--color-fg)]"
            >
              {muted ? (
                <VolumeX className="size-4" aria-hidden="true" />
              ) : (
                <Volume2 className="size-4" aria-hidden="true" />
              )}
              <span className="sr-only">{muted ? 'Nyalakan bunyi alert' : 'Matikan bunyi alert'}</span>
            </button>

            <button
              type="button"
              onClick={clearAlert}
              aria-label="Tutup notifikasi"
              className="rounded-md p-1 text-[color:var(--color-fg-muted)] transition-colors hover:bg-[color:var(--color-surface-raised)] hover:text-[color:var(--color-fg)]"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
