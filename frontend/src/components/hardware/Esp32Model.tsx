import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import { RoundedBox, Text } from '@react-three/drei';
import type { InstancedMesh } from 'three';
import { Matrix4 } from 'three';
import { HARDWARE_PARTS } from './hardwareData';
import { FONT_MONO_BOLD } from './fonts';
import { useHardwareMaterials } from './materials';

/**
 * ESP32 DevKit C V4.
 *
 * Bentuknya diturunkan dari board aslinya: PCB hitam dengan sudut membulat,
 * modul ber-shield ESP32-WROOM-32D dengan antena PCB di ujungnya, header
 * 38 pin (19 per sisi), port micro-USB, tombol EN dan BOOT, serta dua LED
 * di dekat port USB.
 *
 * Panjang board 2.4 unit dipakai juga sebagai acuan ukuran komponen lain,
 * jadi angka di sini tidak boleh diubah tanpa menyesuaikan semua model.
 */

/** Jumlah pin per sisi. 19 x 2 = 38 pin, sesuai header DevKit varian 38-pin. */
const PINS_PER_SIDE = 19;

/**
 * Jarak antar pin.
 *
 * Total baris pin = 18 x 0.062 = 1.116 unit, muat di kedalaman board 1.3
 * dengan sisa 0.184 untuk margin di kedua ujung.
 */
const PIN_PITCH = 0.062;

const [BOARD_W, BOARD_H, BOARD_D] = HARDWARE_PARTS.esp32.size;

/** Tinggi permukaan PCB, dipakai semua detail yang menempel di atas board. */
const TOP = BOARD_H;

/**
 * Lebar jejak circuitry yang dicetak putih.
 *
 * 0.012 unit sudah cukup lebar untuk tetap terbaca sebagai garis putih dari
 * sudut pandang miring, tanpa mengambil area visual yang terlalu besar dari
 * permukaan board.
 */
const TRACE_W = 0.012;

/**
 * Jejak circuitry yang dicetak putih.
 *
 * `w` adalah panjang sumbu X, `d` adalah panjang sumbu Z. Semuanya duduk di
 * `y = TOP + 0.002`, cukup tinggi untuk menghindari z-fighting dengan
 * permukaan board, tapi setipis mungkin supaya tidak terlihat sebagai tonjolan.
 */
const TRACES: ReadonlyArray<{ x: number; z: number; w: number; d: number }> = [
  // Jalur horizontal dari sisi USB menuju modul WROOM.
  { x: -0.55, z: -0.34, w: 1.1, d: TRACE_W },
  { x: -0.55, z: -0.2, w: 1.1, d: TRACE_W },
  { x: -0.55, z: 0.22, w: 1.0, d: TRACE_W },
  { x: -0.5, z: 0.42, w: 1.2, d: TRACE_W },
  // Jalur vertikal penghubung.
  { x: -0.95, z: -0.27, w: TRACE_W, d: 0.14 },
  { x: -0.15, z: -0.27, w: TRACE_W, d: 0.14 },
  { x: 0.3, z: -0.09, w: TRACE_W, d: 0.26 },
  { x: 0.05, z: 0.32, w: TRACE_W, d: 0.2 },
  // Stub pendek ke arah tiap pin di sisi -Z.
  { x: -0.85, z: -0.56, w: TRACE_W, d: 0.16 },
  { x: -0.5, z: -0.56, w: TRACE_W, d: 0.16 },
  { x: -0.15, z: -0.56, w: TRACE_W, d: 0.16 },
  { x: 0.2, z: -0.56, w: TRACE_W, d: 0.16 },
];

/**
 * Matrix untuk InstancedMesh, dihitung satu kali.
 *
 * `Matrix4` diimpor sebagai kelas (bukan `new` inline di dalam loop render)
 * karena setiap instance butuh matrix sendiri. Kalau objeknya dipakai ulang,
 * semua pin akan menumpuk pada posisi yang sama.
 */
