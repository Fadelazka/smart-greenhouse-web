import { Suspense } from 'react';
import { RoundedBox, Text } from '@react-three/drei';
import { HARDWARE_PARTS } from './hardwareData';
import { FONT_MONO_BOLD } from './fonts';
import { useHardwareMaterials } from './materials';

/**
 * Modul relay 2-channel untuk pompa air.
 *
 * Bentuknya mengikuti modul relay generik yang banyak dijual: PCB merah,
 * dua relay kubit biru, sekrup terminal di satu sisi, dan soket header 4 pin
 * di sisi lain.
 *
 * Dua detail yang membuatnya terbaca sebagai modul relay, bukan sekadar
 * papan merah: kubit relay punya tonjolan_pin di sisi bawah, dan terminal
 * sekrup punya kepala silinder yang harus terlihat dari atas. Tanpa
 * tonjolan_pin, kubit biru terlihat seperti kotak tanpa fungsi.
 */

/** Posisi pusat dua kubit relay dalam sumbu X. */
const RELAY_X = [-0.26, 0.26] as const;

/** Kaki tonjolan relay, keluar dari sisi bawah kubit. */
const PIN_COUNT = 5;

const [W, , D] = HARDWARE_PARTS.relay.size;

/** Tebal PCB. Tipis, tapi cukup supaya sisi sisinya terlihat. */
const PCB_T = 0.024;

export function RelayModel() {
  const m = useHardwareMaterials();

  return (
    <group>
      {/* PCB merah. `pcbRed` termasuk `STATUS_DRIVEN`. */}
      <mesh position={[0, PCB_T / 2, 0]} castShadow receiveShadow material={m.pcbRed}>
        <boxGeometry args={[W, PCB_T, D]} />
      </mesh>

      {/*
        Dua kubit relay. `relayBlue` juga ikut berdenyut karena ia adalah
        badan utama yang dibaca pengguna sebagai "relay".
      */}
      {RELAY_X.map((x) => (
        <group key={`relay${x}`}>
          <RoundedBox
            args={[0.38, 0.3, 0.3]}
            radius={0.012}
            smoothness={2}
            position={[x, PCB_T + 0.15, -0.12]}
            castShadow
            material={m.relayBlue}
          />

          {/*
            Tonjolan_pin di sisi bawah kubit. Dijadikan lima batang per
            relay supaya bentuknya mengikuti kaki relay sungguhan, bukan
            hanya satu blok.
          */}
          {Array.from({ length: PIN_COUNT }, (_, i) => {
            const z = -0.12 + (i - (PIN_COUNT - 1) / 2) * 0.05;
            return (
              <mesh
                key={`relayPin${i}`}
                position={[x + (i % 2 === 0 ? -0.11 : 0.11), PCB_T + 0.012, z]}
                material={m.silver}
              >
                <boxGeometry args={[0.026, 0.024, 0.02]} />
              </mesh>
            );
          })}
        </group>
      ))}

      {/*
        Dua terminal sekrup: hijau untuk COM/NO, biru untuk common modul.
        Kepala sekrup dibuat silinder supaya memantulkan cahaya dari atas,
        yang menandakan bagian ini bisa dikencangkan.
      */}
      {[
        { x: -0.32, material: m.terminalGreen },
        { x: 0.32, material: m.terminalBlue },
      ].map((terminal) => (
        <group key={`terminal${terminal.x}`}>
          <RoundedBox
            args={[0.24, 0.16, 0.3]}
            radius={0.01}
            smoothness={2}
            position={[terminal.x, PCB_T + 0.08, 0.2]}
            castShadow
            material={terminal.material}
          />
          {/* Kepala sekrup di atas terminal. */}
          <mesh position={[terminal.x, PCB_T + 0.175, 0.2]} castShadow material={m.silver}>
            <cylinderGeometry args={[0.045, 0.045, 0.03, 12]} />
          </mesh>
          {/* Slot di kepala sekrup, dibuat gelap agar terbaca. */}
          <mesh position={[terminal.x, PCB_T + 0.191, 0.2]} material={m.cavity}>
            <boxGeometry args={[0.05, 0.006, 0.014]} />
          </mesh>
        </group>
      ))}

      {/*
        Soket header 4 pin di sisi -Z, untuk VCC GND IN dan NC.
        Diletakkan di tepi PCB supaya kabel menuju ESP32 tidak menabrak
        kubit relay.
      */}
      {[-0.15, -0.05, 0.05, 0.15].map((x, i) => (
        <mesh key={`pin${i}`} position={[x, PCB_T + 0.05, -D / 2 + 0.06]} castShadow material={m.gold}>
          <boxGeometry args={[0.028, 0.076, 0.028]} />
        </mesh>
      ))}

      {/* Soket plastik hitam tempat header itu duduk. */}
      <mesh position={[0, PCB_T + 0.022, -D / 2 + 0.06]} material={m.knobBlack}>
        <boxGeometry args={[0.42, 0.045, 0.1]} />
      </mesh>

      {/*
        LED indikator di dekat soket header. Warna amber dipakai, bukan hijau,
        karena hijau sudah dipakai untuk status "normal" pada alur status.
      */}
      <mesh position={[0.34, PCB_T + 0.02, -D / 2 + 0.06]} material={m.warnAmber}>
        <boxGeometry args={[0.04, 0.024, 0.03]} />
      </mesh>

      {/* Penanda silkscreen di permukaan PCB. */}
      <mesh position={[0, PCB_T + 0.002, 0.06]} material={m.silkscreen}>
        <boxGeometry args={[W - 0.16, 0.004, 0.02]} />
      </mesh>

      {/*
        Label K1 dan K2 di samping setiap kubit, mengikuti penamaan yang
        biasa dipakai pada modul relay 2-channel.
      */}
      <Suspense fallback={null}>
        {RELAY_X.map((x) => (
          <Text
            key={`label${x}`}
            font={FONT_MONO_BOLD}
            fontSize={0.042}
            color="#f2ecea"
            anchorX="center"
            anchorY="middle"
            position={[x, PCB_T + 0.005, 0.06]}
            rotation={[-Math.PI / 2, 0, 0]}
            outlineWidth={0}
          >
            {x < 0 ? 'K1' : 'K2'}
          </Text>
        ))}
      </Suspense>
    </group>
  );
}
