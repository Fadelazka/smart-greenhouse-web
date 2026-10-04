/**
 * Generator clip video intro "Greenhouse Malam".
 *
 * Frame RGB24 di-render secara prosedural lalu di-pipe ke ffmpeg (H.264),
 * lalu di-transcode ke VP9 untuk fallback. Nol aset eksternal: kabut,
 * berkas cahaya, spora, dan siluet greenhouse semuanya dihitung dari
 * fungsi waktu.
 *
 * Syarat seamless loop: semua animasi periodik dengan periode tepat
 * `LOOP` detik dan jumlah frame kelipatan FPS. Dengan begitu frame
 * terakhir menyambung mulus ke frame pertama tanpa kedip.
 *
 * Jalankan: node scripts/generate-intro-video.mjs
 */

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '..', 'frontend', 'public', 'media');

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
const LOOP = 12; // detik per siklus penuh
const FRAMES = FPS * LOOP; // 360
const ATM_DIV = 4; // atmosfer dihitung 1/4 resolusi, lalu di-upscale

const TAU = Math.PI * 2;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 * Palet - diambil dari design token frontend/src/index.css
 * ------------------------------------------------------------------ */
const BG_TOP = [0x06, 0x10, 0x0d];
const BG_BOTTOM = [0x0d, 0x1f, 0x18];
const CANOPY = [0x22, 0xc5, 0x5e];
const FOG_TINT = [0x16, 0x6b, 0x3e];
const MINT = [0xe6, 0xfb, 0xef];
const SUN = [0xfa, 0xcc, 0x15];

/* ------------------------------------------------------------------ *
 * Elemen scene
 * ------------------------------------------------------------------ */

const rand = mulberry32(20260917);

// Kabut: 5 gumpalan besar, tiap satu bergerak pada sinusoidanya sendiri.
const FOG_BLOBS = Array.from({ length: 5 }, (_, i) => ({
  baseX: WIDTH * (0.14 + i * 0.19),
  baseY: HEIGHT * (0.42 + 0.14 * Math.sin(i * 1.7)),
  ampX: WIDTH * (0.1 + rand() * 0.06),
  ampY: HEIGHT * 0.12,
  radiusX: WIDTH * (0.26 + rand() * 0.12),
  radiusY: HEIGHT * (0.22 + rand() * 0.1),
  cycles: 1 + Math.floor(rand() * 2), // siklus bulat -> seamless
  phase: rand() * TAU,
  strength: 0.1 + rand() * 0.08,
}));

// Berkas cahaya dari atap greenhouse, miring -18°.
const BEAMS = Array.from({ length: 4 }, (_, i) => ({
  baseX: WIDTH * (0.2 + i * 0.2),
  angleDeg: -18 + (i % 2 === 0 ? 0 : 6),
  width: WIDTH * (0.028 + rand() * 0.016),
  amp: WIDTH * 0.055,
  cycles: 1 + (i % 2),
  phase: rand() * TAU,
  strength: 0.15 + rand() * 0.06,
  tint: i % 3 === 0 ? SUN : MINT,
}));

// Spora/debu halus melayang. Kecepatan dipilih kelipatan H per siklus
// supaya posisinya kembali persis ke awal saat loop.
const MOTES = Array.from({ length: 70 }, () => {
  const upCycles = 1 + Math.floor(rand() * 3);
  const driftCycles = Math.floor(rand() * 3) - 1; // bisa negatif
  return {
    x: rand() * WIDTH,
    y: rand() * HEIGHT,
    radius: 0.6 + rand() * 1.7,
    speed: (upCycles * HEIGHT) / LOOP,
    drift: (driftCycles * WIDTH) / LOOP,
    twinkleCycles: 2 + Math.floor(rand() * 3),
    phase: rand() * TAU,
    brightness: 0.18 + rand() * 0.5,
  };
});

