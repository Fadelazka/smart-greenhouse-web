import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Dedaunan yang bergoyang di tepi bawah hero (PLANNING.md 7.2 "Dedaunan bergoyang").
 *
 * Posisi, delay, dan durasi diacak sekali lewat `useMemo` supaya daun tidak
 * "lompat" setiap re-render. `transform-origin` dikunci di pangkal daun sehingga
 * yang berayun adalah ujungnya seperti mengayun di angin, bukan berputar di pusat.
 *
 * Pembagian transform penting: `transform` dipakai untuk scaleX(flip), sedangkan
 * `scale` (properti CSS terpisah) dipakai untuk ukuran. Kalau keduanya digabung di
 * `transform` yang sama, CSS hanya menyimpan nilai terakhir sehingga scaleX
 * menimpa scale dan daun tampil abnormal.
 */

const LEAF_COUNT = 7;

type LeafProps = {
  x: number;
  scale: number;
  duration: number;
  delay: number;
  flip: boolean;
  hue: 'canopy' | 'deep';
};

/**
 * `reducedMotion` bukan bagian dari `LeafProps` karena bukan hasil acak yang
 * di-memo: ia datang dari preferensi pengguna dan berubah di antara render.
 */
function Leaf({
  x,
  scale,
  duration,
  delay,
  flip,
  hue,
  reducedMotion,
}: LeafProps & { reducedMotion: boolean }) {
  const fill = hue === 'canopy' ? 'var(--color-canopy)' : 'var(--color-canopy-deep)';
  const vein = hue === 'canopy' ? 'rgba(34,197,94,0.5)' : 'rgba(22,163,74,0.55)';

  return (
    <svg
      viewBox="0 0 80 110"
      aria-hidden="true"
      className="absolute bottom-0 w-[70px] origin-bottom"
      style={{
        left: `${x}%`,
        scale,
        transform: `translateX(-50%) scaleX(${flip ? -1 : 1})`,
      }}
    >
      <g
        style={{
          transformOrigin: '50% 100%',
          // reduced motion: daun tetap digambar, hanya tidak bergoyang. Animasi
          // CSS `leaf-sway` sudah dinetralkan blok global di index.css, tapi
          // penargetan di sini juga, supaya komponen ini mandiri.
          animation: reducedMotion ? 'none' : `leaf-sway ${duration}s ease-in-out ${delay}s infinite`,
          filter: `drop-shadow(0 6px 14px ${vein})`,
        }}
      >
        <path
          d="M40 110 C40 78 24 62 12 46 C2 32 8 10 26 6 C44 2 58 18 58 38 C58 58 46 76 40 110 Z"
          fill={fill}
          fillOpacity={hue === 'canopy' ? 0.16 : 0.22}
        />
        <path d="M40 110 C40 82 34 62 26 46" fill="none" stroke={vein} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M40 84 C46 76 52 70 58 66" fill="none" stroke={vein} strokeWidth="1.1" strokeLinecap="round" />
        <path d="M39 68 C33 62 27 56 21 52" fill="none" stroke={vein} strokeWidth="1.1" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function LeafEdge({ dense = false }: { dense?: boolean }) {
  const reducedMotion = useReducedMotion();
  const leaves = useMemo<LeafProps[]>(() => {
    let seed = 99173;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const count = dense ? LEAF_COUNT + 4 : LEAF_COUNT;

    return Array.from({ length: count }, (_, index) => {
      // Sebar merata dengan sedikit jitter supaya tidak terbaca sebagai pola.
      const step = 100 / (count + 1);
      return {
        x: step * (index + 1) + (random() - 0.5) * step * 0.8,
        scale: 0.55 + random() * 0.75,
        duration: 4 + random() * 3,
        delay: random() * 4,
        flip: random() < 0.45,
        hue: random() < 0.5 ? 'canopy' : 'deep',
      };
    });
  }, [dense]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[180px] overflow-hidden"
    >
      <div
        className="absolute inset-x-0 bottom-0 h-[42px]"
        style={{
          background:
            'linear-gradient(to top, rgba(11,21,18,0.92) 0%, rgba(11,21,18,0.45) 55%, transparent 100%)',
        }}
      />
      {leaves.map((leaf, index) => (
        <motion.div
          key={index}
          className="absolute inset-0"
          // reduced motion: daun langsung tampil opaque, tanpa fade-in
          // bertahap. Fade bukan dekorasi di sini, jadi aman dihilangkan
          // tanpa mengubah informasi yang disampaikan.
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reducedMotion ? 0 : 0.6 + index * 0.05, duration: 0.6 }}
        >
          <Leaf {...leaf} reducedMotion={reducedMotion} />
        </motion.div>
      ))}
    </div>
  );
}
