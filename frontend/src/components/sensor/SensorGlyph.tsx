import type { SensorName } from '@/types';

type Props = { sensor: SensorName; className?: string };

/**
 * Ilustrasi SVG per sensor. Semuanya digambar dari path/circle dasar,
 * tanpa file aset eksternal.
 */
export function SensorGlyph({ sensor, className }: Props) {
  const common = {
    className,
    fill: 'none',
    // PENTING: default SVG adalah stroke="none". Tanpa baris ini, setiap path
    // yang tidak dibungkus <g stroke=...> jadi tidak terlihat sama sekali -
    // termasuk kedua path humUdara dan humTanah.
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.75,
  };

  if (sensor === 'suhu') {
    // Matahari: inti + sinar
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" {...common}>
        <circle cx="24" cy="24" r="8" />
        <path d="M24 6v5M24 37v5M6 24h5M37 24h5" />
        <path d="M11.4 11.4l3.5 3.5M33.1 33.1l3.5 3.5M36.6 11.4l-3.5 3.5M14.9 33.1l-3.5 3.5" />
      </svg>
    );
  }

  if (sensor === 'humUdara') {
    // Tetes air
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" {...common}>
        <path d="M24 7c0 0 12 13.5 12 21a12 12 0 1 1-24 0c0-7.5 12-21 12-21Z" />
        <path d="M18.5 30a5.5 5.5 0 0 0 5.5 5.5" />
      </svg>
    );
  }

  // humTanah - gundukan tanah dengan tunas kecil
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...common}>
      <path d="M6 38h36" />
      <path d="M12 38c0-6 5-10 12-10s12 4 12 10" />
      <path d="M24 28V17" />
      <path d="M24 18c0-3.3 2.4-6 6-6 0 3.3-2.4 6-6 6Z" />
    </svg>
  );
}
