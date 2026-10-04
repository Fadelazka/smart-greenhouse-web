import { createContext, useContext, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { MathUtils } from 'three';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import { STATUS_COLOR } from './hardwareData';
import type { HardwareComponentId, HardwareStatus } from '@/types';

/**
 * Pembungkus yang dipakai kelima model.
 *
 * Tanggung jawabnya satu: hover, klik, skala, denyut status, dan label.
 * Kesembilan logika itu ditulis di sini supaya lima model tidak masing-masing
 * mengulanginya. Kalau denyut status ditulis lima kali, kelimanya pasti
 * berbeda sedikit dan tidak sinkron dengan isi log.
 *
 * Cara denyut bekerja
 * -------------------
 * Animasi TIDAK lewat state React. `useFrame` menelusuri anak-anaknya lalu
 * menulis langsung ke `material.emissiveIntensity`. Kalau lewat state,
 * setiap denyut memicu re-render seluruh subtree lima kali per detik - persis
 * penyebab fps anjlok yang paling sering terjadi di scene seperti ini.
 *
 * Material ikut berdenyut hanya kalau ditandai `userData.statusDriven`, jadi
 * silkscreen putih dan konektor USB tidak ikut menyala bersama PCB.
 */

export type PartFrameProps = {
  id: HardwareComponentId;
  shortName: string;
  status: HardwareStatus;
  hovered: boolean;
  selected: boolean;
  onHover: (id: HardwareComponentId | null, point: { x: number; y: number } | null) => void;
  onSelect: (id: HardwareComponentId) => void;
  /** Semua animasi dimatikan saat pengguna meminta reduced motion. */
  still: boolean;
  /** Tinggi label di atas komponen. */
  labelHeight: number;
  children: ReactNode;
};

/** Periode denyut dalam detik: error 1 detik, warning 2 detik. */
const PULSE_PERIOD: Record<HardwareStatus, number> = {
  normal: 0,
  warning: 2,
  error: 1,
};

export function PartFrame({
  id,
  shortName,
  status,
  hovered,
  selected,
  onHover,
  onSelect,
  still,
  labelHeight,
  children,
}: PartFrameProps) {
  const group = useRef<Group>(null);
  const active = hovered || selected;

  useFrame((state) => {
    const g = group.current;
    if (!g) return;

    // Skala 1.05 saat hover atau dipilih. Ini mengubah ukuran, bukan posisi,
    // jadi aman dipantulkan sedikit antar frame.
    const targetScale = active ? 1.05 : 1;
    const nextScale = MathUtils.lerp(g.scale.x, targetScale, 0.2);
    g.scale.setScalar(nextScale);

    if (status === 'normal') {
      // Kembalikan emissive ke nol. Tidak boleh dilewati, karena status bisa
      // berubah kembali ke normal kapan saja.
      applyPulse(g, status, 0);
      return;
    }

    const period = PULSE_PERIOD[status];
    const phase = (state.clock.elapsedTime % period) / period;
    // Sinus 0..1, jadi menyala lalu meredup tanpa nyangkut di ujung.
    const wave = still ? 0.6 : Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
    applyPulse(g, status, wave);
  });

  return (
    <group
      ref={group}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(id, { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHover(null, null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
    >
      <StatusContext.Provider value={{ status, active }}>{children}</StatusContext.Provider>

      {/* Label kecil di atas komponen, selalu menghadap kamera. */}
      <Html position={[0, labelHeight, 0]} center distanceFactor={9} zIndexRange={[10, 0]}>
        <span className="pointer-events-none flex select-none items-center gap-1 whitespace-nowrap rounded-full border border-white/15 bg-black/70 px-2 py-0.5 font-[family-name:var(--font-mono)] text-[11px] text-white/90 backdrop-blur-sm">
          {status !== 'normal' && (
            <span aria-hidden style={{ color: STATUS_COLOR[status] }}>
              ⚠
            </span>
          )}
          {shortName}
        </span>
      </Html>
    </group>
  );
}

/**
 * Tulis intensitas emissive ke semua material yang ditandai `statusDriven`.
 *
 * `intensity` 0 berarti tidak denyut, jadi materialnya dikembalikan ke warna
 * aslinya dan tidak menyimpan sisa emissive dari status sebelumnya.
 */
function applyPulse(group: Group, status: HardwareStatus, intensity: number): void {

    // Tetap perlu traversal: status sebelumnya bisa saja error.

  const color = STATUS_COLOR[status];
  const peak = status === 'error' ? 1 : 0.55;

  group.traverse((child) => {
    const mesh = child as Mesh;
    const material = mesh.material as MeshStandardMaterial | undefined;
    if (!material || Array.isArray(material)) return;
    if (!material.userData?.statusDriven) return;

    material.emissive.set(color);
    material.emissiveIntensity = intensity * peak;
  });
}

/** Nilai status yang diteruskan ke material di dalam model. */
export type PartStatus = {
  status: HardwareStatus;
  active: boolean;
};

export const StatusContext = createContext<PartStatus>({
  status: 'normal',
  active: false,
});

export function usePartStatus(): PartStatus {
  return useContext(StatusContext);
}
