import { Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls, SoftShadows, Sparkles } from '@react-three/drei';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import {
  HARDWARE_ORBIT_TARGET,
  HARDWARE_PARTS,
  HARDWARE_WIRES,
  PIN_ANCHOR,
  STATUS_COLOR,
  STATUS_LABEL,
} from './hardwareData';
import { PartFrame } from './PartFrame';
import { Wire } from './Wire';
import { Esp32Model } from './Esp32Model';
import { Dht22Model } from './Dht22Model';
import { PotentiometerModel } from './PotentiometerModel';
import { RelayModel } from './RelayModel';
import { LcdModel } from './LcdModel';
import { useHardwareStatus, type HardwareVerdict } from './useHardwareStatus';
import { StudioEnvironment } from './StudioEnvironment';
import { PostEffects } from './PostEffects';
import { FpsMeter, useFpsFlag } from './FpsMeter';
import { ComponentDetailPanel } from './ComponentDetailPanel';
import { HardwareLogPanel } from './HardwareLogPanel';
import { DevSimulationPanel } from './DevSimulationPanel';
import { useSensorStore } from '@/store/sensorStore';
import type { HardwareComponentId } from '@/types';

/** Tipe ref kontrol orbit, diturunkan langsung dari komponen drei. */
export type HardwareOrbitHandle = React.ComponentRef<typeof OrbitControls>;

/**
 * Ubah anchor pin relatif menjadi koordinat dunia.
 *
 * `PIN_ANCHOR` menyimpan posisi relatif terhadap pusat komponennya, bukan
 * koordinat absolut, supaya memindahkan komponen cukup mengubah satu angka di
 * `HARDWARE_PARTS` tanpa menyunting 13 kabel satu per satu.
 */
function resolveAnchor(key: string): [number, number, number] {
  const component = key.split(':')[0];
  const part = HARDWARE_PARTS[component as HardwareComponentId];
  const offset = PIN_ANCHOR[key];
  return [part.position[0] + offset[0], part.position[1] + offset[1], part.position[2] + offset[2]];
}

/**
 * Kembalikan tampilan kamera ke posisi awal.
 *
 * Dipisah dari komponen supaya bisa dipakai tombol reset di panel luar tanpa
 * Harus mem-mount Canvas kedua. `controls.update()` wajib dipanggil setelah
 * posisi dan target diubah, kalau tidak OrbitControls akan menimpa kembali
 * dengan nilai internalnya pada frame berikutnya.
 */
export function resetHardwareView(controls: HardwareOrbitHandle | null): void {
  if (!controls) return;
  controls.object.position.set(HARDWARE_CAMERA.position[0], HARDWARE_CAMERA.position[1], HARDWARE_CAMERA.position[2]);
  controls.target.set(HARDWARE_ORBIT_TARGET[0], HARDWARE_ORBIT_TARGET[1], HARDWARE_ORBIT_TARGET[2]);
  controls.update();
}

/** Posisi kamera awal, dipakai `resetHardwareView`. */
const HARDWARE_CAMERA = { position: [4.6, 3.4, 6.2] as [number, number, number], fov: 42 };

export type HardwareCanvasProps = {
  /**
   * Status tiap komponen, dikirim dari pemanggil.
   *
   * Hook `useHardwareStatus` tidak boleh dipanggil sendiri di sini. Hook itu
   * menjalankan interval satu detik dan menulis setiap transisi ke log store,
   * jadi dua pemanggilannya akan menghasilkan dua interval yang mencatat log
   * ganda.
   */
  verdict: HardwareVerdict;
  still: boolean;
  hovered: HardwareComponentId | null;
  selected: HardwareComponentId | null;
  onHover: (id: HardwareComponentId | null, point: { x: number; y: number } | null) => void;
  onSelect: (id: HardwareComponentId) => void;
  controlsRef: React.RefObject<HardwareOrbitHandle | null>;
};

/**
 * Canvas 3D perangkat keras ESP32.
 *
 * Scene kedua yang berdiri sendiri. Greenhouse di atas tidak diubah dan tidak
 * berbagi Canvas, supaya penambahan ini tidak menyentuh performa dan perilaku
 * scene yang sudah berjalan.
 *
 * Semua geometry di sini prosedural: tidak ada file GLB atau tekstur, semua
 * dari `boxGeometry`, `cylinderGeometry`, dan `tubeGeometry`. Alasannya file
 * model tidak tersedia di repositori, dan memuat asset 3D akan menambah
 * permintaan jaringan pada halaman yang tadinya hanya ringan.
 */
