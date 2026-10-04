import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Instance, Instances, Sparkles } from '@react-three/drei';
import {
  DoubleSide,
  Euler,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type DirectionalLight,
  type Fog,
  type HemisphereLight,
} from 'three';

/**
 * Rangka greenhouse, kaca, ventilasi atap, dan tanah - semuanya primitive.
 *
 * Sesuai PLANNING.md 5.3 tidak ada file model di repo, jadi rangka dibangun dari
 * box tipis. Rangka memakai gaya wireframe: box sangat tipis dengan warna
 * metalik, bukan garis, supaya tetap terbaca saat kamera bergerak.
 *
 * Seluruh balok rangka digambar dalam SATU `Instances`, jadi struktur greenhouse
 * hanya satu draw call. Kalau tiap balok jadi mesh sendiri, rangka saja bisa
 * memakan 30 draw call sebelum tanaman dan hardware digambar.
 */

const SPAN_X = 7.2;
const SPAN_Z = 5.2;
const WALL_H = 2.9;
const RIDGE_H = 4.1;
const POST = 0.09;

/** Kenaikan atap dari eaves ke ridge. */
const ROOF_RISE = RIDGE_H - WALL_H;
/** Jarak horizontal ridge ke eaves, yaitu setengah kedalaman greenhouse. */
const ROOF_RUN = SPAN_Z / 2;
/** Panjang satu bidang atap miring. */
const SLOPE_LEN = Math.hypot(ROOF_RISE, ROOF_RUN);
/** Sudut atap terhadap horizontal, dihitung dari konstanta di atas. */
const ROOF_ANGLE = Math.atan2(ROOF_RISE, ROOF_RUN);

/** Ukuran bukaan ventilasi atap dan sudut bukaannya, dalam radian. */
const VENT_W = 1.5;
const VENT_L = 0.92;
const VENT_OPEN = 0.44;

/** Lebar dan tinggi pintu di ujung greenhouse. */
const DOOR_W = 1.15;
const DOOR_H = 2.15;

/** Sumbu Y di ruang lokal, dipakai menyejajarkan strut ke sebuah arah. */
const UP_Y = new Vector3(0, 1, 0);

/**
 * Arah menuruni atap dari ridge ke eaves.
 *
 * Untuk `sz = 1` mengarah ke bawah dan ke +Z, untuk `sz = -1` cerminannya.
 * Semua geometri atap diturunkan dari vektor ini, sehingga kemiringannya tidak
 * pernah menyimpang dari `ROOF_ANGLE`.
 */
function downSlope(sz: number): Vector3 {
  return new Vector3(0, -Math.sin(ROOF_ANGLE), sz * Math.cos(ROOF_ANGLE));
}

/**
 * Rotasi Euler yang menyejajarkan sumbu Y lokal ke arah `direction`.
 *
 * Balok dan cylinder geometri R3F dibangun memanjang di sumbu Y, jadi
 * menyejajarkan sumbu Y lokal ke arah yang dikehendaki sudah cukup untuk
 * membuat keduanya tegak lurus terhadap arah tersebut.
 */
function rotationAlong(direction: Vector3): [number, number, number] {
  const euler = new Euler().setFromQuaternion(
    new Quaternion().setFromUnitVectors(UP_Y, direction.clone().normalize()),
  );
  return [euler.x, euler.y, euler.z];
}

/** Mengubah `Vector3` menjadi tuple yang diterima prop `position` R3F. */
function toTuple(v: Vector3): [number, number, number] {
  return [v.x, v.y, v.z];
}

type FramePart = {
  key: string;
  pos: [number, number, number];
  rot: [number, number, number];
  size: [number, number, number];
};

/**
 * Daftar seluruh balok rangka.
 *
 * `rot` dipakai karena atap harus benar-benar miring. Versi sebelumnya menulis
 * balok atap datar dengan lebar tetap, sehingga yang terlihat hanya kotak
 * melayang, bukan atap segitiga.
 */
