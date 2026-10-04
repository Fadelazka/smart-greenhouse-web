import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Scroll indicator berbentuk akar tanaman yang tumbuh berulang
 * (PLANNING.md 7.2 "Scroll indicator akar", 5.1).
 *
 * Animasi pakai requestAnimationFrame + `strokeDashoffset`, bukan Framer Motion,
 * karena yang perlu digerakkan hanya satu properti numerik pada satu elemen.
 * Panjang path diambil dari `getTotalLength()` supaya offset selalu pas dengan
 * path aktual - kalau dipatok konstanta, akar akan berhenti sebelum/sesuai ujung.
 */

const ROOT_PATH =
  'M40 4 C40 22 32 30 24 38 C16 46 14 56 20 64 C26 72 34 70 38 62 C41 56 44 50 48 46';

const GROW_MS = 2400;

export function RootIndicator({ label = 'Gulir ke bawah' }: { label?: string }) {
  const pathRef = useRef<SVGPathElement | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const path = pathRef.current;
    if (!path || reducedMotion) return;

    let length = 0;
    try {
      length = path.getTotalLength();
    } catch {
      // JSDOM/getTotalLength tidak tersedia di lingkungan non-browser.
      return;
    }
    if (!length) return;

    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;

    let frameId = 0;
    let start = 0;

    const frame = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = (timestamp - start) % GROW_MS;
      const progress = elapsed / GROW_MS;

      // 0 -> 1 tumbuh, lalu balik ke 0 dan ulangi, dengan easing halus di ujung.
      const eased = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
      path.style.strokeDashoffset = `${length * (1 - eased)}`;

      frameId = window.requestAnimationFrame(frame);
    };

    frameId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(frameId);
  }, [reducedMotion]);

  return (
    <motion.a
      href="#berikutnya"
      aria-label={label}
      className="group mx-auto flex w-fit flex-col items-center gap-2 rounded-[10px] px-2 py-1 text-[12px] text-[color:var(--color-fg-muted)] transition-colors hover:text-[color:var(--color-fg)]"
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reducedMotion ? 0 : 1.2, duration: 0.5 }}
    >
      <span>{label}</span>
      <svg
        viewBox="0 0 80 72"
        aria-hidden="true"
        className="h-[52px] w-[58px] overflow-visible"
      >
        <path
          ref={pathRef}
          d={ROOT_PATH}
          fill="none"
          stroke="var(--color-canopy)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.85"
        />
        <g
          className="transition-transform duration-300 group-hover:translate-y-0.5"
          style={{ transformOrigin: '50% 70%' }}
        >
          <path
            d="M20 64 C12 62 8 56 10 50 C16 52 20 56 20 64 Z"
            fill="var(--color-canopy)"
            fillOpacity="0.5"
          />
          <path
            d="M38 62 C46 62 51 57 50 51 C43 53 39 57 38 62 Z"
            fill="var(--color-canopy)"
            fillOpacity="0.35"
          />
        </g>
      </svg>
    </motion.a>
  );
}