export function HardwareCanvas({
  verdict,
  still,
  hovered,
  selected,
  onHover,
  onSelect,
  controlsRef,
}: HardwareCanvasProps) {
  // Nilai untuk layar LCD. Dibaca langsung dari store supaya teks di LCD
  // berubah mengikuti telemetry tanpa perlu state lift ke parent.
  const telemetry = useSensorStore((s) => s.telemetry);
  const pump = useSensorStore((s) => s.actuators.pump);

  // Resolusi anchor dihitung ulang hanya kalau data kabel berubah, bukan tiap
  // render. Scene ini merender ulang setiap kali status komponen berubah.
  const wires = useMemo(
    () =>
      HARDWARE_WIRES.map((wire) => ({
        ...wire,
        // Key harus unik per pasangan pin, karena GND dan VCC muncul di lebih
        // dari satu komponen dan tidak boleh berbagi key.
        key: `${wire.from}:${wire.fromPin}-${wire.to}:${wire.toPin}`,
        fromPoint: resolveAnchor(`${wire.from}:${wire.fromPin}`),
        toPoint: resolveAnchor(`${wire.to}:${wire.toPin}`),
      })),
    [],
  );

  return (
    <Canvas
      shadows
      // dpr dibatasi 1.75: di atas itu pixel tambahan tidak lagi terlihat pada
      // canvas setinggi 70vh, tapi biaya fill-rate naik proporsional.
      dpr={[1, 1.5]}
      frameloop={still ? 'demand' : 'always'}
      camera={{ position: HARDWARE_CAMERA.position, fov: HARDWARE_CAMERA.fov, near: 0.1, far: 60 }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        // ACESFilmic compressing range terang supaya tidak ada bagian metal
        // yang terbakar putih. R3F sudah memakai ini sebagai default, tapi
        // ditulis eksplisit karena seluruh look scene bergantung padanya.
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
      }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = SRGBColorSpace;
        gl.setClearColor('#0d1117');
      }}
    >
      <Suspense fallback={null}>
        {/*
          Environment lebih dulu karena material metal dan kaca membaca
          environment map. Tanpa ini, emas dan perak akan terlihat seperti
          plastik abu-abu.
        */}
        <StudioEnvironment />

        {/*
          Pencahayaan empat lapis:
          - ambient  : sumber dengan intensitas paling rendah, hanya menjaga
                       tidak ada sisi yang benar-benar hitam.
          - hemisphere: langit dan tanah, jadi sisi bawah komponen menerima
                       pantulan hangat dari lantai, bukan gelap total.
          - directional utama : sumber bayangan, shadow map 2048.
          - directional fill  : sisi berlawanan supaya sisi gelap tidak
                       kehilangan bentuk.
        */}
        <ambientLight intensity={0.3} />
        <hemisphereLight args={['#bcd8ff', '#2a1f14', 0.45]} />
        <directionalLight
          position={[5, 8, 4]}
          intensity={1.5}
          castShadow
          shadow-mapSize={[1024, 1024]}
          // Nilai negatif mencegah striping acne pada bidang datar seperti
          // PCB, yang biasanya muncul kalau bias dibiarkan 0.
          shadow-bias={-0.0001}
          shadow-normalBias={0.02}
          shadow-camera-left={-7}
          shadow-camera-right={7}
          shadow-camera-top={7}
          shadow-camera-bottom={-7}
          shadow-camera-near={0.5}
          shadow-camera-far={26}
        />
        <directionalLight position={[-5, 3, -4]} intensity={0.35} color="#7fa8d8" />

        {/* Lantai. Menerima bayangan supaya komponen terasa menempel. */}
        <mesh receiveShadow position={[0, -0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[22, 22]} />
          <meshStandardMaterial color="#0f141b" roughness={0.95} metalness={0.02} />
        </mesh>

        {/*
          Tiga sumber bayangan yang dipakai bersamaan:

          - `SoftShadows`    : menambal shader bayangan three.js supaya
                               ujungnya lembut (PCSS). Dipanggil tanpa props
                               memakai default, karena samples yang tinggi
                               sangat mahal.
          - `ContactShadows` : bayangan kontak di bawah objek. Ini yang
                               membuat komponen terlihat menempel di lantai,
                               bukan melayang. Tingginya 0.002 supaya tidak
                               z-fighting dengan lantai di -0.005.
          - shadow directional : tetap dipakai untuk bayangan berarah yang
                               punya arah jatuh, yang tidak bisa diberikan
                               oleh ContactShadows.

          ContactShadows di-render ulang tiap frame karena modelnya bergerak.
          `resolution` 512 dipilih agar blur 2.5 tidak terlihat kotak.
        */}
        <SoftShadows />
        <ContactShadows
          position={[0, 0.002, 0]}
          opacity={0.4}
          scale={14}
          blur={2.5}
          far={4}
          resolution={256}
          color="#000000"
        />

        {/* Debu halus, hanya saat animasi aktif. */}
        {!still && <Sparkles count={40} scale={[12, 5, 12]} size={1.6} speed={0.25} opacity={0.3} color="#9fd8ff" />}

        {/* Kabel digambar sebelum model supaya tidak menutupi pin. */}
        {wires.map((wire) => (
          <Wire
            key={wire.key}
            from={wire.fromPoint}
            to={wire.toPoint}
            color={wire.color}
            dimmed={hovered !== null || selected !== null}
          />
        ))}

        <HardwarePart id="esp32" verdict={verdict} hovered={hovered} selected={selected} onHover={onHover} onSelect={onSelect} still={still} labelHeight={0.42}>
          <Esp32Model />
        </HardwarePart>

        <HardwarePart id="dht22" verdict={verdict} hovered={hovered} selected={selected} onHover={onHover} onSelect={onSelect} still={still} labelHeight={0.46}>
          <Dht22Model />
        </HardwarePart>

        <HardwarePart id="potentiometer" verdict={verdict} hovered={hovered} selected={selected} onHover={onHover} onSelect={onSelect} still={still} labelHeight={0.5}>
          <PotentiometerModel />
        </HardwarePart>

        <HardwarePart id="relay" verdict={verdict} hovered={hovered} selected={selected} onHover={onHover} onSelect={onSelect} still={still} labelHeight={0.44}>
          <RelayModel />
        </HardwarePart>

        <HardwarePart id="lcd" verdict={verdict} hovered={hovered} selected={selected} onHover={onHover} onSelect={onSelect} still={still} labelHeight={0.4}>
          <LcdModel
            moisture={telemetry?.humTanah ?? null}
            temperature={telemetry?.suhu ?? null}
            pumpActive={pump === 'on'}
          />
        </HardwarePart>

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping={!still}
          dampingFactor={0.08}
          minDistance={3}
          maxDistance={14}
          minPolarAngle={0.22}
          maxPolarAngle={Math.PI / 2.05}
          target={HARDWARE_ORBIT_TARGET}
        />

        {/*
          Composer harus anak terakhir di dalam <Suspense>: dia mengambil alih
          proses render, jadi apa pun yang masih buffered setelahnya bisa terlewat.
          `PostEffects` juga memuat ToneMapping sendiri karena composer mematikan
          `gl.toneMapping` — lihat catatan di file tersebut.
        */}
        <PostEffects />
      </Suspense>
    </Canvas>
  );
}

