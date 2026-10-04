import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { Esp32Model } from './Esp32Model';
import { Dht22Model } from './Dht22Model';
import { PotentiometerModel } from './PotentiometerModel';
import { RelayModel } from './RelayModel';
import { LcdModel } from './LcdModel';
import { selectReading, useSensorStore } from '@/store/sensorStore';
import { cn } from '@/lib/utils';
import type { HardwareComponentId } from '@/types';

/**
 * Pratinjau 3D untuk panel Detail Komponen.
 *
 * Dua mode:
 *  - `component: null` merakit kelima komponen pada posisi aslinya (default state).
 *  - `component: <id>` merender satu komponen (setelah diklik).
 *
 * Canvas-nya disengaja terpisah dari scene utama, bukan `view` dari canvas yang
 * sama: panel ini butuh kamera dan pencahayaan sendiri, dan `view` bersama
 * akan membuat perubahan kamera di sini ikut menggeser scene besar.
 *
 * SOAL UKURAN
 * -----------
 * Wrapper memakai `aspect-square w-full`, bukan ukuran piksel tetap. Versi
 * lama memakai `size={200}` di dalam kolom yang jauh lebih lebar, sehingga
 * Kotak 200px itu menggantung di tengah ruang kosong — persis keluhan "ngambang
 * di tengah". Sekarang boxed-nya mengikuti lebar kolom dan/optasional dibatasi
 * `max-w-*` dari pemanggil, jadi tidak pernah ada celah besar di sampingnya.
 *
 * SOAL FRAMELOOP
 * --------------
 * Permintaan "`frameloop='demand'`" tidak bisa diterapkan apa adanya kalau modelnya
 * ikut berputar: pada mode `demand` React Three Fiber hanya menggambar ulang saat
 * ada invalidate, jadi putaran akan macet di frame pertama. Auto-rotate dan
 * `demand` saling meniadakan. Karena itu `demand` dipakai hanya saat pengguna
 * mengaktifkan reduced motion, sama seperti scene utama.
 */

/**
 * Skala per komponen supaya tiap model mengisi bingkai dengan proporsi mirip.
 *
 * Model|Author pada satuan dunia scene utama: ESP32 lebar 2.4 unit,
 * sementara DHT22 hanya 0.62. Tanpa skala per komponen, DHT22 akan muncul
 * sebagai titik kecil di dalam bingkai yang sama.
 */
const MINI_SCALE: Record<HardwareComponentId, number> = {
  esp32: 0.7,
  dht22: 2.3,
  potentiometer: 2.3,
  relay: 1.6,
  lcd: 1.2,
};

/**
 * Bingkai rakitan, diturunkan dari posisi di `hardwareData`.
 *
 * Zentroid positionalnya (x 0.205, z 1.23), bukan titik asal. Versi lama memakai
 * offset tebakan sehingga pusat rakitan berakhir di (-0.158, -0.627): rakitan
 * terdorong ke belakang dan ke kiri, sehingga terlihat melayang gantung di
 * tengah bingkai. Offset di bawah dihitung dari centroidnya supaya berputar
 * tepat di titik asal.
 */
const ASSEMBLY_SCALE = 0.62;
const ASSEMBLY_CENTER: [number, number] = [0.205, 1.23];
const ASSEMBLY_OFFSET: [number, number, number] = [
  -ASSEMBLY_SCALE * ASSEMBLY_CENTER[0],
  // Models duduk di bidang y=0 dengan tinggi sampai ~0.62, jadi titik berat
  // vertikalnya sedikit di atas lantai.
  -ASSEMBLY_SCALE * 0.25,
  -ASSEMBLY_SCALE * ASSEMBLY_CENTER[1],
];

/**
 * Kelas ukuran untuk prop `size`.
 *
 * Sengaja ditulis sebagai tabel, bukan template literal
 * `` `w-[${size}px] h-[${size}px]` ``.
 *
 * Tailwind memindai sumber untuk *string* kelas yang lengkap, bukan untuk
 * hasil interpolasi. Versi yang memakai template literal lolos dari
 * typecheck dan `vite build` tanpa complaint, tetapi kelasnya tidak pernah
 * masuk ke CSS — pratinjaunya jadi tanpa lebar dan tinggi sama sekali.
 *lumpuh total di browser. Tabel di bawah membuat nama kelasnya muncul
 * literal di file, jadi pasti ter-generate.
 */
