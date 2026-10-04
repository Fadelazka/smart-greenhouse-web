import { useMemo, useRef, useState } from 'react';
import { Html, Instance, Instances } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { CONDITION_LABEL, plantVigor, type BedCondition, type BedId, type BedReading } from './sceneData';

/**
 * Satu bed tanaman: pot, tanah, dan sekumpulan daun.
 *
 * Semua bentuknya primitive (Box, Cylinder, Sphere via Instances) -
 * tidak ada file model 3D di repo ini, sesuai PLANNING.md 5.3.
 *
 * Daun dipakai `Instances` dari drei supaya seluruh daun dalam satu bed
 * jadi SATU draw call. Kalau memakai 60 mesh terpisah, tiap tanaman
 * menambah draw call dan fps anjlok di perangkat tipis.
 */

const LEAVES_PER_PLANT = 5;
const PLANTS_PER_BED = 7;
const BED_WIDTH = 2.1;
const BED_DEPTH = 1.5;
const BED_HEIGHT = 0.34;

/** Warna daun per kondisi - selalu disertai ikon + teks di tooltip. */
const LEAF_COLOR: Record<BedCondition, string> = {
  ok: '#3f9c53',
  warning: '#b8860b',
  critical: '#a16207',
  unknown: '#4b5563',
};

export type PlantBedProps = {
  id: BedId;
  position: [number, number, number];
  reading: BedReading;
  condition: BedCondition;
  selected: boolean;
  onHover: (id: BedId | null, point: { x: number; y: number } | null) => void;
  onSelect: (id: BedId) => void;
  /** Semua animasi dimatikan saat pengguna meminta reduced motion. */
  still: boolean;
};