/**
 * Satu komponen di dalam PartFrame, dengan posisi dari `HARDWARE_PARTS`.
 *
 * `verdict` diteruskan sebagai prop, bukan dipanggil sendiri lewat
 * `useHardwareStatus()`. Hook itu menyimpan interval satu detik dan menulis ke
 * log store, jadi memanggilnya di sini dan sekali lagi di `HardwareCanvas`
 * akan membuat enam interval berjalan bersamaan dan setiap transisi tercatat
 * enam kali.
 */
function HardwarePart({
  id,
  verdict,
  hovered,
  selected,
  onHover,
  onSelect,
  still,
  labelHeight,
  children,
}: {
  id: HardwareComponentId;
  verdict: HardwareVerdict;
  hovered: HardwareComponentId | null;
  selected: HardwareComponentId | null;
  onHover: HardwareCanvasProps['onHover'];
  onSelect: HardwareCanvasProps['onSelect'];
  still: boolean;
  labelHeight: number;
  children: React.ReactNode;
}) {
  const part = HARDWARE_PARTS[id];

  return (
    <group position={part.position}>
      <PartFrame
        id={id}
        shortName={part.shortName}
        status={verdict[id].status}
        hovered={hovered === id}
        selected={selected === id}
        onHover={onHover}
        onSelect={onSelect}
        still={still}
        labelHeight={labelHeight}
      >
        {children}
      </PartFrame>
    </group>
  );
}

