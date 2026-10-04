// Sweep draft yang memeriksa kontaminasi teks pada source code.
//
// Dipakai ulang di setiap tahap. Pola yang dicari:
//   - CJK, Hiragana, Katakana, dan Hangul
//   - Cyrillic
//   - U+FFFD (replacement character)
//   - karakter kontrol di luar tab dan line feed
//   - karakter non-Latin di dalam JSX <Text> drei
//
// Jalankan:  node scripts/sweep-draft.mjs [path ...]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = process.argv.slice(2);
if (ROOTS.length === 0) ROOTS.push('frontend/src', 'backend/src');

const BAD = [
  ['CJK/Hiragana/Hangul', /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g],
  ['Cyrillic', /[\u0400-\u04ff]/g],
  ['U+FFFD', /\ufffd/g],
  ['kontrol', /[\x00-\x08\x0b\x0c\x0e-\x1f]/g],
];

/*
 * Karakter di luar Latin di dalam `<Text>` drei.
 *
 * Font 3D di-bundle sebagai subset `latin` saja (lihat `fonts.ts`). Troika
 * hanya menjalankan resolver unicode-font sebagai cadangan kalau ada karakter
 * yang TIDAK ada di font tersebut, dan resolver itu menurunkan URL dari CDN
 * jsdelivr. Satu karakter saja di luar Latin akan menarik dari jaringan tanpa
 * terlihat. Aturan ini menggagalkan ketergantungan itu sejak awal.
 *
 * Batas yang diizinkan: Basic Latin, Latin-1 Supplement (U+0080-U+00FF, yang
 * memuat derajat, plus/minus, kali, dan micro sign), serta Latin Extended-A.
 */
const NON_LATIN = /[^\u0000-\u00ff\u0100-\u017f\u2018\u2019\u201c\u201d\u2013\u2014]/;

const SCAN = /\.(ts|tsx|js|jsx|mjs|css|json|md)$/;

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) yield* walk(full);
    else if (SCAN.test(entry)) yield full;
  }
}

let files = 0;
const dirtyFiles = new Set();

for (const root of ROOTS) {
  for (const file of walk(root)) {
    files += 1;
    const text = readFileSync(file, 'utf8');
    const rel = relative('.', file);

    // Aturan per-zeile, untuk setiap pola yang cocok.
    text.split('\n').forEach((line, i) => {
      const labels = BAD.filter(([, pattern]) => new RegExp(pattern.source).test(line)).map(
        ([label]) => label,
      );
      if (labels.length === 0) return;
      dirtyFiles.add(rel);
      console.log(`\n${rel}`);
      console.log(`  L${i + 1} [${labels.join(', ')}] ${line.trim()}`);
    });

    /*
     * Aturan untuk konten <Text>, diperiksa sebagai satu blok.
     *
     * Sengaja terpisah dari aturan per-zeile dan tidak berhenti pada file
     * yang bersih: file tanpa CJK pun tetap bisa memuat karakter non-Latin di
     * dalam <Text>, dan itu justru kasus yang paling sering.
     */
    if (!file.endsWith('.tsx')) continue;
    for (const block of text.matchAll(/<Text\b[\s\S]*?<\/Text>/g)) {
      const inner = block[0].replace(/<Text\b[^>]*>/, '').replace(/<\/Text>/, '');

      /*
       * Referensi karakter numerik diurai lebih dulu.
       *
       * JSX mengurai `&#8594;` menjadi panah U+2192 saat kompilasi, jadi
       * bentuk literalnya di sumber sama sekali tidak kelihatan sebagai
       * karakter non-Latin. Tanpa langkah ini, jalur itu bisa dilewati.
       */
      const decoded = inner.replace(/&#(x?)([0-9a-f]+);/gi, (whole, hex, digits) => {
        const code = parseInt(digits, hex ? 16 : 10);
        return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
      });

      const offenders = [...new Set([...decoded].filter((ch) => NON_LATIN.test(ch)))];
      if (offenders.length === 0) continue;
      dirtyFiles.add(rel);
      console.log(`\n${rel}`);
      console.log(`  non-Latin dalam <Text>: ${offenders.join(' ')}`);
    }
  }
}

const dirtyCount = dirtyFiles.size;
console.log(`\n${files} file diperiksa, ${dirtyCount} bermasalah.`);
process.exit(dirtyCount === 0 ? 0 : 1);
