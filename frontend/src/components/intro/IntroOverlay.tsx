import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Leaf, SkipForward } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Intro dengan clip video greenhouse sebagai background (permintaan:
 * "opening ada clip video di backgroundnya").
 *
 * Clip dibuat oleh `scripts/generate-intro-video.mjs` - 12 detik, 1280x720,
 * loop mulus, tanpa audio, 103 KB (mp4) + 44 KB (webm).
 *
 * Aturan yang dipegang:
 *  - Hanya main sekali per sesi (sessionStorage), supaya tidak menyebalkan
 *    setiap reload.
 *  - Otomatis selesai setelah MAX_MS, ada tombol Lewati, dan Enter/Space/
 *    Escape juga melewati.
 *  - `prefers-reduced-motion` -> video tidak pernah dimuat, layar langsung
 *    memperlihatkan landing. Tidak ada animasi yang wajib ditonton.
 *  - Video `muted` + `playsInline`. Tanpa muted, browser akan memblokir
 *    autoplay karena ini_fixture autoplay policy.
 *  - Sumber video bisa diganti lewat prop `sources` tanpa menyentuh komponen.
 */

const MAX_MS = 12_000;
const FADE_MS = 700;
const SESSION_KEY = 'greenhouse:intro-done';

export type IntroSources = { mp4?: string; webm?: string };

type Props = {
  sources?: IntroSources;
  onDone?: () => void;
};

export function shouldSkipIntro(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    // Private mode / storage diblokir: lebih baik tampilkan sekali saja.
    return true;
  }
}

function markIntroDone() {
  try {
    window.sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Diabaikan: kalau storage tidak bisa ditulis, intro akan main lagi
    // di reload berikutnya. Tidak fatal.
  }
}

export function IntroOverlay({ sources, onDone }: Props) {
  const reducedMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [visible, setVisible] = useState(() => !reducedMotion && !shouldSkipIntro());
  const [leaving, setLeaving] = useState(false);

  const mp4 = sources?.mp4 ?? '/media/greenhouse-intro.mp4';
  const webm = sources?.webm ?? '/media/greenhouse-intro.webm';

  const finish = useCallback(() => {
    markIntroDone();
    setLeaving(true);
    window.setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, FADE_MS);
  }, [onDone]);

  // Auto-lanjut setelah MAX_MS. Timer dilepas saat komponen hilang supaya
  // tidak ada setState setelah unmount.
  useEffect(() => {
    if (!visible) return;

    const timer = window.setTimeout(finish, MAX_MS);
    return () => window.clearTimeout(timer);
  }, [visible, finish]);

  // Autoplay bisa ditolak (kebijakan browser, hemat data, atau tidak ada
  // interaksi). Jangan sampai user terjebak di intro: video yang gagal
  // diputar langsung dianggap selesai.
  useEffect(() => {
    const video = videoRef.current;
    if (!visible || !video) return;

    video.play().catch(() => finish());
  }, [visible, finish]);

  // Kalau pengguna aktif reduced-motion setelah component ter-mount (mis.
  // mengubah setting sistem tanpa reload), langsung lewati.
  useEffect(() => {
    if (visible && reducedMotion) finish();
  }, [visible, reducedMotion, finish]);

  if (!visible) return null;

  return (
    <motion.div
      role="dialog"
      aria-label="Pembuka Smart IoT Greenhouse"
      className="fixed inset-0 z-100 overflow-hidden bg-[color:var(--color-bg-deep)]"
      initial={false}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: FADE_MS / 1000, ease: [0, 0, 0.2, 1] }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
          event.preventDefault();
          finish();
        }
      }}
      // Auto-focus supaya Enter/Space langsung bekerja tanpa klik dulu.
      tabIndex={-1}
      ref={(node) => node?.focus()}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 size-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
      >
        <source src={webm} type="video/webm" />
        <source src={mp4} type="video/mp4" />
      </video>

      {/* Overlay gelap supaya teks tetap terbaca di frame terang */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(11,21,18,0.72) 0%, rgba(11,21,18,0.45) 45%, rgba(11,21,18,0.85) 100%)',
        }}
      />

      <div className="relative flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: [0, 0, 0.2, 1] }}
          className="flex flex-col items-center"
        >
          <span className="mb-5 grid size-16 place-items-center rounded-2xl border border-[color:var(--color-border-strong)] bg-[color:color-mix(in_oklab,var(--color-surface)_70%,transparent)]">
            <Leaf className="size-8 text-[color:var(--color-canopy)]" aria-hidden="true" />
          </span>

          <p className="text-[12px] uppercase tracking-[0.22em] text-[color:var(--color-canopy)]">
            Smart IoT Greenhouse
          </p>

          <h1 className="mt-3 max-w-3xl text-[clamp(26px,6vw,52px)] leading-[1.08] text-balance">
            Rumah hijau Anda, terpantau setiap dua detik
          </h1>

          <p className="mt-4 max-w-md text-[clamp(14px,2vw,17px)] text-[color:var(--color-fg-muted)]">
            Suhu, kelembapan udara, dan kelembapan tanah. Plus kendali pompa,
            kipas, dan lampu grow light.
          </p>
        </motion.div>

        <button
          type="button"
          onClick={finish}
          className="group mt-10 inline-flex items-center gap-2 rounded-[10px] border border-[color:var(--color-border-strong)] bg-[color:color-mix(in_oklab,var(--color-surface)_70%,transparent)] px-4 py-2 text-[13px] text-[color:var(--color-fg-muted)] transition-colors hover:border-[color:var(--color-canopy)] hover:text-[color:var(--color-fg)]"
        >
          <SkipForward className="size-4" aria-hidden="true" />
          Lewati intro
        </button>
      </div>
    </motion.div>
  );
}