// Siluet rangka greenhouse:arkus + tiang + transom. Statis, sangat redup
// supaya teks di atasnya tetap terbaca.
const MULLIONS = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map((f) => WIDTH * f);
const TRANSOM_Y = HEIGHT * 0.44;
const ARCH_CX = WIDTH * 0.5;
const ARCH_RX = WIDTH * 0.36;
const ARCH_RY = HEIGHT * 0.32;

// Vignette dihitung sekali (tidak berubah antar frame).
const VIGNETTE = new Float32Array(WIDTH * HEIGHT);
for (let y = 0; y < HEIGHT; y += 1) {
  for (let x = 0; x < WIDTH; x += 1) {
    const nx = (x / WIDTH - 0.5) * 2;
    const ny = (y / HEIGHT - 0.5) * 2;
    const d = Math.sqrt(nx * nx + ny * ny) / Math.SQRT2;
    VIGNETTE[y * WIDTH + x] = 1 - 0.55 * smoothstep(0.35, 1, d);
  }
}

const ATM_W = WIDTH / ATM_DIV;
const ATM_H = HEIGHT / ATM_DIV;
const atmR = new Float32Array(ATM_W * ATM_H);
const atmG = new Float32Array(ATM_W * ATM_H);
const atmB = new Float32Array(ATM_W * ATM_H);

const frame = Buffer.allocUnsafe(WIDTH * HEIGHT * 3);

/**
 * Atmosfer (kabut + berkas cahaya) dihitung pada 1/4 resolusi.
 *
 * Paket ini mahal: 5 gumpalan + 4 berkas per piksel, jadi di 1/4 resolusi
 * biayanya 1/16. Hasilnya di-upscale dengan nearest-neighbor, dan karena
 * atmosfer ini sudah sangat blur, nearest sama sekali tidak terlihat
 * compared to bilinear (hemat ~4x laporan).
 */
