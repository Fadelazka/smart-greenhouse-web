import { useEffect, useMemo } from 'react';
import { CatmullRomCurve3, Euler, Quaternion, TubeGeometry, Vector3 } from 'three';

/**
 * Satu kabel penghubung, lengkap dengan konektor di kedua ujungnya.
 *
 * Bentuknya `TubeGeometry` di atas kurva, jadi tetap primitif prosedural dan
 * tidak ada file GLB. Memakai tabung, bukan `Line`, karena garis tipis hampir
 * tidak terlihat di atas background gelap dan ikut hilang saat di-zoom jauh.
 *
 * Rute dibuat ortogonal: keluar ke tengah di sumbu Z, menyeberang di sumbu X,
 * lalu masuk ke pin tujuan. Ini mengikuti bentuk routing di `diagram.json` yang
 * memakai pasangan h/v (horizontal lalu vertical), bukan diagonal lurus.
 */

/**
 * Sumbu Y di ruang lokal.
 *
 * `TubeGeometry` menghasilkan tabung yang memanjang mengikuti sumbu Y, dan
 * konektor juga dibangun memanjang di sumbu Y. Karena keduanya memakai
 * sumbu yang sama, satu helper arah cukup untuk keduanya.
 */
const LOCAL_UP = new Vector3(0, 1, 0);

/** Panjang housing konektor, sebagai kelipatan radius kabel. */
const PLUG_RATIO = 2.8;

/** Posisi dan orientasi satu konektor. */
type PlugPlacement = {
  position: [number, number, number];
  rotation: [number, number, number];
};

/**
 * Letakkan konektor di ujung sebuah kurva.
 *
 * `direction` adalah arah keluar dari board, yaitu arah tangen kurva untuk
 * ujung awal, dan arah berlawanan dengan tangen untuk ujung akhir. Housing
 * digeser sedikit ke arah tersebut supaya duduk di luar permukaan board,
 * bukan tenggelam di dalamnya, sementara pin logam tetap berada tepat di titik
 * anchor yang dipakai `diagram.json`.
 */
function placePlug(anchor: Vector3, direction: Vector3, offset: number): PlugPlacement {
  const position = anchor.clone().addScaledVector(direction, offset);
  const euler = new Euler().setFromQuaternion(
    new Quaternion().setFromUnitVectors(LOCAL_UP, direction),
  );
  return {
    position: [position.x, position.y, position.z],
    rotation: [euler.x, euler.y, euler.z],
  };
}

export type WireProps = {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  /** Radius tabung, dalam unit scene. */
  radius?: number;
  /** Redupkan kabel supaya komponen yang sedang dihover lebih menonjol. */
  dimmed?: boolean;
};

