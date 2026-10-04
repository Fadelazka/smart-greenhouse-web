/**
 * Font untuk label 3D di dalam scene.
 *
 * Kenapa font di-import sebagai aset, bukan mengandalkan default `drei/Text`
 * ---------------------------------------------------------------------
 * `troika-three-text` yang dipakai `<Text>` punya `defaultFontURL: null`
 * (lihat `troika-three-text.esm.js`, pada `CONFIG`). Artinya kalau `<Text>`
 * dipakai tanpa prop `font`, hasilnya berasal dari fallback internal troika
 * yang tidak bisa dipastikan: di beberapa versi ia menarik font dari CDN, dan
 * kalau jaringan gagal, teksnya hilang atau tidak pernah selesai dirender.
 *
 * Karena scene ini berada di dalam `<Suspense>`, teks yang menggantung akan
 * ikut menahan seluruh scene. Jadi font selalu diberikan secara eksplisit.
 *
 * File di bawah diambil dari `@fontsource/jetbrains-mono`, yang sudah menjadi
 * dependency aplikasi ini. Vite mem-bundle dan mem-hash-nya, jadi tidak ada
 * permintaan jaringan sama sekali, dan filename-nya ikut berubah saat font
 * diperbarui sehingga cache browser otomatis disegarkan.
 *
 * Batasan karakter pada label 3D
 * -------------------------------
 * File yang dipakai adalah subset `latin`. `@fontsource` hanya menyediakan satu
 * berkas per subset, dan kita mem-bundle satu berkas, bukan CSS yang
 * memuat `@font-face` beserta `unicode-range` seperti yang dilakukan browser.
 *
 * Troika memakai resolver unicode-font sebagai cadangan kalau ada karakter yang
 * tidak ada di font. Resolver itu menurunkan daftar font dari CDN jsdelivr.
 * Artinya satu karakter saja di luar Latin, misalnya U+2192, akan diam-diam
 * menarik dari jaringan, dan teks itu baru muncul setelah unduhan selesai.
 *
 * Karena itu isi `<Text>` dibatasi pada Basic Latin dan Latin-1 Supplement.
 * Karakter seperti derajat (U+00B0), plus/minus, kali, dan micro sign aman
 * karena sudah termasuk Latin-1. Tanda panah, bullet, dan perkalian matriks
 * TIDAK aman. Aturan ini diperiksa `scripts/sweep-draft.mjs`.
 */
import mono500 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2?url';
import mono700 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2?url';

/** JetBrains Mono 500, untuk label kecil dan penanda pin. */
export const FONT_MONO = mono500;

/** JetBrains Mono 700, untuk marking silkscreen yang harus terbaca. */
export const FONT_MONO_BOLD = mono700;
