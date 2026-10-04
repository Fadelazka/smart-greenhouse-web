import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { HARDWARE_PARTS } from './hardwareData';
import { useHardwareMaterials } from './materials';

/**
 * Sensor suhu dan kelembapan DHT22.
 *
 * Bentuknya mengikuti housing plastik putih DHT22 3-pin: kisi ventilasi
 * bercelah di bagian atas, dan tiga kaki tembaga yang ditekuk ke bawah.
 *
 * Kisi ventilasi dibuat dari bidang-bidang gelap yang sedikit tenggelam di
 * permukaan atas, bukan dari tekstur. Alasannya, tekstur akan hilang begitu
 * kamera bergerak ke sudut samping, sedangkan celah yang benar-benar
 * punya kedalaman tetap terbaca sebagai lubang dari arah mana pun.
 */

/** Jumlah celah ventilasi pada housing. */
const SLOT_COUNT = 5;

/**
 * Jarak antar celah.
 *
 * 5 celah dengan jarak 0.082 memakai 0.328 dari lebar 0.62, jadi masih
 * ada margin 0.146 di kiri dan kanan.
 */
const SLOT_PITCH = 0.082;

/** Lebar celah, dipakai untuk semua celah agar terlihat seragam. */
const SLOT_W = 0.038;

const [W, H, D] = HARDWARE_PARTS.dht22.size;

/** Posisi tiga kaki dalam sumbu X: dua di luar, satu di tengah. */
const PIN_X = [-0.24, 0, 0.24] as const;

export function Dht22Model() {
  const m = useHardwareMaterials();

  // Celah dihitung sekali lewat useMemo, bukan di dalam callback `map` yang
  // dipanggil setiap render. Posisinya statis, jadi tidak perlu dihitung ulang.
  const slots = useMemo(
    () =>
      Array.from({ length: SLOT_COUNT }, (_, i) => ({
        key: `slot${i}`,
        z: (i - (SLOT_COUNT - 1) / 2) * SLOT_PITCH,
      })),
    [],
  );

  return (
    <group>
      {/*
        Housing. `plasticWhite` ada di `STATUS_DRIVEN`, jadi material inilah
        yang akan ikut berdenyut ketika status komponen berubah.
      */}
      <RoundedBox
        args={[W, H, D]}
        radius={0.018}
        smoothness={2}
        position={[0, H / 2, 0]}
        castShadow
        receiveShadow
        material={m.plasticWhite}
      />

      {/*
        Celah ventilasi. Sedikit turun dari permukaan atas supaya ada bayangan
        sendiri di dalam celah. Kalau menempel persis di permukaan, hasilnya
        hanya garis rata dan dari sudut samping celahnya menghilang.
      */}
      {slots.map((slot) => (
        <mesh key={slot.key} position={[0, H - 0.008, slot.z]} material={m.cavity}>
          <boxGeometry args={[W - 0.16, 0.02, SLOT_W]} />
        </mesh>
      ))}

      {/*
        Tutup ventilasi: bidang datar yang menyatu dengan housing, memberi
        kesan kisi bertingkat dan bukan sekadar lubang di atas bidang datar.
      */}
      <mesh position={[0, H + 0.006, 0]} castShadow material={m.plasticWhite}>
        <boxGeometry args={[W - 0.06, 0.012, D - 0.06]} />
      </mesh>

      {/*
        LED indikator di dalam housing bening.

        Material diodanya dibuat emissive lembut, bukan material LED utama
        yang intensity-nya 2.6. Housing putihnya ikut meneruskan cahaya dengan
        intensitas yang jauh lebih rendah, jadi siluet housing tetap terbaca.
      */}
      <mesh position={[0, H * 0.42, D / 2 + 0.006]} material={m.ledSoftRed}>
        <boxGeometry args={[0.05, 0.028, 0.012]} />
      </mesh>

      {/* Tiga kaki tembaga yang ditekuk ke bawah. */}
      {PIN_X.map((x, i) => (
        <mesh key={`pin${i}`} position={[x, 0.045, 0]} castShadow material={m.copper}>
          <boxGeometry args={[0.055, 0.09, 0.026]} />
        </mesh>
      ))}

      {/*
        KakiPCB datar di dasar housing. Tanpa bidang ini, bagian bawah sensor
        terlihat melayang ketika kamera bergerak ke bawah.
      */}
      <mesh position={[0, 0.096, 0]} material={m.pcbGreen}>
        <boxGeometry args={[W - 0.12, 0.014, D - 0.1]} />
      </mesh>
    </group>
  );
}