/**
 * Seluruh section perangkat keras: judul, canvas, panel detail, log, dan
 * Dev Mode.
 *
 * Disusun di file yang sama dengan `HardwareCanvas` supaya state hover dan
 * seleksi hanya ada di satu tempat. `Visualisasi.tsx` tinggal merender
 * `<HardwareSection />` di bawah scene greenhouse tanpa tahu apa pun tentang
 * isi section ini.
 */
export function HardwareSection({ still }: { still: boolean }) {
  const [hovered, setHovered] = useState<HardwareComponentId | null>(null);
  const [selected, setSelected] = useState<HardwareComponentId | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const controlsRef = useRef<HardwareOrbitHandle>(null);
  // Hanya aktif kalau URL punya `?fps=1`, jadi tidak ada biaya di pemakaian normal.
  const showFps = useFpsFlag();

  const verdict = useHardwareStatus();

  const onHover = useCallback((id: HardwareComponentId | null, point: { x: number; y: number } | null) => {
    setHovered(id);
    if (point) setCursor(point);
  }, []);

  const onSelect = useCallback((id: HardwareComponentId) => {
    setSelected((prev) => (prev === id ? null : id));
  }, []);

  return (
    <section className="relative mx-auto w-full max-w-7xl px-4 pb-16 pt-10 lg:px-6">
      <header className="mb-4">
        <h2 className="text-[20px] font-semibold text-foreground">Perangkat Keras ESP32</h2>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
          Lima komponen dan 13 kabel sesuai diagram Wokwi. Semua model dibuat dari bentuk dasar
          three.js, tanpa file model eksternal. Klik komponen untuk melihat fungsi dan daftar pinnya.
        </p>
      </header>

      <div className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-xl border border-border">
        <FpsMeter enabled={showFps} />
        <HardwareCanvas
          verdict={verdict}
          still={still}
          hovered={hovered}
          selected={selected}
          onHover={onHover}
          onSelect={onSelect}
          controlsRef={controlsRef}
        />

        {/*
          Reset tampilan memakai helper yang sama dengan kontrol orbit di dalam
          Canvas, jadi tidak perlu membuat instance Canvas kedua.
        */}
        <button
          type="button"
          onClick={() => resetHardwareView(controlsRef.current)}
          className="absolute right-4 top-4 z-10 rounded-xl border border-white/15 bg-black/70 px-3.5 py-2 text-[13px] text-white/90 shadow-xl backdrop-blur-md transition-colors hover:bg-black/85 hover:text-white"
        >
          Reset tampilan
        </button>

        {hovered !== null && (
          <div
            style={{ left: cursor.x + 14, top: cursor.y + 14 }}
            className="pointer-events-none absolute z-20 rounded-lg border border-white/15 bg-black/85 px-2.5 py-1.5 backdrop-blur-md"
          >
            <p className="text-[12px] font-medium text-white">
              {HARDWARE_PARTS[hovered].name}
            </p>
            <p
              className="font-[family-name:var(--font-mono)] text-[11px]"
              style={{ color: STATUS_COLOR[verdict[hovered].status] }}
            >
              {STATUS_LABEL[verdict[hovered].status]}
            </p>
          </div>
        )}
      </div>

      {/*
        Panel dikemas dua kolom di layar lebar, satu kolom di layar sempit.

        Kolom kanan adalah flex container dengan `min-h-0`, dan tinggi area
        daftar log dikunci di dalam panelnya sendiri lewat `LIST_HEIGHT`.

        Versi sebelumnya membungkus log dengan `<div className="max-h-80">`
        yang merupakan blok biasa. Akibatnya `flex-1` di dalam daftar log tidak
        pernah mendapat tinggi terikat: daftar tumbuh mengikuti isi,
        melewati `max-h-80`, lalu menimpa Dev Mode di bawahnya.
      */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ComponentDetailPanel
          selected={selected}
          verdict={verdict}
          still={still}
          onSelect={setSelected}
          onClear={() => setSelected(null)}
        />
        <div className="flex min-h-0 flex-col gap-4">
          <HardwareLogPanel />
          <DevSimulationPanel />
        </div>
      </div>
    </section>
  );
}

export { HARDWARE_ORBIT_TARGET };
