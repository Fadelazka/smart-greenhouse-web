import { Suspense, useMemo } from 'react';
import { Text } from '@react-three/drei';
import { Esp32Model } from '../hardware/Esp32Model';
import { RelayModel } from '../hardware/RelayModel';
import { PotentiometerModel } from '../hardware/PotentiometerModel';
import { Wire } from '../hardware/Wire';
import { FONT_MONO_BOLD } from '../hardware/fonts';

/**
 * Station kontrol di dalam greenhouse.
 *
 * Scene greenhouse sebelumnya hanya berisi tanaman, jadi sensor yang membaca
 * tanaman itu tidak pernah terlihat di tempat sensor bekerja. Station ini
 * menaruh ESP32 dan modul relay di rak dinding belakang, lalu menarik kabel
 * menuju probe tanah di bed tengah, supaya hubungan antara angka di layar dan
 * tanaman di ruangan itu terbaca tanpa perlu penjelasan.
 *
 * Posisinya di dinding `+Z`, sedangkan bed tanaman berada di `Z` negatif, jadi
 * station ini tidak pernah menutupi atau menutupi view bed.
 */

/** Ukuran rak dan posisi station di dalam greenhouse. */
const SHELF_Y = 1.52;
const SHELF_Z = 2.16;
const SHELF_X = -2.45;
const SHELF_W = 1.5;
const SHELF_D = 0.34;

/** Titik jangkar probe tanah di bed tengah. */
const PROBE_POSITION: [number, number, number] = [0.34, 0.34, -1.15];

/** Titik bawah relay, tempat kabel attach. */
const RELAY_ANCHOR: [number, number, number] = [
  SHELF_X + 0.42,
  SHELF_Y + 0.14,
  SHELF_Z - 0.12,
];

export function ControllerStation() {
  /**
 * Posisi untuk jalur kabel dan label rak.
   *
   * Semua posisi dihitung sekali, bukan di dalam `map` yang dipanggil ulang
   * setiap render, supaya tidak ada alokasi ulang yang tidak perlu.
   */
  const conduit = useMemo(() => {
    const top = SHELF_Y + 0.95;
    return {
      vertical: [
        [SHELF_X - 0.5, SHELF_Y + 0.55, SHELF_Z] as [number, number, number],
        [SHELF_X - 0.5, top, SHELF_Z] as [number, number, number],
      ],
      elbow: [
        [SHELF_X - 0.5, top, SHELF_Z] as [number, number, number],
        [SHELF_X - 0.5, top, SHELF_Z - 0.9] as [number, number, number],
      ],
    };
  }, []);

  return (
    <group>
      {/* Rak dinding dan dua braketnya. */}
      <mesh position={[SHELF_X, SHELF_Y, SHELF_Z]} castShadow receiveShadow>
        <boxGeometry args={[SHELF_W, 0.05, SHELF_D]} />
        <meshStandardMaterial color="#6b5540" roughness={0.82} metalness={0.04} />
      </mesh>

      {[-1, 1].map((side) => (
        <mesh
          key={`bracket-${side}`}
          position={[SHELF_X + side * (SHELF_W / 2 - 0.16), SHELF_Y - 0.16, SHELF_Z]}
          castShadow
        >
          <boxGeometry args={[0.05, 0.32, SHELF_D * 0.8]} />
          <meshStandardMaterial color="#7d8894" roughness={0.45} metalness={0.6} />
        </mesh>
      ))}

      {/*
        Papan ESP32 dan modul relay di atas rak.

        Keduanya dibungkus `group` berskala karena model detail sudah diatur untuk
        ukuran meter di section hardware. Di greenhouse ukurannya jauh lebih
        kecil supaya tetap jadi konteks, bukan subjek utama.
      */}
      <group position={[SHELF_X - 0.32, SHELF_Y + 0.028, SHELF_Z]} scale={0.42}>
        <Suspense fallback={null}>
          <Esp32Model />
        </Suspense>
      </group>

      <group position={[RELAY_ANCHOR[0], SHELF_Y + 0.028, RELAY_ANCHOR[2] + 0.12]} scale={0.42}>
        <Suspense fallback={null}>
          <RelayModel />
        </Suspense>
      </group>

      {/* Label rak, memakai font lokal yang sama dengan model hardware. */}
      <Suspense fallback={null}>
        <Text
          position={[SHELF_X, SHELF_Y + 0.075, SHELF_Z + SHELF_D / 2 + 0.01]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.09}
          color="#d8dee6"
          font={FONT_MONO_BOLD}
          anchorX="center"
          anchorY="middle"
        >
          AGRI CONTROL
        </Text>
      </Suspense>

      {/*
        Kabel conduit dari dinding ke rak, memakai komponen `Wire` yang sama
        dengan section hardware. Dengan begitu bentuk kabelnya konsisten di
        kedua bagian halaman.
      */}
      <Wire from={conduit.vertical[0]} to={conduit.vertical[1]} color="#2f3338" radius={0.03} />
      <Wire from={conduit.elbow[0]} to={conduit.elbow[1]} color="#2f3338" radius={0.03} />

      {/* Probe tanah, planted di bed tengah. */}
      <group position={PROBE_POSITION} scale={0.55}>
        <Suspense fallback={null}>
          <PotentiometerModel />
        </Suspense>
      </group>

      {/* Kabel dari relay ke probe tanah. */}
      <Wire from={RELAY_ANCHOR} to={PROBE_POSITION} color="#c9a227" radius={0.022} dimmed />
    </group>
  );
}