export function Wire({ from, to, color, radius = 0.028, dimmed = false }: WireProps) {
  /*
   * Geometri tabung dan penempatan konektor dihitung bersama, karena keduanya
   * bergantung pada kurva yang sama. Kalau penempatan dihitung terpisah,
   * ada peluang housing konektor tidak persis searah dengan tabung.
   */
  const { geometry, fromPlug, toPlug, fromPin, toPin } = useMemo(() => {
    const start = new Vector3(...from);
    const end = new Vector3(...to);

    // Titik tengah di-separuh jarak Z supaya rute membentang rapi di antara
    // dua board, tidak pernah memotong diagonal melewati tengah ESP32.
    const midZ = (start.z + end.z) / 2;
    const lift = Math.min(0.22, Math.abs(start.z - end.z) * 0.18);

    const midA = new Vector3(start.x, start.y + lift, midZ);
    const midB = new Vector3(end.x, end.y + lift, midZ);

    // `curveType` catmullrom dengan tegangan rendah supaya tikungan membulat
    // halus seperti kabel lentur, bukan patah tajam seperti konektor PCB.
    const curve = new CatmullRomCurve3([start, midA, midB, end], false, 'catmullrom', 0.04);

    /*
     * 64 bagian memanjang dan 10 melingkar.
     *
     * Radial 8 sudah cukup untuk kabel setebal 0.028, tapi menambahkannya
     * ke 10 hampir tidak menambah beban berarti, dan membuat siluet kabel
     * tidak terlihat bersudut saat kamera mendekati.
     */
    const tube = new TubeGeometry(curve, 64, radius, 10, false);

    const plugLength = radius * PLUG_RATIO;

    // Tangen di ujung awal menunjuk menjauhi board. Tangen di ujung akhir
    // masih menunjuk arah perjalanan kabel, jadi housing di ujung itu harus
    // memakai arah sebaliknya agar tetap berada di luar board.
    const outwardStart = curve.getTangentAt(0).normalize();
    const outwardEnd = curve.getTangentAt(1).normalize().negate();

    return {
      geometry: tube,
      fromPlug: placePlug(start, outwardStart, plugLength * 0.5),
      toPlug: placePlug(end, outwardEnd, plugLength * 0.5),
      // Pin logam ditumpuk tepat di anchor, dengan panjang seperempat housing.
      fromPin: placePlug(start, outwardStart, plugLength * 0.18),
      toPin: placePlug(end, outwardEnd, plugLength * 0.18),
    };
  }, [from, to, radius]);

  /**
   * Buang geometry lama setiap kali yang baru dibuat.
   *
   * Tanpa ini, tiap perubahan komponen atau viewport menyisakan geometry
   * di memori GPU. Karena scene ini bisa berjalan lama di halaman visualisasi,
   * penumpukan seperti itu akhirnya membuat fps turun dan memori naik.
   */
  useEffect(() => () => geometry.dispose(), [geometry]);

  const plugLength = radius * PLUG_RATIO;

  const housingColor = dimmed ? '#2a2c30' : '#15171a';
  const pinColor = dimmed ? '#6b6f75' : '#b9bfc6';
  const opacity = dimmed ? 0.35 : 1;

  return (
    <group>
      <mesh geometry={geometry}>
        {/*
          `MeshPhysicalMaterial` dengan `clearcoat` tipis: insulation PVC punya
          lapisan atas yang licin, jadi pantulannya terpisah dari warna
          diffuse. Tanpa itu, kabel terlihat seperti pipa matte.
        */}
        <meshPhysicalMaterial
          color={color}
          roughness={0.38}
          metalness={0.05}
          clearcoat={0.5}
          clearcoatRoughness={0.35}
          emissive={color}
          // Sedikit emissive supaya kabel tetap terbaca di sisi yang gelap,
          // tanpa ikut menyala saat status komponen berubah.
          emissiveIntensity={dimmed ? 0.1 : 0.28}
          envMapIntensity={1}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/*
        Housing konektor di kedua ujung.

        Materialnya dibuat lokal, bukan diambil dari `useHardwareMaterials()`.
        Modul hardware punya palet material sendiri, dan menambah dua entry
        untuk komponen se kecil ini hanya memperbesar set yang harus
        di-dispose pada setiap model.
      */}
      <mesh position={fromPlug.position} rotation={fromPlug.rotation} castShadow>
        <boxGeometry args={[radius * 2.3, plugLength, radius * 1.7]} />
        <meshStandardMaterial color={housingColor} roughness={0.62} metalness={0.08} transparent opacity={opacity} />
      </mesh>

      <mesh position={toPlug.position} rotation={toPlug.rotation} castShadow>
        <boxGeometry args={[radius * 2.3, plugLength, radius * 1.7]} />
        <meshStandardMaterial color={housingColor} roughness={0.62} metalness={0.08} transparent opacity={opacity} />
      </mesh>

      {/*
        Pin logam yang masuk ke header board.

        Tipis dan memanjang sesuai arah tangen, jadi terbaca sebagai pin
        female yang dicangkok ke header, bukan sebagai penguat housing.
      */}
      <mesh position={fromPin.position} rotation={fromPin.rotation}>
        <boxGeometry args={[radius * 0.75, plugLength * 0.45, radius * 0.3]} />
        <meshStandardMaterial color={pinColor} roughness={0.3} metalness={0.9} transparent opacity={opacity} />
      </mesh>

      <mesh position={toPin.position} rotation={toPin.rotation}>
        <boxGeometry args={[radius * 0.75, plugLength * 0.45, radius * 0.3]} />
        <meshStandardMaterial color={pinColor} roughness={0.3} metalness={0.9} transparent opacity={opacity} />
      </mesh>
    </group>
  );
}
