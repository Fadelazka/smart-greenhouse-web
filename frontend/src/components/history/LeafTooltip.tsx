import type { ReactNode } from 'react';

/**
 * Tooltip berbentuk daun (PLANNING.md 5.3 "tooltip daun").
 *
 * Bentuk daun dibuat dari `border-radius` asimetris, bukan gambar, supaya
 * ikut menyesuaikan ukuran teks dan tidak butuh aset eksternal.
 *
 * Aksesibilitas: tooltip ini murni dekoratif. Nilai aslinya sudah tersedia
 * lewat label sumbu dan ringkasan di bawah grafik, jadi tidak ada informasi
 * yang hanya bisa dibaca lewat tooltip.
 */
type Props = {
  children: ReactNode;
  className?: string;
};

export function LeafTooltip({ children, className = '' }: Props) {
  return (
    <div className={`leaf-tooltip ${className}`}>
      {/* Tulang daun, dekoratif */}
      <span aria-hidden="true" className="leaf-tooltip-vein" />
      {/* Tangkai yang menunjuk ke titik data */}
      <span aria-hidden="true" className="leaf-tooltip-stem" />
      <div className="relative">{children}</div>
    </div>
  );
}