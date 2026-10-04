import { useCallback } from 'react';
import { useAlertSoundStore } from '@/store/alertSoundStore';
/**
 * Bunyi peringatan untuk alert sensor (PLANNING.md F2.5 "Toast + bunyi").
 *
 * Kenapa Web Audio dan bukan file mp3:
 *  - tidak ada aset binary yang harus di-build atau di-host;
 *  - bunyi bisa dibedakan per severity tanpa butuh beberapa file;
 *  - tetap jalan offline, yang penting untuk greenhouse tanpa internet.
 *
 * Catatan: ada dua hal yang sering terlewat:
 *
 * 1. Kebijakan autoplay browser. `AudioContext` baru boleh berbunyi setelah
 *    ada interaksi pengguna. Kalau context dibuat sebelum itu, statusnya
 *    `suspended` dan bunyi tidak keluar - gejala yang muncul sebagai "fitur
 *    bunyi tidak berfungsi" padahal kodenya benar. Karena itu context di-resume
 *    pada interaksi pengguna.
 *
 * 2. Context harus SATU untuk seluruh aplikasi, bukan satu per pemanggil hook.
 *    Hook ini dipakai di dua tempat (tombol header dan banner alert). Kalau
 *    masing-masing punya context sendiri, gesture klik di header hanya
 *    meng-unlock context header - saat alert pertama berbunyi, context banner
 *    dibuat tanpa gesture dan browser menolaknya. Gejalanya: tombol terlihat
 *    menyala, tapi tidak ada bunyi sama sekali.
 */

export type AlertSeverity = 'info' | 'warning' | 'critical';

/** Durasi dan nada per severity: kritis lebih panjang dan lebih tinggi. */
const TONES: Record<AlertSeverity, { freq: number; duration: number }> = {
  info: { freq: 660, duration: 0.12 },
  warning: { freq: 780, duration: 0.16 },
  critical: { freq: 990, duration: 0.26 },
};

/** Satu context untuk seluruh umur aplikasi, dibuat malas saat pertama perlu. */
let sharedContext: AudioContext | null = null;

function getSharedContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const Ctor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  if (!sharedContext || sharedContext.state === 'closed') {
    sharedContext = new Ctor();
  }

  // suspended = autoplay policy masih menahan. Panggilan ini HARUS berada di
  // dalam gesture pengguna, kalau tidak browser menolaknya.
  if (sharedContext.state === 'suspended') void sharedContext.resume();

  return sharedContext;
}

export function useAlertSound() {
  // Preferensi baca dari store, bukan state lokal, supaya tombol di header
  // AppShell dan tombol di banner selalu menunjukkan keadaan yang sama.
  const muted = useAlertSoundStore((s) => s.muted);
  const toggleMuted = useAlertSoundStore((s) => s.actions.toggle);

  const play = useCallback(
    (severity: AlertSeverity) => {
      if (muted) return;

      try {
        const ctx = getSharedContext();
        if (!ctx || ctx.state !== 'running') return;

        const tone = TONES[severity];
        const now = ctx.currentTime;

        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(tone.freq, now);

        // Ramp naik-turun supaya tidak ada klik di awal/akhir nada.
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration);

        oscillator.connect(gain);
        gain.connect(ctx.destination);

        oscillator.start(now);
        oscillator.stop(now + tone.duration);
      } catch {
        // Audio tidak tersedia atau ditolak: bunyi adalah bonus, bukan
        // komponen kritis. Toast visual sudah tetap menampilkan alert.
      }
    },
    [muted],
  );

  /**
   * Menyalakan bunyi harus ikut me-resume context di dalam gesture klik.
   *
   * Ini batasan nyata dari autoplay policy: `resume()` yang dipanggil di luar
   * gesture akan ditolak browser, sehingga bunyi menyala di UI tapi tetap
   * tidak terdengar - kondisi yang lebih membingungkan daripada sekadar bisu.
   */
  const handleToggle = useCallback(() => {
    const willUnmute = muted;
    toggleMuted();
    if (willUnmute) getSharedContext();
  }, [muted, toggleMuted]);

  return { muted, play, toggleMuted: handleToggle };
}