function buildAtmosphere(t) {
  atmR.fill(0);
  atmG.fill(0);
  atmB.fill(0);

  const scaleX = ATM_W / WIDTH;

  for (const blob of FOG_BLOBS) {
    const cx = blob.baseX + blob.ampX * Math.sin((TAU * blob.cycles * t) / LOOP + blob.phase);
    const cy = blob.baseY + blob.ampY * Math.sin((TAU * blob.cycles * t) / LOOP + blob.phase * 1.7);
    const rx = blob.radiusX * scaleX;
    const ry = blob.radiusY / ATM_DIV;

    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(ATM_W - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(ATM_H - 1, Math.ceil(cy + ry));

    for (let y = y0; y <= y1; y += 1) {
      const dy = (y - cy) / ry;
      const dy2 = dy * dy;
      if (dy2 >= 1) continue;
      const row = y * ATM_W;
      for (let x = x0; x <= x1; x += 1) {
        const dx = (x - cx) / rx;
        const d2 = dx * dx + dy2;
        if (d2 >= 1) continue;
        const density = (1 - d2) * (1 - d2) * blob.strength;
        const i = row + x;
        atmR[i] += FOG_TINT[0] * density;
        atmG[i] += FOG_TINT[1] * density;
        atmB[i] += FOG_TINT[2] * density;
      }
    }
  }

  for (const beam of BEAMS) {
    const cx = beam.baseX + beam.amp * Math.sin((TAU * beam.cycles * t) / LOOP + beam.phase);
    const rad = (beam.angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const sigma = beam.width * scaleX;
    const reach = sigma * 3;

    const x0 = Math.max(0, Math.floor((cx - reach) / scaleX));
    const x1 = Math.min(ATM_W - 1, Math.ceil((cx + reach) / scaleX));

    for (let y = 0; y < ATM_H; y += 1) {
      // Cahaya meredup ke bawah seperti spotlight menembusdust.
      const fall = 1 - smoothstep(0, ATM_H * 1.05, y);
      if (fall <= 0.001) continue;

      // Jarak piksel ke sumbu berkas dihitung setelah rotasi.
      const yWorld = y * ATM_DIV;
      for (let x = x0; x <= x1; x += 1) {
        const xWorld = x * ATM_DIV;
        const u = (xWorld - cx) * cos + yWorld * sin;
        const d = u / sigma;
        if (d < -3 || d > 3) continue;
        const intensity = Math.exp(-d * d) * fall * beam.strength;
        const i = y * ATM_W + x;
        atmR[i] += beam.tint[0] * intensity;
        atmG[i] += beam.tint[1] * intensity;
        atmB[i] += beam.tint[2] * intensity;
      }
    }
  }
}

/** Render satu frame penuh ke buffer RGB24. */
function renderFrame(t) {
  buildAtmosphere(t);

  // Grow-light: glow kuning lembut dari dasar, berdenyut 2 siklus per loop.
  const glow = 0.16 + 0.05 * Math.sin((TAU * 2 * t) / LOOP);

  for (let y = 0; y < HEIGHT; y += 1) {
    const rowY = y / HEIGHT;
    // Gradasi latar atas ke bawah.
    const br = lerp(BG_TOP[0], BG_BOTTOM[0], rowY);
    const bg = lerp(BG_TOP[1], BG_BOTTOM[1], rowY);
    const bb = lerp(BG_TOP[2], BG_BOTTOM[2], rowY);

    const atmRow = (y / ATM_DIV) | 0;
    const glowY = smoothstep(0.45, 1, rowY) * glow;

    for (let x = 0; x < WIDTH; x += 1) {
      const p = y * WIDTH + x;
      const a = atmRow * ATM_W + ((x / ATM_DIV) | 0);

      const vign = VIGNETTE[p];
      const gY = smoothstep(0.45, 1, rowY) * glow * (1 - Math.abs(x / WIDTH - 0.5) * 1.4);

      const r = (br + atmR[a] + SUN[0] * gY) * vign;
      const g = (bg + atmG[a] + SUN[1] * gY) * vign;
      const b = (bb + atmB[a] + SUN[2] * gY) * vign;

      const o = p * 3;
      frame[o] = clamp(r, 0, 255);
      frame[o + 1] = clamp(g, 0, 255);
      frame[o + 2] = clamp(b, 0, 255);
    }
  }

  // Spora melayang, ditambahkan setelah vignette supaya tetap kelihatan.
  for (const mote of MOTES) {
    const mx = ((mote.x + mote.drift * t) % WIDTH + WIDTH) % WIDTH;
    const my = ((mote.y - mote.speed * t) % HEIGHT + HEIGHT) % HEIGHT;
    const twinkle = 0.55 + 0.45 * Math.sin((TAU * mote.twinkleCycles * t) / LOOP + mote.phase);

    const r = Math.max(1, Math.round(mote.radius));
    for (let dy = -r; dy <= r; dy += 1) {
      const y = my + dy;
      if (y < 0 || y >= HEIGHT) continue;
      for (let dx = -r; dx <= r; dx += 1) {
        const x = mx + dx;
        if (x < 0 || x >= WIDTH) continue;
        const d = Math.sqrt(dx * dx + dy * dy) / r;
        if (d > 1) continue;
        const a = (1 - d * d) * mote.brightness * twinkle;
        const o = (y * WIDTH + x) * 3;
        frame[o] = clamp(frame[o] + MINT[0] * a, 0, 255);
        frame[o + 1] = clamp(frame[o + 1] + MINT[1] * a, 0, 255);
        frame[o + 2] = clamp(frame[o + 2] + MINT[2] * a, 0, 255);
      }
    }
  }

  // Siluet rangka, digambar gelap di atas segalanya.
  const darken = (x, y, amount) => {
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
    const o = (y * WIDTH + x) * 3;
    frame[o] = clamp(frame[o] * (1 - amount), 0, 255);
    frame[o + 1] = clamp(frame[o + 1] * (1 - amount), 0, 255);
    frame[o + 2] = clamp(frame[o + 2] * (1 - amount), 0, 255);
  };

  const line = (x0, y0, x1, y1, thickness, amount) => {
    const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) * 2;
    for (let s = 0; s <= steps; s += 1) {
      const u = steps === 0 ? 0 : s / steps;
      const px = Math.round(lerp(x0, x1, u));
      const py = Math.round(lerp(y0, y1, u));
      for (let k = -thickness; k <= thickness; k += 1) {
        if (Math.abs(k) > thickness - 0.5) continue;
        darken(px + k, py, amount);
        darken(px, py + k, amount);
      }
    }
  };

  // Atap melengkung.
  const archSteps = 260;
  for (let s = 0; s <= archSteps; s += 1) {
    const u = s / archSteps;
    const ang = Math.PI + u * Math.PI;
    const px = ARCH_CX + Math.cos(ang) * ARCH_RX;
    const py = TRANSOM_Y + Math.sin(ang) * ARCH_RY;
    for (let k = -1; k <= 1; k += 1) darken(Math.round(px), Math.round(py) + k, 0.62);
  }

  // Tiang vertikal dan transomhorizontal.
  for (const mx of MULLIONS) {
    line(mx, TRANSOM_Y, mx, HEIGHT, 1, 0.6);
  }
  line(0, TRANSOM_Y, WIDTH, TRANSOM_Y, 1, 0.55);
}

/* ------------------------------------------------------------------ *
 * Encode
 * ------------------------------------------------------------------ */

/** Jalankan ffmpeg tanpa stdin; resolve kalau exit code 0. */
function run(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command} keluar dengan kode ${code}\n${stderr}`));
    });
  });
}

/**
 * Render frame ke stdin ffmpeg.
 *
 * Promise di-resolve setelah child benar-benar `close`, bukan setelah stdin
 * di-end: `stdin.end()` hanya memberi tahu kita selesai menulis, prosesnya
 * masih encoding. Resolve duluan akan membuat transcode berjalan selagi
 * mp4 belum lengkap.
 */
function encodeFrames(args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`ffmpeg keluar dengan kode ${code}\n${stderr}`));
    });

    // Broken pipe (mis. karena error di ffmpeg) harus jadi error, bukan
    // UnhandledPromiseRejection yang tidak nyangkut.
    child.stdin.on('error', () => {});

    (async () => {
      try {
        for (let i = 0; i < FRAMES; i += 1) {
          renderFrame(i / FPS);
          if (!child.stdin.write(frame)) {
            await new Promise((r) => child.stdin.once('drain', r));
          }
          if (i % 60 === 0) process.stdout.write(`  frame ${i}/${FRAMES}\n`);
        }
        child.stdin.end();
      } catch (error) {
        child.kill();
        rejectPromise(error);
      }
    })();
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const mp4Path = resolve(OUT_DIR, 'greenhouse-intro.mp4');
  const webmPath = resolve(OUT_DIR, 'greenhouse-intro.webm');

  process.stdout.write(
    `Render ${FRAMES} frame (${WIDTH}x${HEIGHT} @ ${FPS}fps, loop ${LOOP}s)...\n`,
  );

  await encodeFrames([
    '-y',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    '-s', `${WIDTH}x${HEIGHT}`,
    '-r', String(FPS),
    '-i', 'pipe:0',
    '-an',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '30',
    '-profile:v', 'high',
    '-pix_fmt', 'yuv420p',
    // moov atom di depan supaya bisa diputar sebelum seluruh file terunduh
    '-movflags', '+faststart',
    mp4Path,
  ]);

  process.stdout.write('Transcode VP9 (fallback)...\n');
  await run('ffmpeg', [
    '-y',
    '-i', mp4Path,
    '-an',
    '-c:v', 'libvpx-vp9',
    '-crf', '40',
    '-b:v', '0',
    '-row-mt', '1',
    '-cpu-used', '4',
    webmPath,
  ]);

  process.stdout.write('Selesai.\n');
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});