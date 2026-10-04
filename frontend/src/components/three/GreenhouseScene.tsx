import { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { DayNightCycle, GreenhouseStructure } from './GreenhouseStructure';
import { ControllerStation } from './ControllerStation';
import { PlantBed } from './PlantBed';
import type { BedCondition, BedId, BedReading } from './sceneData';

const BED_POSITIONS: Array<[number, number, number]> = [
  [-2.35, 0, -1.15],
  [0, 0, -1.15],
  [2.35, 0, -1.15],
];

/** Tipe ref kontrol orbit, diturunkan langsung dari komponen drei. */
export type OrbitHandle = React.ComponentRef<typeof OrbitControls>;

/**
 * Canvas 3D greenhouse.
 *
 * `frameloop` dipilih adaptif: "demand" saat pengguna meminta reduced motion
 * sehingga GPU ikut idle, dan "always" saat animasi perlu berjalan. Tradeoff
 * ini disengaja: PLANNING.md 9.2 menyarankan demand demi hemat GPU, tetapi
 * siklus siang-malam dan Goyang daun butuh frame terus-menerus.
 *
 * `dpr` dibatasi [1, 1.5], sama seperti HardwareScene. Layar retina 3x tidak
 * menambah informasi visual pada scene ini, hanya memboroskan piksel, dan
 * scene greenhouse punya banyak panel kaca transmissive yang mahal dirender.
 */
export function GreenhouseCanvas({
  readings,
  conditions,
  still,
  onHoverBed,
  onSelectBed,
  selected,
  controlsRef,
}: {
  readings: Record<BedId, BedReading>;
  conditions: Record<BedId, BedCondition>;
  still: boolean;
  onHoverBed: (id: BedId | null, point: { x: number; y: number } | null) => void;
  onSelectBed: (id: BedId) => void;
  selected: BedId | null;
  controlsRef: React.RefObject<OrbitHandle | null>;
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      frameloop={still ? 'demand' : 'always'}
      camera={{ position: [6.4, 4.6, 8.2], fov: 42, near: 0.1, far: 120 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => gl.setClearColor('#0d1117')}
    >
      <Suspense fallback={null}>
        <DayNightCycle still={still} />
        <GreenhouseStructure still={still} />
        <ControllerStation />

        {BED_POSITIONS.map((pos, i) => {
          const id = (i + 1) as BedId;
          return (
            <PlantBed
              key={id}
              id={id}
              position={pos}
              reading={readings[id]}
              condition={conditions[id]}
              selected={selected === id}
              onHover={onHoverBed}
              onSelect={onSelectBed}
              still={still}
            />
          );
        })}

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping={!still}
          dampingFactor={0.08}
          minDistance={4.5}
          maxDistance={19}
          // Sudut dibatasi supaya kamera tidak bisa menembus tanah atau
          // berputar sampai melihat atap dari dalam dengan sudut tajam.
          minPolarAngle={0.22}
          maxPolarAngle={Math.PI / 2.05}
          target={[0, 1.05, 0]}
        />
      </Suspense>
    </Canvas>
  );
}

/** Tombol reset memakai ref kontrol yang sama dengan yang di dalam Canvas. */
export function useOrbitControls() {
  return useRef<OrbitHandle>(null);
}

export { BED_POSITIONS };
export type { BedCondition, BedId, BedReading };