export function PlantBed({
  id,
  position,
  reading,
  condition,
  selected,
  onHover,
  onSelect,
  still,
}: PlantBedProps) {
  const [hovered, setHovered] = useState(false);
  const group = useRef<Group>(null);

  const vigor = plantVigor(reading);
  const leafColor = LEAF_COLOR[condition];

  // Posisi daun dihitung sekali dan tidak pernah berubah ulang. Plantasi ulang
  // tiap tick telemetry akan membuat ulang buffer instanced_mesh 60 kali per
  // menit dan itu penyebab paling umum fps turun tanpa reason.
  const plants = useMemo(() => {
    const out: Array<{ x: number; z: number; scale: number; phase: number }> = [];
    for (let p = 0; p < PLANTS_PER_BED; p++) {
      const col = p % 4;
      const row = Math.floor(p / 4);
      out.push({
        x: (col - 1.5) * (BED_WIDTH / 4.6),
        z: (row - 0.5) * (BED_DEPTH / 3.2),
        scale: 0.75 + ((p * 37) % 11) / 22,
        phase: (p * 1.7) % (Math.PI * 2),
      });
    }
    return out;
  }, []);

  const leaves = useMemo(() => {
    const out: Array<{ x: number; y: number; z: number; s: number; tilt: number; phase: number }> = [];
    for (const plant of plants) {
      for (let l = 0; l < LEAVES_PER_PLANT; l++) {
        const angle = (l / LEAVES_PER_PLANT) * Math.PI * 2 + plant.phase;
        const height = 0.34 + (l % 2) * 0.09;
        out.push({
          x: plant.x + Math.cos(angle) * 0.055,
          y: BED_HEIGHT + height * vigor * plant.scale,
          z: plant.z + Math.sin(angle) * 0.055,
          s: (0.42 + (l % 3) * 0.06) * (0.55 + vigor * 0.65) * plant.scale,
          tilt: angle,
          phase: plant.phase + l * 0.5,
        });
      }
    }
    return out;
  }, [plants, vigor]);

  // Goyang pelan saat angin. Nonaktif saat still (reduced motion) supaya tidak
  // ada gerakan sama sekali, bukan cuma lebih lambat.
  useFrame((state) => {
    if (!group.current || still) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.z = Math.sin(t * 0.6 + id) * 0.012;
  });

  const active = hovered || selected;

  return (
    <group
      ref={group}
      position={position}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        onHover(id, { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHovered(false);
        onHover(null, null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
    >
      {/* Pot: box kayu dengan dinding yang sedikit lebih tinggi. */}
      <mesh castShadow receiveShadow position={[0, BED_HEIGHT / 2, 0]}>
        <boxGeometry args={[BED_WIDTH, BED_HEIGHT, BED_DEPTH]} />
        <meshStandardMaterial
          color={active ? '#6b4f36' : '#5a4430'}
          roughness={0.85}
          metalness={0.02}
        />
      </mesh>

      {/* Permukaan tanah di dalam pot. */}
      <mesh receiveShadow position={[0, BED_HEIGHT - 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BED_WIDTH - 0.12, BED_DEPTH - 0.12]} />
        <meshStandardMaterial color="#3b2b20" roughness={1} />
      </mesh>

      {/* Daun: satu instanced mesh untuk seluruh bed ini. */}
      <Instances limit={PLANTS_PER_BED * LEAVES_PER_PLANT} range={leaves.length}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial
          color={leafColor}
          roughness={0.65}
          emissive={selected ? leafColor : '#000000'}
          emissiveIntensity={selected ? 0.18 : 0}
        />
        {leaves.map((leaf, i) => (
          <Instance
            key={`${id}-${i}`}
            position={[leaf.x, leaf.y, leaf.z]}
            scale={[leaf.s * 1.5, leaf.s * 0.55, leaf.s]}
            rotation={[0, leaf.tilt, leaf.tilt * 0.25]}
          />
        ))}
      </Instances>

      {/* Cincin penanda bed yang sedang dipilih atau di-hover. */}
      {active && (
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[BED_WIDTH * 0.62, BED_WIDTH * 0.68, 48]} />
          <meshBasicMaterial
            color={condition === 'critical' ? '#ef4444' : '#22c55e'}
            transparent
            opacity={0.75}
            side={2}
          />
        </mesh>
      )}

      {/* Label kecil penanda bed, selalu menghadap kamera. */}
      <Html position={[0, BED_HEIGHT + 0.95, 0]} center distanceFactor={9} zIndexRange={[10, 0]}>
        <span className="select-none whitespace-nowrap rounded-full border border-white/15 bg-black/55 px-2 py-0.5 font-[family-name:var(--font-mono)] text-[11px] text-white/90 backdrop-blur-sm">
          Bed {id}
        </span>
      </Html>
    </group>
  );
}

/** Tooltip yang mengikuti posisi kursor di atas bed (PLANNING.md 5.3). */
export function BedTooltip({
  x,
  y,
  reading,
  condition,
}: {
  x: number;
  y: number;
  reading: BedReading;
  condition: BedCondition;
}) {
  return (
    <div
      className="pointer-events-none fixed z-50 w-52 rounded-xl border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)]/95 p-3 text-[12px] shadow-2xl backdrop-blur-md"
      style={{ left: x + 14, top: y + 14 }}
      role="tooltip"
    >
      <p className="mb-1.5 text-[13px] font-medium text-[color:var(--color-fg)]">Kondisi bed</p>
      <p className="mb-2 text-[color:var(--color-fg-muted)]">{CONDITION_LABEL[condition]}</p>
      <dl className="space-y-1">
        <div className="flex justify-between gap-2">
          <dt className="text-[color:var(--color-fg-subtle)]">Suhu</dt>
          <dd className="value-tabular text-[color:var(--color-sun)]">
            {reading.suhu === null ? '-' : `${reading.suhu.toFixed(1)}C`}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[color:var(--color-fg-subtle)]">Tanah</dt>
          <dd className="value-tabular text-[color:var(--color-water)]">
            {reading.humTanah === null ? '-' : `${reading.humTanah.toFixed(0)}%`}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[color:var(--color-fg-subtle)]">Udara</dt>
          <dd className="value-tabular text-[color:var(--color-canopy)]">
            {reading.humUdara === null ? '-' : `${reading.humUdara.toFixed(0)}%`}
          </dd>
        </div>
      </dl>
    </div>
  );
}