const SIZE_CLASS: Record<number, string> = {
  160: 'w-[160px] h-[160px]',
  280: 'w-[280px] h-[280px]',
};

export function ComponentMiniPreview({
  component,
  still,
  size,
  className,
}: {
  /** `null` untuk merakit seluruh komponen. */
  component: HardwareComponentId | null;
  still: boolean;
  /** Ukuran piksel tetap. Kosongkan supaya ikut lebar kolom (rasio 1:1). */
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-xl',
        'bg-[radial-gradient(circle_at_50%_42%,rgba(34,197,94,0.22),rgba(15,31,26,0.55)_62%,transparent_78%)]',
        // `size` dan `aspect-square` saling meniadakan, jadi kelas responsif
        // tetap dipakai ketika `size` diberikan.
        size ? SIZE_CLASS[size] : 'aspect-square w-full',
        className,
      )}
    >
      <Canvas
        // `alpha` supaya gradien CSS di belakang terlihat lewat canvas.
        gl={{ antialias: true, alpha: true }}
        // Jarak 4.0 memberi margin di atas jarak minimum 3.43 untuk lebar
        // rakitan pada skala 0.62, jadi tidak ada komponen yang terpotong tepi.
        camera={{ position: [0, 1.6, 4], fov: 40 }}
        // Batas dpr 1.5: panel ini cuma 160-280 piksel, dpr 3 tidak menambah
        // detail yang bisa dilihat tapi tetap menambah biaya fill-rate.
        dpr={[1, 1.5]}
        frameloop={still ? 'demand' : 'always'}
      >
        <Suspense fallback={null}>
          {/* Tanpa bayangan: panel sekecil ini tidak menampilkan bayangan
              yang berarti, tapi `castShadow` menambah satu render pass. */}
          <ambientLight intensity={0.55} />
          <hemisphereLight args={['#bcd8ff', '#2a1f14', 0.4]} />
          <directionalLight position={[3, 5, 4]} intensity={1.7} />
          <directionalLight position={[-4, 2, -3]} intensity={0.4} color="#7fa8d8" />

          {component === null ? (
            <AssemblyView still={still} />
          ) : (
            <SingleView component={component} still={still} />
          )}
        </Suspense>
      </Canvas>
    </div>
  );
}

/** Rakitan kelima komponen, diputar pelan sebagai satu grup. */
function AssemblyView({ still }: { still: boolean }) {
  return (
    <Spinner still={still}>
      <group scale={ASSEMBLY_SCALE} position={ASSEMBLY_OFFSET}>
        <Models />
      </group>
    </Spinner>
  );
}

/** Satu komponen, diputar pelan di titik asal. */
function SingleView({ component, still }: { component: HardwareComponentId; still: boolean }) {
  return (
    <Spinner still={still}>
      <group scale={MINI_SCALE[component]}>
        <Models only={component} />
      </group>
    </Spinner>
  );
}

/**
 * Putaran idle untuk pratinjau.
 *
 * `useFrame` cukup menerima delta waktu; yang dibutuhkan hanyalah putaran
 * sumbu Y.
 */
function Spinner({ still, children }: { still: boolean; children: React.ReactNode }) {
  const group = useRef<Group>(null);

  useFrame((_, delta) => {
    if (still || !group.current) return;
    group.current.rotation.y += delta * 0.35;
  });

  return <group ref={group}>{children}</group>;
}

/**
 * Kelima model, atau satu kalau `only` diisi.
 *
 * `LcdModel` butuh isi layarnya, jadi telemetry diambil di sini. Nilai null
 * membuat canvas LCD menampilkan placeholder, bukan angka yang beku.
 */
function Models({ only }: { only?: HardwareComponentId }) {
  const telemetry = useSensorStore((s) => s.telemetry);
  const pump = useSensorStore((s) => s.actuators.pump);

  const show = (id: HardwareComponentId) => only === undefined || only === id;

  return (
    <>
      {show('esp32') && <Esp32Model />}
      {show('dht22') && <Dht22Model />}
      {show('potentiometer') && <PotentiometerModel />}
      {show('relay') && <RelayModel />}
      {show('lcd') && (
        <LcdModel
          moisture={selectReading(telemetry, 'humTanah')}
          temperature={selectReading(telemetry, 'suhu')}
          pumpActive={pump === 'on'}
        />
      )}
    </>
  );
}
