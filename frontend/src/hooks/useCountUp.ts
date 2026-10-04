import { useEffect, useRef, useState } from 'react';

/**
 * Angka beranimasi naik/turun saat nilai berubah.
 * Memakai requestAnimationFrame, bukan library, supaya ringan.
 * Hormati prefers-reduced-motion: langsung tampilkan nilai akhir.
 */
export function useCountUp(value: number, durationMs = 600, decimals = 1): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || !Number.isFinite(value)) {
      setDisplay(value);
      return;
    }

    const from = fromRef.current;
    if (from === value) return;

    const start = performance.now();

    const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const next = from + (value - from) * easeOutExpo(progress);
      setDisplay(next);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = value;
      }
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      fromRef.current = value;
    };
  }, [value, durationMs]);

  return Number.isFinite(display) ? Number(display.toFixed(decimals)) : display;
}
