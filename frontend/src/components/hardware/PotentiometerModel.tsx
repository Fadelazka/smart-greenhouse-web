import { Suspense, useMemo } from 'react';
import { RoundedBox, Text } from '@react-three/drei';
import { HARDWARE_PARTS } from './hardwareData';
import { FONT_MONO_BOLD } from './fonts';
import { useHardwareMaterials } from './materials';

/**
 * Potensiometer putar untuk simulasi sensor kelembapan tanah.
 *
 * Bentuknya mengikuti trimmer 3386 yang umum dipakai di kit greenhouse:
 * bodi biru persegi, knurled knob hitam di atas, penanda putih di ujung knob,
 * dan tiga kaki tembaga di bawah.
 *
 * Yang membuat model ini terbaca sebagai "potensiometer" dan bukan sekadar
 * kotak biru adalah detail knurling pada knob. Tanpa alur-alur itu, knob
 * hanya terlihat seperti silinder hitam datar.
 */

/** Jumlah alur knurling di sekeliling knob. */
const KNURL_COUNT = 20;

/**
 * Jari-jari knurled knob.
 *
 * Knob berdiameter 0.3 dari bodi selebar 0.58, jadi masih ada 0.14 ruang
 * untuk dinding bodi di sekelilingnya.
 */
const KNOB_R = 0.15;

const [W, H, D] = HARDWARE_PARTS.potentiometer.size;

/** Posisi tiga kaki dalam sumbu X. */
const PIN_X = [-0.24, 0, 0.24] as const;

export function PotentiometerModel() {
  const m = useHardwareMaterials();

  // Posisi alur knurling dihitung sekali: 20 titik keliling lingkaran dengan
  // radius 0.15, jadi circumference sekitar 0.94 unit.
  const knurls = useMemo(
    () =>
      Array.from({ length: KNURL_COUNT }, (_, i) => {
        const angle = (i / KNURL_COUNT) * Math.PI * 2;
        return {
          key: `knurl${i}`,
          angle,
          x: Math.cos(angle) * KNOB_R,
          z: Math.sin(angle) * KNOB_R,
        };
      }),
    [],
  );

  return (
    <group>
      {/* Badan biru. `plasticBlue` termasuk `STATUS_DRIVEN`. */}
      <RoundedBox
        args={[W, H, D]}
        radius={0.02}
        smoothness={2}
        position={[0, H / 2, 0]}
        castShadow
        receiveShadow
        material={m.plasticBlue}
      />

      {/*
        Poros logam di antara bodi dan knob. Bagian ini yang membuat knob
        terlihat menempel pada bodi, bukan melayang di atasnya.
      */}
      <mesh position={[0, H - 0.015, 0]} castShadow material={m.silver}>
        <cylinderGeometry args={[0.055, 0.055, 0.05, 16]} />
      </mesh>

      {/* Knob hitam, silinder pendek dengan tepi membulat. */}
      <mesh position={[0, H + 0.055, 0]} castShadow material={m.knobBlack}>
        <cylinderGeometry args={[KNOB_R, KNOB_R * 0.94, 0.11, 32]} />
      </mesh>

      {/*
        Alur knurling: 20 batang kecil mengelilingi knob.

        Dipakai sebagai mesh terpisah, bukan tekstur, karena tekstur knurling
        akan hilang di jarak jauh sedangkan alur ini tetap memberi siluet
        bergerigi yang langsung menandakan knob putar.
      */}
      {knurls.map((k) => (
        <mesh
          key={k.key}
          position={[k.x, H + 0.055, k.z]}
          rotation={[0, -k.angle, 0]}
          material={m.knobBlack}
        >
          <boxGeometry args={[0.016, 0.1, 0.03]} />
        </mesh>
      ))}

      {/*
        Penanda putih di ujung knob: satu garis radially yang menunjukkan
        posisi penunjuk saat ini. Ini satu-satunya detail yang membuat pengguna
        bisa mengira knob bisa diputar.
      */}
      <mesh position={[KNOB_R * 0.55, H + 0.055, 0]} rotation={[0, 0, Math.PI / 2]} material={m.silkscreen}>
        <boxGeometry args={[KNOB_R * 0.8, 0.104, 0.016]} />
      </mesh>

      {/* Tutup atas knob, sedikit lebih kecil supaya ada garis bayangan. */}
      <mesh position={[0, H + 0.112, 0]} material={m.knobBlack}>
        <cylinderGeometry args={[KNOB_R * 0.9, KNOB_R * 0.9, 0.012, 32]} />
      </mesh>

      {/* Tiga kaki tembaga. */}
      {PIN_X.map((x, i) => (
        <mesh key={`pin${i}`} position={[x, 0.045, 0]} castShadow material={m.copper}>
          <boxGeometry args={[0.055, 0.09, 0.026]} />
        </mesh>
      ))}

      {/*
        Papan PCB dasar. Sama seperti DHT22, tanpa bidang dasar bodi
        akan terlihat melayang dari bawah.
      */}
      <mesh position={[0, 0.096, 0]} material={m.pcbGreen}>
        <boxGeometry args={[W - 0.12, 0.014, D - 0.1]} />
      </mesh>

      {/*
        Label kecil di sisi bodi. Tanpa label, komponen ini tidak bisa
        dibedakan dari potentiometer lain yang warna bodinya sama.

        Teks memakai font yang di-bundle lokal (lihat `fonts.ts`), bukan
        default `drei/Text` yang sumbernya tidak terjamin.
      */}
      <Suspense fallback={null}>
        <Text
          font={FONT_MONO_BOLD}
          fontSize={0.048}
          color="#eef1f4"
          anchorX="center"
          anchorY="middle"
          position={[0, H * 0.32, D / 2 + 0.004]}
          outlineWidth={0}
        >
          POT 10K
        </Text>
      </Suspense>
    </group>
  );
}
