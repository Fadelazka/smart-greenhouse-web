import { Environment, Lightformer } from '@react-three/drei';

/**
 * Environment pencahayaan berbasis image, dibuat secara prosedural.
 *
 * Kenapa tidak memakai `<Environment preset="warehouse">`
 * -------------------------------------------------
 * Preset drei mengunduh file HDR dari CDN saat runtime:
 *
 *   https://raw.githack.com/pmndrs/drei-assets/<commit>/hdri/<preset>.hdr
 *
 * Itu bukan aset yang di-bundle, melainkan permintaan jaringan setiap kali
 * scene dimuat. Risikonya nyata: kalau CDN itu tidak terjangkau atau lambat,
 * `<Environment>` masuk state suspense tanpa selesai, dan karena seluruh scene
 * berada di dalam `<Suspense>`, akibatnya bukan "cahaya kurang", tapi scene 3D
 * tidak muncul sama sekali.
 *
 * Versi ini merakit environment map dari `<Lightformer>`, yaitu bentuk-bentuk
 * bercahaya yang di-render ke dalam cube render target oleh three.js. Tidak ada
 * unduhan, hasilnya bisa di-cache dan sama persis di setiap mesin.
 *
 * Dan karena kita yang menentukan bentuknya, pantulan pada emas, perak, dan
 * kaca bisa diarahkan supaya menyorot dari atas dan dari sisi, bukan pantulan
 * acak seperti foto HDR indoor.
 */

/**
 * Resolusi cube render target.
 *
 * 256 sudah cukup untuk gradien kasar dan pantulan bodas kecil pada komponen
 * sekecil ini. Environment di-render sekali saja (`frames={1}`), jadi biaya
 * 256 nyaris tidak terasa dan hasilnya lebih halus.
 */
const RESOLUTION = 256;

export function StudioEnvironment({ resolution = RESOLUTION }: { resolution?: number }) {
  return (
    <Environment resolution={resolution} frames={1}>
      {/*
        Warna dasar cube map. gelap dan sedikit biru supaya kontras dengan
        pin emas dan chip perak tetap terbaca.
      */}
      <color attach="background" args={['#0a0e14']} />

      {/*
        Softbox utama di atas: sumber pantulan brightest yang terlihat di
        permukaan datar seperti PCB dan gamut LCD.
      */}
      <Lightformer
        form="rect"
        intensity={2.6}
        color="#ffffff"
        position={[0, 5, 1]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[9, 5, 1]}
      />

      {/* Panel sisi kiri: memberi gradasi terang ke gelap pada bodi komponen. */}
      <Lightformer
        form="rect"
        intensity={1.5}
        color="#cfe4ff"
        position={[-5, 1.6, 1]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[5, 3, 1]}
      />

      {/* Panel sisi kanan, lebih redup, supaya tidak simetris sempurna. */}
      <Lightformer
        form="rect"
        intensity={0.9}
        color="#8fb8e8"
        position={[5, 1.2, -1]}
        rotation={[0, -Math.PI / 2, 0]}
        scale={[4, 2.5, 1]}
      />

      {/*
        Rim light dari belakang. Ini yang membuat siluet komponen terhadap
        latar gelap tetap terbaca, dan memberi garis pantulan tipis pada
        lukewarm logam.
      */}
      <Lightformer
        form="rect"
        intensity={1.8}
        color="#ffffff"
        position={[0, 2, -6]}
        rotation={[0, 0, 0]}
        scale={[7, 1.2, 1]}
      />

      {/*
        Lantai pemantul samar. Tanpa ini, bagian bawah komponen yang menghadap
        ke bawah akan menerima pantulan hitam dan terlihat seperti terpotong.
      */}
      <Lightformer
        form="rect"
        intensity={0.35}
        color="#4a5a70"
        position={[0, -3, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[8, 8, 1]}
      />
    </Environment>
  );
}
