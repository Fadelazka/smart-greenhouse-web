import { Cpu, Droplet, Monitor, Thermometer, Zap } from 'lucide-react';
import { HARDWARE_PARTS } from './hardwareData';
import { ComponentMiniPreview } from './ComponentMiniPreview';
import { cn } from '@/lib/utils';
import type { HardwareComponentId } from '@/types';

/**
 * Default state panel Detail Komponen, saat belum ada komponen yang dipilih.
 *
 * Panel ini adalah pintu masuk ke scene 3D: pengguna yang belum paham belum
 * tahu harus mengklik apa. Karena itu isinya disusun dari atas ke bawah sebagai
 * urutan conviction: lihat rakutannya, pahami apa itu, baru pilih komponen.
 */

type IconComponent = typeof Cpu;

/**
 * Ikon per komponen.
 *
 * `Droplet` untuk potentiometer mengikuti cara pengguna memandangnya sebagai
 * sensor kelembapan tanah, bukan bentuk fisiknya yang berupa knob.
 */
const ICONS: Record<HardwareComponentId, IconComponent> = {
  esp32: Cpu,
  dht22: Thermometer,
  potentiometer: Droplet,
  relay: Zap,
  lcd: Monitor,
};

/**
 * Fungsi singkat per komponen, untuk subteks di kartu daftar.
 *
 * Ditulis di sini, bukan diambil dari `description`, karena `description` itu
 * kalimat lengkap untuk daftar tiga baris. Di kartu yang hanya setinggi dua
 * baris, kalimat penuh akan terpotong dan membuat grid tidak rata.
 */
const ROLES: Record<HardwareComponentId, string> = {
  esp32: 'Otak pemroses & pengendali',
  dht22: 'Sensor suhu & kelembapan udara',
  potentiometer: 'Sensor kelembapan tanah',
  relay: 'Sakelar pompa air',
  lcd: 'Layar monitor I2C',
};

/** Urutan tetap, sama dengan urutan rakitan di scene 3D. */
const ORDER: HardwareComponentId[] = ['esp32', 'dht22', 'potentiometer', 'relay', 'lcd'];

export function ComponentDetailEmpty({
  still,
  onSelect,
}: {
  still: boolean;
  onSelect: (id: HardwareComponentId) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {/*
        Pratinjau dibatasi 280px dan dipusatkan. Batas maxi inilah yang
        mencegah ruang kosong besar: di kolom yang lebih lebar dari 280px,
        sisa ruang dipakai heading dan daftar di bawah, bukan menyisakan celah
        kosong di samping gambar.
      */}
      <ComponentMiniPreview
        component={null}
        still={still}
        className="mx-auto w-full max-w-[280px]"
      />

      <div>
        <h3 className="text-[19px] font-bold tracking-tight text-primary">
          Kenali Komponen Hardware
        </h3>
        <p className="mt-1.5 max-w-[90%] text-[13px] leading-relaxed text-muted-foreground">
          Satu ESP32 membaca DHT22 untuk suhu dan kelembapan udara, serta
          potentiometer sebagai sensor kelembapan tanah. Relay menghidupkan pompa
          air, dan LCD 1602 menampilkan ringkasannya lewat I2C.
        </p>
      </div>

      {/*
        Dua kolom, bukan satu. Lima komponen dalam satu kolom menghasilkan
        tinggi 5 baris yang melampaui scroll container, sehingga list terpotong
        dan komponen terakhir tidak pernah terlihat tanpa menggulir.
      */}
      <ul className="grid grid-cols-2 gap-2">
        {ORDER.map((id) => {
          const Icon = ICONS[id];
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect(id)}
                className={cn(
                  'group flex h-full w-full items-start gap-2.5 rounded-lg border border-border/70',
                  'bg-surface-soft/40 px-2.5 py-2.5 text-left',
                  'transition-[transform,border-color,background-color] duration-200',
                  'hover:scale-[1.02] hover:border-primary/60 hover:bg-surface-raised/60',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  // `active:scale` mengembalikan posisi setelah klik, supaya
                  // tombol tidak tertinggal dalam keadaan membesar.
                  'active:scale-[0.99]',
                )}
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/12">
                  <Icon className="size-4 text-primary" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold leading-tight text-foreground">
                    {HARDWARE_PARTS[id].shortName}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-fg-subtle">
                    {ROLES[id]}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="text-[12px] italic leading-relaxed text-muted-foreground">
        Klik salah satu komponen pada scene 3D atau dari daftar di atas untuk
        melihat detail lengkapnya.
      </p>
    </div>
  );
}
