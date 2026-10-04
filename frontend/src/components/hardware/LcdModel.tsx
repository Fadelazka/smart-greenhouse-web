import { useEffect, useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';
import { HARDWARE_PARTS } from './hardwareData';
import { useHardwareMaterials } from './materials';

/**
 * LCD 1602 I2C 16x2, sesuai `sketch.ino`: alamat I2C `0x27`, 16 karakter
 * per baris, dua baris.
 *
 * Teksnya bukan `<Html>`. Alasannya, teks LCD harus menempel pada bidang
 * LCD dan ikut berubah perspektif saat kamera berputar. Overlay `<Html>`
 * selalu menghadap kamera, sehingga teksnya terlihat melayang di atas modul
 * dan tidak pernah menerima perspektif. `CanvasTexture` juga tidak butuh
 * file font: teks digambar dengan font monospace bawaan browser, jadi tidak
 * ada permintaan jaringan.
 *
 * Format teks mengikuti firmware:
 *   baris 1: M:xx% T:xx.xC
 *   baris 2: PUMP: ACTIVE / PUMP: IDLE
 */

/** Resolusi texture. 16x2 karakter dengan sel 8x16, jadi tiap karakter 128px. */
const TEX_W = 256;
const TEX_H = 64;

/** Ukuran huruf dalam piksel. */
const FONT_PX = 13;

const SCREEN_COLOR = '#173d22';
const PIXEL_COLOR = '#a6f0bb';

const [W, H, D] = HARDWARE_PARTS.lcd.size;

/** Tebal modul backpack I2C di belakang modul LCD. */
const BACKPACK_T = 0.06;

export type LcdModelProps = {
  /**
   * Persentase kelembapan tanah 0-100, atau null kalau belum ada telemetry.
   *
   * null sengaja tidak diubah jadi 0. Menampilkan "M:0%" saat data belum
   * datang terlihat seperti sensor membaca nol, padahal tidak ada
   * pembacaan sama sekali.
   */
  moisture: number | null;
  /** Suhu udara dalam derajat Celsius, atau null kalau belum ada telemetry. */
  temperature: number | null;
  /** Relay aktif atau tidak, menentukan baris kedua. */
  pumpActive: boolean;
};

export function LcdModel({ moisture, temperature, pumpActive }: LcdModelProps) {
  const m = useHardwareMaterials();

  /*
   * Material layar dibuat di sini, bukan dari `useHardwareMaterials()`.
   *
   * Layar butuh `map` dan `emissiveMap` yang terikat ke texture khusus
   * komponen ini. Resep material bersama tidak bisa menampung hal itu,
   * karena texture-nya berbeda per instans.
   *
   * Layar juga TIDAK boleh diberi penanda `statusDriven`. Denyut status
   * menulis ulang `material.emissive`, dan kalau itu terjadi, warna layar
   * akan ikut berubah menjadi warna status setiap denyut. Yang ikut berdenyut
   * adalah bodi modul, bukan layarnya.
   */
  const screenMaterial = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = TEX_W;
    canvas.height = TEX_H;

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    // Filter linear supaya karakter tidak bergerigi saat kamera zoom, tapi
    // tetap terbaca pada jarak jauh.
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;

    return { tex, ctx: canvas.getContext('2d') };
  }, []);

  // Teks digambar ulang setiap nilai berubah. Texture-nya sendiri dibuat
  // sekali saja: membuat texture baru tiap nilai berubah akan memicu upload
  // GPU berulang dan menaikkan pemakaian memori pada sesi panjang.
  useEffect(() => {
    const { ctx, tex } = screenMaterial;
    if (!ctx) return;

    ctx.fillStyle = SCREEN_COLOR;
    ctx.fillRect(0, 0, TEX_W, TEX_H);

    ctx.fillStyle = PIXEL_COLOR;
    ctx.font = `bold ${FONT_PX}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'top';

    // Baris 1: kelembapan dan suhu, mengikuti format firmware.
    // Placeholder dua garis untuk nilai yang belum tersedia, bukan angka karangan.
    const line1 =
      moisture === null || temperature === null
        ? 'M:--% T:---.-C'
        : `M:${moisture.toFixed(0)}% T:${temperature.toFixed(1)}C`;

    // Baris 2: status pompa.
    const line2 = `PUMP: ${pumpActive ? 'ACTIVE' : 'IDLE'}`;

    ctx.fillText(line1, 8, 10);
    ctx.fillText(line2, 8, 36);

    tex.needsUpdate = true;
  }, [screenMaterial, moisture, temperature, pumpActive]);

  // Buang texture dan material saat model dilepas, supaya GPU tidak menyimpan
  // resource yang tidak lagi terpakai.
  useEffect(
    () => () => {
      screenMaterial.tex.dispose();
    },
    [screenMaterial],
  );

  return (
    <group>
      {/* Modul backpack I2C di belakang, PCB hijau. */}
      <mesh position={[0, H / 2, -D / 2 - BACKPACK_T / 2]} castShadow material={m.pcbGreen}>
        <boxGeometry args={[W - 0.14, H - 0.1, BACKPACK_T]} />
      </mesh>

      {/* Chip driver I2C di atas modul backpack. */}
      <mesh position={[-0.42, H / 2, -D / 2 - BACKPACK_T - 0.008]} material={m.cavity}>
        <boxGeometry args={[0.1, 0.07, 0.016]} />
      </mesh>

      {/*
        Bodi modul LCD. `pcbGreen` termasuk `STATUS_DRIVEN`, jadi bodi inilah
        yang ikut berdenyut. Layar di bawahnya tidak ikut, dijelaskan di atas.
      */}
      <RoundedBox
        args={[W, H, D]}
        radius={0.012}
        smoothness={2}
        position={[0, H / 2, 0]}
        castShadow
        receiveShadow
        material={m.pcbGreen}
      />

      {/* Bingkai gelap di sekeliling area kaca. */}
      <mesh position={[0, H / 2, D / 2 + 0.001]} material={m.cavity}>
        <boxGeometry args={[W - 0.06, H - 0.05, 0.002]} />
      </mesh>

      {/*
        Kaca LCD. `lcdGlass` punya `clearcoat` penuh supaya memantulkan
        cahaya studio, jadi layarnya terlihat seperti permukaan kaca dan
        bukan seperti bidang datar.
      */}
      <mesh position={[0, H / 2 + 0.012, D / 2 + 0.003]} material={m.lcdGlass}>
        <boxGeometry args={[W - 0.1, H - 0.09, 0.004]} />
      </mesh>

      {/*
        Layar yang memuat teks. Berada 0.006 unit di depan kaca supaya tidak
        z-fighting dengan bidang kaca di belakangnya.
      */}
      <mesh position={[0, H / 2 + 0.012, D / 2 + 0.006]}>
        <planeGeometry args={[W - 0.16, H - 0.14]} />
        <meshStandardMaterial
          map={screenMaterial.tex}
          emissiveMap={screenMaterial.tex}
          emissive="#ffffff"
          emissiveIntensity={0.9}
          roughness={0.3}
          metalness={0}
        />
      </mesh>

      {/* Potensiometer kontras di kanan bawah, ciri khas modul 1602. */}
      <mesh position={[W / 2 - 0.09, H / 2 - 0.06, D / 2 + 0.012]} castShadow material={m.knobBlack}>
        <cylinderGeometry args={[0.032, 0.032, 0.03, 12]} />
      </mesh>
      {/* Slot di potensiometer kontras, supaya terlihat bisa diputar. */}
      <mesh position={[W / 2 - 0.09, H / 2 - 0.06, D / 2 + 0.028]} material={m.silkscreen}>
        <boxGeometry args={[0.042, 0.006, 0.008]} />
      </mesh>

      {/*
        Empat lubang pemasangan di sudut modul. Modul 1602 asli punya dua,
        tapi modul backpack banyak yang menambahkannya; dua lubang di pojok
        kiri membuat tampilan lebih mirip kit jadi.
      */}
      {[
        [-W / 2 + 0.05, H - 0.05],
        [-W / 2 + 0.05, 0.05],
      ].map(([x, y], i) => (
        <mesh key={`hole${i}`} position={[x, y, D / 2 + 0.002]} material={m.cavity}>
          <cylinderGeometry args={[0.018, 0.018, 0.006, 12]} />
        </mesh>
      ))}

      {/*
        Header 4 pin di tepi bawah: VCC GND SDA SCL.
        Ditaruh di modul backpack, bukan di modul LCD, sesuai letak sebenarnya.
      */}
      {[-0.12, -0.04, 0.04, 0.12].map((x, i) => (
        <mesh
          key={`pin${i}`}
          position={[x, 0.028, -D / 2 - BACKPACK_T / 2]}
          castShadow
          material={m.gold}
        >
          <boxGeometry args={[0.03, 0.056, 0.03]} />
        </mesh>
      ))}
    </group>
  );
}