function buildFrame(): FramePart[] {
  const parts: FramePart[] = [];
  const halfX = SPAN_X / 2;
  const halfZ = SPAN_Z / 2;
  const midRoofY = (WALL_H + RIDGE_H) / 2;

  // Empat tiang sudut.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push({
        key: `post-${sx}-${sz}`,
        pos: [sx * halfX, WALL_H / 2, sz * halfZ],
        rot: [0, 0, 0],
        size: [POST, WALL_H, POST],
      });
    }
  }

  // Tiang tengah di dinding panjang. Tanpa ini greenhouse terlihat seperti
  // kotak bertiang empat, bukan bangunan sungguhan.
  for (const sz of [-1, 1]) {
    parts.push({
      key: `post-mid-${sz}`,
      pos: [0, WALL_H / 2, sz * halfZ],
      rot: [0, 0, 0],
      size: [POST * 0.8, WALL_H, POST * 0.8],
    });
  }

  // Rel alas beton sekeliling greenhouse.
  for (const sz of [-1, 1]) {
    parts.push({
      key: `base-x-${sz}`,
      pos: [0, POST / 2, sz * halfZ],
      rot: [0, 0, 0],
      size: [SPAN_X, POST, POST],
    });
  }
  for (const sx of [-1, 1]) {
    parts.push({
      key: `base-z-${sx}`,
      pos: [sx * halfX, POST / 2, 0],
      rot: [0, 0, 0],
      size: [POST, POST, SPAN_Z],
    });
  }

  // Rel eave dan rel tengah di kedua dinding panjang.
  for (const sz of [-1, 1]) {
    for (const y of [WALL_H, (WALL_H + midRoofY) / 2]) {
      parts.push({
        key: `rail-long-${y}-${sz}`,
        pos: [0, y, sz * halfZ],
        rot: [0, 0, 0],
        size: [SPAN_X, POST, POST],
      });
    }
  }

  // Rel eave di dinding ujung, plus rel tengah yang digeser agar tidak menutup
  // jalur pintu.
  for (const sx of [-1, 1]) {
    parts.push({
      key: `rail-end-eave-${sx}`,
      pos: [sx * halfX, WALL_H, 0],
      rot: [0, 0, 0],
      size: [POST, POST, SPAN_Z],
    });

    const segment = halfZ - DOOR_W / 2;
    for (const sz of [-1, 1]) {
      parts.push({
        key: `rail-end-mid-${sx}-${sz}`,
        pos: [sx * halfX, (WALL_H + midRoofY) / 2, sz * (DOOR_W / 2 + segment / 2)],
        rot: [0, 0, 0],
        size: [POST, POST, segment],
      });
    }
  }

  // Ridge di tengah atap.
  parts.push({
    key: 'ridge',
    pos: [0, RIDGE_H, 0],
    rot: [0, 0, 0],
    size: [SPAN_X, POST, POST],
  });

  // Rafter miring. Balok ini memanjang di sumbu Z lokal, jadi diputar sebesar
  // `ROOF_ANGLE` supaya ujungnya benar-benar menyatu di ridge dan eaves.
  for (const sz of [-1, 1]) {
    parts.push({
      key: `rafter-${sz}`,
      pos: [0, midRoofY, (sz * ROOF_RUN) / 2],
      rot: [sz * ROOF_ANGLE, 0, 0],
      size: [SPAN_X, POST, SLOPE_LEN],
    });
  }

  // Tiang penopang ridge, supaya atap terlihat kaku di tengah.
  parts.push({
    key: 'king-post',
    pos: [0, (WALL_H + RIDGE_H) / 2, 0],
    rot: [0, 0, 0],
    size: [POST * 0.7, ROOF_RISE, POST * 0.7],
  });

  // Kusen pintu: dua tiang vertikal dan satu header.
  parts.push({
    key: 'door-jamb-left',
    pos: [halfX, DOOR_H / 2, -DOOR_W / 2],
    rot: [0, 0, 0],
    size: [POST, DOOR_H, POST],
  });
  parts.push({
    key: 'door-jamb-right',
    pos: [halfX, DOOR_H / 2, DOOR_W / 2],
    rot: [0, 0, 0],
    size: [POST, DOOR_H, POST],
  });
  parts.push({
    key: 'door-header',
    pos: [halfX, DOOR_H, 0],
    rot: [0, 0, 0],
    size: [POST, POST, DOOR_W],
  });

  return parts;
}

type Vent = {
  center: [number, number, number];
  rotation: [number, number, number];
  strutMid: [number, number, number];
  strutRotation: [number, number, number];
  strutLen: number;
};

