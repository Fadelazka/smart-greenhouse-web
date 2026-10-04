import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Latar prosedural halaman hero (PLANNING.md 7.2 "Hero / Landing").
 *
 * Tiga efek dalam satu canvas, digabung dalam satu loop rAF supaya hanya ada
 * satu paint per frame:
 *   1. Kabut bergerak   - 5 ellipse hijau semi-transparan
 *   2. Tetes kondensasi - 34 tetes jatuh, sebagian "bergulir" di kaca
 *   3. Berkas cahaya    - 4 berkas mintuning dari atas
 *
 * Catatan performa: `ctx.filter = 'blur(40px)'` di dalam loop akan memaksa
 * GPU blur tiap frame dan itu mahal. Jadi kabut di-bake sekali ke canvas
 * offscreen (blur di sana, satu kali), lalu per frame hanya `drawImage`
 * dengan geser + alpha. Visual identik, jauh lebih murah.
 */

type Droplet = {
  x: number;
  y: number;
  radius: number;
  speed: number;
  /** Tetes "bergulir": bergerak menyamping kecil dengan wiggle */
  rolling: boolean;
  drift: number;
  wiggle: number;
  phase: number;
};

const FOG_COUNT = 5;
const DROPLET_COUNT = 34;
const BEAM_COUNT = 4;
const BEAM_ROTATION = -18;
const MAX_DPR = 2;

export function GreenhouseCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    let width = 0;
    let height = 0;
    let fogLayer: HTMLCanvasElement | null = null;
    let droplets: Droplet[] = [];
    let frameId = 0;
    let running = true;
    let elapsed = 0;
    let lastTimestamp = 0;

    // Seed pseudo-random supaya tetes & berkas cahaya reposition sama persis
    // di setiap render (tidak "berjumps" tiap resize atau remount).
    let seed = 20240917;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    function buildFog(): HTMLCanvasElement {
      // Layer lebih lebar dari viewport supaya bisa digeser tanpa celah tepi.
      const layer = document.createElement('canvas');
      layer.width = Math.ceil(width * 1.5);
      layer.height = height;

      const ctx = layer.getContext('2d');
      if (!ctx) return layer;

      ctx.filter = 'blur(40px)';
      for (let i = 0; i < FOG_COUNT; i += 1) {
        const cx = width * (0.12 + (i / FOG_COUNT) * 0.76) + (random() - 0.5) * width * 0.12;
        const cy = height * (0.25 + random() * 0.5);
        const rx = width * (0.22 + random() * 0.18);
        const ry = height * (0.14 + random() * 0.12);

        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34, 197, 94, ${0.05 + random() * 0.05})`;
        ctx.fill();
      }
      ctx.filter = 'none';

      return layer;
    }

    function buildDroplets(): Droplet[] {
      const created: Droplet[] = [];

      for (let i = 0; i < DROPLET_COUNT; i += 1) {
        const rolling = random() < 0.28;

        created.push({
          x: random() * width,
          y: random() * height,
          radius: rolling ? 3.2 + random() * 2.4 : 1.4 + random() * 1.8,
          speed: rolling ? 0.06 + random() * 0.1 : 0.18 + random() * 0.42,
          rolling,
          drift: rolling ? (random() - 0.5) * 0.22 : 0,
          wiggle: 0.4 + random() * 1.1,
          phase: random() * Math.PI * 2,
        });
      }

      return created;
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = canvas!.clientWidth;
      height = canvas!.clientHeight;
      if (!width || !height) return;

      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      context!.setTransform(dpr, 0, 0, dpr, 0, 0);

      fogLayer = buildFog();
      droplets = buildDroplets();
    }

    function drawFog() {
      if (!fogLayer) return;

      // Geser horizontal sinusoidal, tiap kabut beda kecepatan supaya tidak
      // bergerak selaras dan terlihat seperti satu blok.
      context!.globalAlpha = 1;
      for (let i = 0; i < 3; i += 1) {
        const shift = Math.sin(elapsed * (0.06 + i * 0.02) + i * 1.7) * width * 0.07;
        context!.drawImage(fogLayer, -width * 0.25 + shift, 0);
      }
    }

    function drawBeams() {
      context!.globalCompositeOperation = 'screen';

      for (let i = 0; i < BEAM_COUNT; i += 1) {
        const baseX = width * (0.18 + i * 0.22);
        const offset = Math.sin(elapsed * 0.22 + i * 1.3) * width * 0.05;
        const beamWidth = width * (0.09 + (i % 2) * 0.04);

        context!.save();
        context!.translate(baseX + offset, 0);
        context!.rotate((BEAM_ROTATION * Math.PI) / 180);

        const gradient = context!.createLinearGradient(0, 0, 0, height * 1.25);
        gradient.addColorStop(0, 'rgba(240, 253, 244, 0.13)');
        gradient.addColorStop(0.55, 'rgba(34, 197, 94, 0.05)');
        gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');

        context!.fillStyle = gradient;
        context!.fillRect(-beamWidth / 2, -height * 0.1, beamWidth, height * 1.35);
        context!.restore();
      }

      context!.globalCompositeOperation = 'source-over';
    }

    function drawDroplets() {
      for (const drop of droplets) {
        const wobble = drop.rolling ? Math.sin(elapsed * drop.wiggle + drop.phase) * 3 : 0;
        const x = drop.x + wobble;
        const y = drop.y % height;

        context!.beginPath();
        context!.arc(x, y, drop.radius, 0, Math.PI * 2);
        context!.fillStyle = 'rgba(226, 245, 238, 0.16)';
        context!.fill();

        // Highlight kecil supaya tetes terbaca sebagai cekungan, bukan titik.
        context!.beginPath();
        context!.arc(x - drop.radius * 0.32, y - drop.radius * 0.34, drop.radius * 0.36, 0, Math.PI * 2);
        context!.fillStyle = 'rgba(240, 253, 244, 0.3)';
        context!.fill();
      }
    }

    function step(delta: number) {
      elapsed += delta;

      if (!reducedMotion) {
        for (const drop of droplets) {
          drop.y += drop.speed * delta * 60;
          drop.x += drop.drift * delta * 60;
          if (drop.x < -10) drop.x = width + 10;
          if (drop.x > width + 10) drop.x = -10;
          if (drop.y > height + 10) drop.y = -10;
        }
      }

      context!.clearRect(0, 0, width, height);
      drawFog();
      drawBeams();
      drawDroplets();
    }

    function frame(timestamp: number) {
      if (!running) return;

      const delta = lastTimestamp ? Math.min((timestamp - lastTimestamp) / 1000, 0.05) : 0.016;
      lastTimestamp = timestamp;

      step(delta);
      frameId = window.requestAnimationFrame(frame);
    }

    resize();
    step(0);

    if (!reducedMotion) {
      frameId = window.requestAnimationFrame(frame);
    }

    const handleVisibility = () => {
      // Tab tidak aktif: hentikan rAF supaya tidak membakar CPU/baterai.
      if (document.hidden) {
        running = false;
        window.cancelAnimationFrame(frameId);
      } else if (!reducedMotion) {
        running = true;
        lastTimestamp = 0;
        frameId = window.requestAnimationFrame(frame);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => {
      running = false;
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 size-full"
    />
  );
}