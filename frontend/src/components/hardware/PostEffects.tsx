import { useEffect, useState } from 'react';
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';

/**
 * Stack post-processing untuk scene hardware.
 *
 * URUTAN EFEK PENTING
 * -------------------
 * Urutan di bawah bukan Sembarang. `EffectComposer` memaksa `gl.toneMapping`
 * menjadi `NoToneMapping` saat scene di-render ke render target (three.js
 * menolak tone mapping pada render target), lalu melakukan konversi color space
 * di akhir. Artinya tone mapping yang kita set di `<Canvas gl={...}>` DIABAIKAN
 * begitu composer aktif.
 *
 * Kalau efek ini tidak dipasang, scene akan tampil terang overrun /washed out dan
 * seluruh usaha tone mapping di Tahap 1 hilang tanpa error. Karena itu
 * `ToneMapping` eksplisit ada di dalam chain, dan Bloom harus SEBELUM-nya:
 *
 *   Bloom        -> HDR linear, di mana LED emissive bisa > 1.0
 *   ToneMapping  -> ACES Filmic, HDR -> LDR
 *   Vignette     -> gelap_optik, di atas LDR
 *   SMAA         -> deteksi tepi pada gambar final
 *
 * Memo: `luminanceThreshold` di bawah dihitung terhadap input Bloom, yaitu
 * nilai linear SEBELUM tone mapping. Jadi angka 0.9 di sini bukan "putih 90%",
 * dan LED dengan `emissiveIntensity` di bawah 1.0 tidak akan ikut mekar.
 */

/** Naikkan ke true hanya lewat `?fx=nobloom` di URL. */
function useBloomDisabled(): boolean {
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    const fx = new URLSearchParams(window.location.search).get('fx') ?? '';
    setDisabled(fx.split(',').includes('nobloom'));
  }, []);

  return disabled;
}

export function PostEffects({ enabled = true }: { enabled?: boolean }) {
  const bloomDisabled = useBloomDisabled();

  // `enabled` dimatikan seluruhnya saat reduced motion? Tidak. Reduced motion
  // mengatur gerakan, bukan kualitas gambar, dan mematikan composer akan
  // membuat tampilan ikut berubah saat preferensi aksesibilitas dinyalakan.
  if (!enabled) return null;

  return (
    <EffectComposer
      // SMAA sudah menangani anti-aliasing. Kalau `multisampling` dibiarkan
      // default (8), kita membayar MSAA pada render target DAN SMAA sekaligus:
      // dua kali biaya untuk hasil yang hampir sama. `0` berarti memindahkan
      // seluruh responsibility ke SMAA.
      multisampling={0}
      // Bloom/Vignette/SMAA tidak butuh data normal. Pass normal adalah satu
      // render penuh tambahan dari scene, jadi dilewati.
      enableNormalPass={false}
    >
      {/*
        Bloom dimatikan lewat `?fx=nobloom` (tanpa rebuild) kalau FPS di bawah
        50. Vignette + SMAA tetap jalan sesuai roteiro mitigasi.
      */}
      {!bloomDisabled && (
        <Bloom
          intensity={0.3}
          // Di input linear, bukan 0-1. Lihat catatan di atas.
          luminanceThreshold={0.9}
          // Threshold 0.9 itu keras; tanpa smoothing, komponen yang nilainya
          // berdekatan dengan itu akan berkedip on/off saat status berganti.
          luminanceSmoothing={0.3}
          // Chain mipmap memberi blur yang jauh lebih halus dengan biaya lebih
          // murah daripada kernel gaussian lebar.
          mipmapBlur
        />
      )}

      {/* Lihat catatan: tanpa ini, tone mapping di <Canvas> dibuang composer. */}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />

      <Vignette offset={0.3} darkness={0.4} />

      <SMAA />
    </EffectComposer>
  );
}