/**
 * Ventilasi atap yang sudah dibuka.
 *
 * Panel ditumpu pada engsel di ridge lalu dimiringkan keluar sebesar
 * `VENT_OPEN`, dan sebuah strut menahan ujung bebasnya. Kusen, panel, dan strut
 * semuanya diturunkan dari `ROOF_ANGLE` yang sama dengan atapnya, jadi bukaan
 * ini selalu duduk tepat di bidang atap dan tidak pernah melayang.
 */
function buildRoofVent(sz: number): Vent {
  const hinge = new Vector3(0, RIDGE_H, 0);
  const slope = downSlope(sz);

  // Titik tengah panel saat masih tertutup, yaitu tepat di bidang atap.
  const center = hinge.clone().addScaledVector(slope, VENT_L / 2);

  // Arah panel setelah dibuka: arah menuruni atap diputar ke luar sebesar
  // `VENT_OPEN` terhadap sumbu X, dengan arah putar mengikuti sisi greenhouse.
  const openDir = slope
    .clone()
    .applyAxisAngle(new Vector3(1, 0, 0), -sz * VENT_OPEN);

  // Ujung bebas panel dalam posisi terbuka, dan titik tumpu strut yang tetap
  // berada di bidang atap yang tertutup.
  const tip = hinge.clone().addScaledVector(openDir, VENT_L);
  const foot = hinge.clone().addScaledVector(slope, VENT_L);
  const strutDir = tip.clone().sub(foot);

  return {
    center: toTuple(center),
    rotation: [-sz * (ROOF_ANGLE + VENT_OPEN), 0, 0],
    strutMid: toTuple(tip.clone().add(foot).multiplyScalar(0.5)),
    strutRotation: rotationAlong(strutDir),
    strutLen: strutDir.length(),
  };
}

/**
 * Noise deterministik untuk permukaan tanah.
 *
 * `Math.random` tidak boleh dipakai di sini. Tanah digambar ulang setiap
 * perubahan state, dan angka acak baru tiap kali membuat tanah berkedip.
 * Hash sinus ini selalu mengembalikan nilai yang sama untuk koordinat yang sama.
 */
function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Noise nilai bilinear dengan interpolasi smoothstep. */
function valueNoise(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const ux = x - x0;
  const uz = z - z0;
  // Smoothstep, bukan interpolasi linear, supaya permukaan tidak membentuk
  // garis lurus di antara sample.
  const sx = ux * ux * (3 - 2 * ux);
  const sz = uz * uz * (3 - 2 * uz);

  const a = hash2(x0, z0);
  const b = hash2(x0 + 1, z0);
  const c = hash2(x0, z0 + 1);
  const d = hash2(x0 + 1, z0 + 1);

  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}

/**
 * Tanah greenhouse.
 *
 * Plane polos 17x17 versi sebelumnya terlihat seperti lantai datar. Di sini
 * verteksnya digeser mengikuti dua oktave noise, lalu normal dihitung ulang
 * supaya gundukan menerima cahaya dengan benar.
 */
function SoilGround() {
  const geometry = useMemo(() => {
    const geo = new PlaneGeometry(17, 17, 48, 48);
    const position = geo.attributes.position;

    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);

      const coarse = valueNoise(x * 0.42 + 11, y * 0.42 + 7);
      const fine = valueNoise(x * 1.35 + 3, y * 1.35 + 19);

      position.setZ(i, (coarse - 0.5) * 0.34 + (fine - 0.5) * 0.09);
    }

    geo.computeVertexNormals();
    return geo;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      geometry={geometry}
      receiveShadow
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.02, 0]}
    >
      <meshStandardMaterial color="#2e2418" roughness={1} metalness={0} />
    </mesh>
  );
}

/**
 * Matikan kaca mahal lewat `?fx=noglass` di URL.
 *
 * `transmission` memaksa three.js merender ulang seluruh scene ke buffer sekali
 * per frame, jadi itu satu keputusan mahal, bukan sekadar pilihan material. Di
 * perangkat tipis itu penyebab drop frame paling masuk akal, sehingga harus
 * bisa dimatikan tanpa rebuild.
 *
 * Polanya sama dengan `?fx=nobloom` di PostEffects: beberapa flag dipisah koma,
 * jadi `?fx=nobloom,noglass` menyalakan keduanya.
 */
function useGlassDisabled(): boolean {
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    const fx = new URLSearchParams(window.location.search).get('fx') ?? '';
    setDisabled(fx.split(',').includes('noglass'));
  }, []);

  return disabled;
}