function usePinMatrices(count: number) {
  return useMemo(() => {
    const matrices: Matrix4[] = [];
    const half = (PINS_PER_SIDE - 1) / 2;

    for (let i = 0; i < count; i += 1) {
      const side = i < PINS_PER_SIDE ? -1 : 1;
      const index = i % PINS_PER_SIDE;
      const offset = (index - half) * PIN_PITCH;
      matrices.push(
        new Matrix4().makeTranslation(
          offset,
          TOP + 0.045,
          side * (BOARD_D / 2 + 0.035),
        ),
      );
    }

    return matrices;
  }, [count]);
}

export function Esp32Model() {
  const m = useHardwareMaterials();
  const pinRef = useRef<InstancedMesh>(null);
  const pinMatrices = usePinMatrices(PINS_PER_SIDE * 2);

  // Tulis matrix ke GPU satu kali setelah mount. `useLayoutEffect` dipakai,
  // bukan `useEffect`, supaya tidak ada frame pertama dengan 38 pin menumpuk
  // di titik asal sebelum INSTANCE_MATRIX terisi.
  useLayoutEffect(() => {
    const mesh = pinRef.current;
    if (!mesh) return;
    pinMatrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
  }, [pinMatrices]);

  return (
    <group>
      {/*
        Body PCB memakai `RoundedBox`. Sudut membulat 0.022 unit bukan
        kosmetik: pada box tajam, specular highlight dari directional light
        membentuk garis lurus yang terlihat seperti render blocky.
      */}
      <RoundedBox
        args={[BOARD_W, BOARD_H, BOARD_D]}
        radius={0.022}
        smoothness={3}
        position={[0, TOP / 2, 0]}
        castShadow
        receiveShadow
        material={m.pcbBlack}
      />

      {/*
        Modul ESP32-WROOM-32D. Shield perak memakai `RoundedBox` juga, dengan
        radius lebih kecil karena stamped metal biasanya radiusnya kecil.
      */}
      <RoundedBox
        args={[0.72, 0.11, 0.78]}
        radius={0.012}
        smoothness={2}
        position={[0.62, TOP + 0.055, 0]}
        castShadow
        material={m.silver}
      />

      {/*
        Marking pada shield.

        `<Suspense>` punya boundary sendiri supaya font yang belum selesai
        dimuat hanya menahan teks di bawahnya, bukan seluruh scene. Tanpa
        boundary, satu teks yang belum siap akan membuat board ikut hilang.
      */}
      <Suspense fallback={null}>
        <Text
          font={FONT_MONO_BOLD}
          fontSize={0.062}
          color="#2b2f33"
          anchorX="center"
          anchorY="middle"
          position={[0.62, TOP + 0.112, 0.06]}
          rotation={[-Math.PI / 2, 0, 0]}
          outlineWidth={0}
        >
          ESP32
        </Text>
        <Text
          font={FONT_MONO_BOLD}
          fontSize={0.036}
          color="#43484d"
          anchorX="center"
          anchorY="middle"
          position={[0.62, TOP + 0.112, -0.13]}
          rotation={[-Math.PI / 2, 0, 0]}
          outlineWidth={0}
        >
          WROOM-32D
        </Text>
      </Suspense>

      {/* Antena PCB di ujung +X, bentuknya sama seperti board aslinya. */}
      <mesh position={[1.06, TOP + 0.026, 0]} castShadow material={m.pcbBlack}>
        <boxGeometry args={[0.16, 0.03, 0.6]} />
      </mesh>

      {/* Port micro-USB di ujung -X: shell logam berlubang. */}
      <RoundedBox
        args={[0.14, 0.13, 0.34]}
        radius={0.01}
        smoothness={2}
        position={[-1.24, TOP + 0.065, 0]}
        castShadow
        material={m.silver}
      />
      {/* Rongga dalam port, gelap supaya terbaca sebagai lubang. */}
      <mesh position={[-1.31, TOP + 0.065, 0]} material={m.cavity}>
        <boxGeometry args={[0.02, 0.075, 0.23]} />
      </mesh>
      {/* Bahasa logam di dalam rongga, terlihat sebagai garis terang. */}
      <mesh position={[-1.315, TOP + 0.03, 0]} material={m.copper}>
        <boxGeometry args={[0.012, 0.02, 0.21]} />
      </mesh>

      {/*
        Header pin 38 buah dalam satu `InstancedMesh`.

        Ini alasan utama InstancedMesh dipakai di scene ini: 38 mesh terpisah
        berarti 38 draw call, dan board ESP32 cuma satu dari lima komponen.
        Dengan instancing, seluruh header jadi SATU draw call.
      */}
      <instancedMesh ref={pinRef} args={[undefined, undefined, PINS_PER_SIDE * 2]} castShadow material={m.gold}>
        <boxGeometry args={[0.03, 0.09, 0.03]} />
      </instancedMesh>

      {/*
        LED power dan LED aktivitas.

        `emissiveIntensity` di atas 1.0 (lihat `LED_RECIPES`) karena Bloom
        memakai `luminanceThreshold 0.9` terhadap input linear. LED dengan
        emissive di bawah 1.0 tidak akan pernah melewati ambang itu.
      */}
      <mesh position={[-0.95, TOP + 0.045, -0.44]} material={m.powerRed}>
        <boxGeometry args={[0.05, 0.03, 0.035]} />
      </mesh>
      <mesh position={[-0.8, TOP + 0.045, -0.44]} material={m.activityGreen}>
        <boxGeometry args={[0.05, 0.03, 0.035]} />
      </mesh>

      {/* Silkscreen: garis tepi board, seperti cetakan pada PCB aslinya. */}
      <mesh position={[0, TOP + 0.002, -BOARD_D / 2 + 0.045]} material={m.silkscreen}>
        <boxGeometry args={[BOARD_W - 0.2, 0.004, 0.02]} />
      </mesh>
      <mesh position={[0, TOP + 0.002, BOARD_D / 2 - 0.045]} material={m.silkscreen}>
        <boxGeometry args={[BOARD_W - 0.2, 0.004, 0.02]} />
      </mesh>
      <mesh position={[-BOARD_W / 2 + 0.045, TOP + 0.002, 0]} material={m.silkscreen}>
        <boxGeometry args={[0.02, 0.004, BOARD_D - 0.2]} />
      </mesh>
      <mesh position={[BOARD_W / 2 - 0.045, TOP + 0.002, 0]} material={m.silkscreen}>
        <boxGeometry args={[0.02, 0.004, BOARD_D - 0.2]} />
      </mesh>

      {/* Jejak circuitry putih tipis. */}
      {TRACES.map((trace, i) => (
        <mesh
          key={`trace${i}`}
          position={[trace.x, TOP + 0.002, trace.z]}
          material={m.silkscreen}
        >
          <boxGeometry args={[trace.w, 0.004, trace.d]} />
        </mesh>
      ))}

      {/*
        Marking pin EN dan BOOT. Teks kecil tapi ditulis, karena tanpa itu
        pengguna tidak tahu tombol mana yang reset dan mana yang mem bootloader.
      */}
      <Suspense fallback={null}>
        <Text
          font={FONT_MONO_BOLD}
          fontSize={0.032}
          color="#d8dcd8"
          anchorX="center"
          anchorY="middle"
          position={[-0.62, TOP + 0.004, -0.44]}
          rotation={[-Math.PI / 2, 0, 0]}
          outlineWidth={0}
        >
          EN
        </Text>
        <Text
          font={FONT_MONO_BOLD}
          fontSize={0.032}
          color="#d8dcd8"
          anchorX="center"
          anchorY="middle"
          position={[-0.42, TOP + 0.004, -0.44]}
          rotation={[-Math.PI / 2, 0, 0]}
          outlineWidth={0}
        >
          BOOT
        </Text>
      </Suspense>

      {/* Dua tombol tactile: EN (reset) dan BOOT, di sisi -Z dekat USB. */}
      <RoundedBox
        args={[0.11, 0.05, 0.11]}
        radius={0.012}
        smoothness={2}
        position={[-0.62, TOP + 0.026, -0.44]}
        castShadow
        material={m.knobBlack}
      />
      <RoundedBox
        args={[0.11, 0.05, 0.11]}
        radius={0.012}
        smoothness={2}
        position={[-0.42, TOP + 0.026, -0.44]}
        castShadow
        material={m.knobBlack}
      />
    </group>
  );
}
