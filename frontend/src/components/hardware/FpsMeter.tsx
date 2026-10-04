import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Pengukur FPS opsional untuk scene 3D.
 *
 * Diaktifkan dengan `?fps=1` di URL, jadi tidak menambah beban pada pemakaian
 * normal.
 *
 * Kenapa rAF di luar Canvas, bukan `useFrame` di dalam: `useFrame` hanya
 * terpicu ketika R3F benar-benar menggambar ulang. Kalau scene sedang diam
 * (`frameloop="demand"`) atau tab tidak terlihat, jumlah frame yang dihitung
 * akan jauh lebih kecil dari frame rate sebenarnya, sehingga angkanya
 * menyesatkan. rAF mengikuti frame rate browser yang sebenarnya.
 */
export function FpsMeter({ enabled }: { enabled: boolean }) {
  const [fps, setFps] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    let raf = 0;
    let frames = 0;
    let last = performance.now();

    const tick = () => {
      frames += 1;
      const now = performance.now();
      const elapsed = now - last;

      // Dihitung per detik penuh supaya angkanya tidak bergetar.
      if (elapsed >= 1000) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        last = now;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      className={cn(
        'pointer-events-none absolute left-4 top-4 z-30 rounded-md border border-white/15',
        'bg-black/70 px-2 py-1 font-[family-name:var(--font-mono)] text-[11px] text-white/90',
        'backdrop-blur-md',
      )}
    >
      {fps} FPS
    </div>
  );
}

/**
 * Baca flag `?fps=1` dari URL.
 *
 * Sengaja memakai `location.search` langsung, bukan `useSearchParams` dari
 * react-router: pemanggilnya adalah komponen scene, bukan route, sehingga
 * tidak perlu menarik navigasi ke dalam sini.
 */
export function useFpsFlag(): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(new URLSearchParams(window.location.search).get('fps') === '1');
  }, []);

  return on;
}