type GlassPanelProps = {
  position: [number, number, number];
  rotation?: [number, number, number];
  size: [number, number];
  /** Mode murah dari ?fx=noglass, diteruskan dari induk. */
  cheap: boolean;
  color?: string;
  thickness?: number;
};

/**
 * Satu panel kaca greenhouse.
 *
 * Semua panel dikumpulkan di sini supaya mode mahal dan mode murah tidak
 * tersebar di beberapa tempat. Kalau ada panel yang lupa memakai komponen ini,
 * `?fx=noglass` tidak akan berlaku pada panel itu.
 */
function GlassPanel({
  position,
  rotation = [0, 0, 0],
  size,
  cheap,
  color = '#dceaf2',
  thickness = 0.3,
}: GlassPanelProps) {
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={size} />
      {cheap ? (
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.22}
          roughness={0.1}
          metalness={0}
          side={DoubleSide}
          depthWrite={false}
        />
      ) : (
        <meshPhysicalMaterial
          color={color}
          transmission={0.9}
          thickness={thickness}
          ior={1.45}
          roughness={0.06}
          metalness={0}
          side={DoubleSide}
          envMapIntensity={1.1}
        />
      )}
    </mesh>
  );
}

export function GreenhouseStructure({ still = false }: { still?: boolean }) {
  const frame = useMemo(buildFrame, []);
  const vents = useMemo(() => [buildRoofVent(1), buildRoofVent(-1)], []);
  const cheap = useGlassDisabled();
  const halfX = SPAN_X / 2;
  const halfZ = SPAN_Z / 2;
  const midRoofY = (WALL_H + RIDGE_H) / 2;
  const endPanel = (SPAN_Z - DOOR_W) / 2;

  return (
    <group>
      <SoilGround />

      {/* Seluruh rangka greenhouse dalam satu draw call. */}
      <Instances limit={frame.length} range={frame.length}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#7d8894" roughness={0.42} metalness={0.65} />
        {frame.map((p) => (
          <Instance key={p.key} position={p.pos} rotation={p.rot} scale={p.size} />
        ))}
      </Instances>

      {/*
        Panel kaca memakai `transmission`, bukan sekadar `opacity` rendah.

        Kaca dengan opacity 0.16 hanya jadi lapisan biru transparan: benda di
        belakangnya terlihat pudar dan tidak ada bias sama sekali. `transmission`
        membuat sampler membaca buffer scene di belakang panel, jadi isi
        greenhouse tetap terbaca tajam dengan sedikit distorsi. `thickness`
        mengatur jarak sampling, `ior` mengatur besar bias pembiasan, dan
        `side` harus dua sisi karena kamera bisa berputar ke belakang.
      */}
      <GlassPanel position={[0, WALL_H / 2, -halfZ]} size={[SPAN_X, WALL_H]} cheap={cheap} />
      <GlassPanel
        position={[-halfX, WALL_H / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
        size={[SPAN_Z, WALL_H]}
        cheap={cheap}
      />
      <GlassPanel
        position={[halfX, WALL_H / 2, -(DOOR_W / 2 + endPanel / 2)]}
        rotation={[0, Math.PI / 2, 0]}
        size={[endPanel, WALL_H]}
        cheap={cheap}
      />
      <GlassPanel
        position={[halfX, WALL_H / 2, DOOR_W / 2 + endPanel / 2]}
        rotation={[0, Math.PI / 2, 0]}
        size={[endPanel, WALL_H]}
        cheap={cheap}
      />

      {/* Panel pintu, setinggi kusennya. */}
      <GlassPanel
        position={[halfX, DOOR_H / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
        size={[DOOR_W - 0.04, DOOR_H - 0.04]}
        cheap={cheap}
      />

      {/* Gagang pintu. */}
      <mesh position={[halfX + 0.06, DOOR_H * 0.5, DOOR_W * 0.32]} castShadow>
        <boxGeometry args={[0.09, 0.09, 0.26]} />
        <meshStandardMaterial color="#b9bfc6" roughness={0.32} metalness={0.85} />
      </mesh>

      {/*
        Atap kaca, dua bidang miring. Sudutnya `ROOF_ANGLE` yang dihitung dari
        rise dan run, bukan angka yang diketik manual, supaya selalu pas dengan
        rafter dan ventilasi atap.
      */}
      {[-1, 1].map((sz) => (
        <GlassPanel
          key={`roof-${sz}`}
          position={[0, midRoofY, (sz * ROOF_RUN) / 2]}
          rotation={[-sz * ROOF_ANGLE, 0, 0]}
          size={[SPAN_X, SLOPE_LEN]}
          color="#cfe4f0"
          cheap={cheap}
        />
      ))}

      {/* Ventilasi atap terbuka, dengan strut yang menopang ujung bebasnya. */}
      {vents.map((vent, i) => (
        <group key={`vent-${i}`}>
          <GlassPanel
            position={vent.center}
            rotation={vent.rotation}
            size={[VENT_W, VENT_L]}
            color="#e2f0f7"
            thickness={0.25}
            cheap={cheap}
          />

          <mesh position={vent.strutMid} rotation={vent.strutRotation} castShadow>
            <cylinderGeometry args={[0.022, 0.022, vent.strutLen, 8]} />
            <meshStandardMaterial color="#9aa4ae" roughness={0.38} metalness={0.7} />
          </mesh>
        </group>
      ))}

      {/*
        Debu melayang di dalam ruangan. Jumlah dan ukurannya dibatasi karena
        partikel mahal, dan dimatikan saat `still` supaya tidak ada gerak.
      */}
      {!still && (
        <Sparkles
          count={46}
          scale={[SPAN_X * 0.82, WALL_H * 0.9, SPAN_Z * 0.82]}
          position={[0, midRoofY - 0.2, 0]}
          size={1.7}
          speed={0.22}
          opacity={0.34}
          color="#dff0ff"
        />
      )}
    </group>
  );
}

/**
 * Siklus siang-malam.
 *
 * Pakai waktu lokal asli (jam saat ini) supaya background berubah sesuai
 * jam nyata, sesuai spesifikasi F3.3 di PLANNING.md. Perhitungan dilakukan
 * hanya di presentation layer (L874).
 *
 * Elevasi matahari dihitung secara sederhana: 0 jam = tengah malam, 12 jam =
 * zenit. Itu cukup untuk gradien siang/senja/malam tanpa perhitungan
 * astronomi rumit.
 */
export function DayNightCycle({ still }: { still: boolean }) {
  const sun = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const fog = useRef<Fog>(null);

  useFrame(() => {
    const now = new Date();
    const hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;

    // 0 = tengah malam, 0.5 = tengah hari (12:00)
    const t = (hours % 24) / 24;
    const angle = (t - 0.25) * Math.PI * 2; // matahari terbit di timur
    const elevation = Math.sin((t - 0.25) * Math.PI * 2);

    if (still) {
      const dayAmountStill = Math.max(0, Math.sin((0.5 - 0.25) * Math.PI * 2)); // 12:00
      if (sun.current) {
        sun.current.position.set(0, 9, 3.2);
        sun.current.color.setRGB(1, 0.96, 0.88);
        sun.current.intensity = 1.35;
      }
      if (hemi.current) {
        hemi.current.intensity = 0.35 + dayAmountStill * 0.75;
      }
      if (fog.current) {
        fog.current.color.setRGB(0.07, 0.08, 0.11);
      }
      return;
    }

    const dayAmount = Math.max(0, elevation);

    if (sun.current) {
      sun.current.position.set(
        Math.cos(angle) * 6,
        Math.max(0.6, elevation * 9),
        3.2,
      );
      if (elevation > 0.25) {
        sun.current.color.setRGB(1, 0.96, 0.88);
        sun.current.intensity = 1.35;
      } else if (elevation > 0) {
        sun.current.color.setRGB(1, 0.62, 0.35);
        sun.current.intensity = 0.75;
      } else {
        sun.current.color.setRGB(0.62, 0.7, 0.95);
        sun.current.intensity = 0.3;
      }
    }

    if (hemi.current) {
      hemi.current.intensity = 0.35 + dayAmount * 0.75;
    }

    if (fog.current) {
      const night = 1 - dayAmount;
      fog.current.color.setRGB(
        0.05 + dayAmount * 0.07,
        0.07 + dayAmount * 0.08,
        0.09 + dayAmount * 0.11 + night * 0.02,
      );
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#cfe3f2', '#2a2118', 0.9]} />
      <directionalLight
        ref={sun}
        position={[6, 9, 3.2]}
        intensity={1.35}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={0.5}
        shadow-camera-far={40}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
      />
      <fog ref={fog} attach="fog" args={['#0d1117', 12, 34]} />
    </>
  );
}
