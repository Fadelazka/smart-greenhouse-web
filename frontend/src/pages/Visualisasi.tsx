import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSensorStore } from '../store/sensorStore';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { GreenhouseCanvas, useOrbitControls } from '../components/three/GreenhouseScene';
import { BedTooltip } from '../components/three/PlantBed';
import { HardwareSection } from '../components/hardware/HardwareScene';
import {
  CONDITION_LABEL,
  bedCondition,
  type BedCondition,
  type BedId,
  type BedReading,
} from '../components/three/sceneData';

/**
 * Halaman Visualisasi 3D (PLANNING.md 5.3).
 *
 * Halaman ini di-lazy-load di App.tsx supaya three.js tidak masuk main bundle.
 *
 * Mode layar penuh: sidebar dan header disembunyikan oleh AppShell untuk rute
 * ini, jadi halaman wajib menyediakan tombol keluar sendiri.
 *
 * Soal data: perangkat hanya punya satu sensor kelembapan tanah, jadi ketiga
 * bed memakai bacaan yang sama. Tidak ada angka per bed yang dikarang - kalau
 * perlu membedakan ketiganya, itu butuh sensor tambahan, bukan interpolasi
 * di frontend.
 */
export default function Visualisasi() {
  const navigate = useNavigate();

  const telemetry = useSensorStore((s) => s.telemetry);
  const online = useSensorStore((s) => s.online);
  const mode = useSensorStore((s) => s.mode);
  const lastSeen = useSensorStore((s) => s.lastSeen);
  const thresholds = useSensorStore((s) => s.thresholds);
  const still = useReducedMotion();

  const [hovered, setHovered] = useState<BedId | null>(null);
  const [selected, setSelected] = useState<BedId | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const controlsRef = useOrbitControls();

  // Satu objek reading dipakai ketiga bed: sensor tanahnya memang satu.
  const shared: BedReading = useMemo(
    () => ({
      suhu: telemetry?.suhu ?? null,
      humUdara: telemetry?.humUdara ?? null,
      humTanah: telemetry?.humTanah ?? null,
      mode,
      lastSeen,
    }),
    [telemetry, mode, lastSeen],
  );

  const readings = useMemo(
    () => ({ 1: shared, 2: shared, 3: shared }) as Record<BedId, BedReading>,
    [shared],
  );

  const conditions = useMemo(() => {
    const c = bedCondition(shared, thresholds);
    return { 1: c, 2: c, 3: c } as Record<BedId, BedCondition>;
  }, [shared, thresholds]);

  const onHoverBed = useCallback((id: BedId | null, point: { x: number; y: number } | null) => {
    setHovered(id);
    if (point) setCursor(point);
  }, []);
  const onSelectBed = useCallback((id: BedId) => setSelected((prev) => (prev === id ? null : id)), []);

  const resetView = useCallback(() => {
    controlsRef.current?.reset();
  }, [controlsRef]);

  /**
   * Keluar dari mode layar penuh.
   *
   * Tombol ini wajib ada: AppShell menyembunyikan sidebar dan header di rute
   * ini, jadi tanpa tombol keluar user hanya bisa kembali lewat address bar.
   *
   * `navigate(-1)` dipakai supaya user kembali ke halaman yang ia buka sebelum
   * masuk ke sini. Tapi kalau halaman ini dibuka langsung (misal setelah
   * refresh atau paste URL), tidak ada entri riwayat di dalam aplikasi -
   * `navigate(-1)` akan mengeluarkan user dari aplikasi altogether. Karena itu
   * indeks riwayat diperiksa dulu, dan fallback-nya ke dashboard.
   */
  const exitImmersive = useCallback(() => {
    const idx = window.history.state?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/dashboard');
  }, [navigate]);

  // Escape adalah tombol yang diharapkan untuk keluar dari tampilan layar penuh.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitImmersive();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [exitImmersive]);

  const hoverCondition: BedCondition | null = hovered === null ? null : conditions[hovered];

  return (
    /*
      Kolom yang bisa digulir, bukan `absolute inset-0` seperti sebelumnya.

      Section greenhouse tetap setinggi satu layar di paling atas supaya
      scene-nya tidak berubah, lalu section perangkat keras mengalir di bawahnya.
      `AppShell` membuat area `main` pada rute ini scrollable
      (`min-h-dvh overflow-y-auto`) supaya bagian bawahnya bisa dijangkau.
    */
    <div className="flex min-h-dvh flex-col">
      <div className="relative h-dvh shrink-0">
        <GreenhouseCanvas
          readings={readings}
          conditions={conditions}
          still={still}
          onHoverBed={onHoverBed}
          onSelectBed={onSelectBed}
          selected={selected}
          controlsRef={controlsRef}
        />

        {hovered !== null && hoverCondition !== null && (
          <BedTooltip
            x={cursor.x}
            y={cursor.y}
            reading={readings[hovered]}
            condition={hoverCondition}
          />
        )}

        {/*
          Judul melayang di kiri atas, bukan memotong tinggi canvas.

          Tombol keluar ada karena sidebar dan header disembunyikan di mode
          fullscreen. Tanpa ini, user tidak punya cara kembali ke halaman lain
          selain address bar browser.
        */}
        <div className="pointer-events-none absolute left-4 top-4 z-10 flex max-w-[min(24rem,60vw)] items-start gap-2">
          <button
            type="button"
            onClick={exitImmersive}
            className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/70 px-3 py-2 text-[13px] text-white/90 shadow-xl backdrop-blur-md transition-colors hover:bg-black/85"
          >
            <span aria-hidden>Kembali</span>
          </button>

          <div className="pointer-events-auto rounded-xl border border-white/15 bg-black/70 px-3.5 py-2.5 backdrop-blur-md">
            <h1 className="text-[15px] font-semibold text-white">Visualisasi 3D</h1>
            <p className="mt-0.5 text-[12px] text-white/70">
              Seret untuk memutar, gulir untuk zoom, klik bed untuk detail.
            </p>
          </div>
        </div>

        {/* Tombol reset melayang di kanan atas. */}
        <button
          type="button"
          onClick={resetView}
          className="absolute right-4 top-4 z-10 rounded-xl border border-white/15 bg-black/70 px-3.5 py-2 text-[13px] text-white/90 shadow-xl backdrop-blur-md transition-colors hover:bg-black/85 hover:text-white"
        >
          Reset tampilan
        </button>

        <Legend online={online} lastSeen={lastSeen} still={still} />

        {/*
          Panel detail melayang di kiri bawah. Kalau flowed seperti biasanya,
          panel ini akan mendorong legenda ke atas dan menutupi sebagian scene
          setiap kali sebuah bed diklik.

          Latar memakai warna permukaan app, bukan hitam pekat, karena teksnya
          memakai token app dan panel ini tidak transparan seperti legenda.
        */}
        {selected !== null && (
          <div className="absolute bottom-4 left-4 z-20 w-[min(24rem,calc(100%-2rem))]">
            <BedDetail
              id={selected}
              reading={readings[selected]}
              condition={conditions[selected]}
              onClose={() => setSelected(null)}
            />
          </div>
        )}
      </div>

      {/* Di bawah scene greenhouse: devices keras dengan wiring dan statusnya. */}
      <HardwareSection still={still} />
    </div>
  );
}

function Legend({
  online,
  lastSeen,
  still,
}: {
  online: boolean;
  lastSeen: number | null;
  still: boolean;
}) {
  const telemetry = useSensorStore((s) => s.telemetry);
  const stale = lastSeen === null || Date.now() - lastSeen > 10_000;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-2 p-3">
      {/*
        Latar hitam pekat 82% plus shadow, bukan warna permukaan app.

        Alasannya: isi canvas tidak bisa dikontrol. Kalau scene sedang terang
        (bagian atap kaca kena cahaya siang), latar semi transparan ikut
        tercemar terang dan teksnya ikut pudar. Hitam pekat + border putih
        tipis + shadow gelap membuat kontrasnya tidak bergantung pada apa
        pun yang sedang dirender canvas.
      */}
      <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-xl border border-white/15 bg-black/82 px-4 py-2.5 text-sm shadow-[0_8px_30px_rgba(0,0,0,0.55)] backdrop-blur-md">
        <span className="text-white/85">
          <span aria-hidden>🌡️</span> Suhu{' '}
          <strong className="value-tabular text-white">
            {telemetry?.suhu !== undefined ? `${telemetry.suhu.toFixed(1)}°C` : '—'}
          </strong>
        </span>
        <span className="text-white/85">
          <span aria-hidden>💧</span> Tanah{' '}
          <strong className="value-tabular text-white">
            {telemetry?.humTanah !== undefined ? `${telemetry.humTanah.toFixed(0)}%` : '—'}
          </strong>
        </span>
        <span className="text-white/85">
          <span aria-hidden>🌿</span> Udara{' '}
          <strong className="value-tabular text-white">
            {telemetry?.humUdara !== undefined ? `${telemetry.humUdara.toFixed(0)}%` : '—'}
          </strong>
        </span>

        <span className="h-4 w-px bg-white/25" aria-hidden />

        {/* Status memakai ikon + teks, tidak hanya warna (PLANNING.md 9.2). */}
        <span className="flex items-center gap-1.5">
          <span aria-hidden>{online && !stale ? '🟢' : '🔴'}</span>
          <span className="text-white/85">
            {online && !stale ? 'ESP32 online' : 'ESP32 offline'}
          </span>
        </span>

        {still && (
          <span className="text-xs text-[color:var(--color-fg-subtle)]">
            Animasi dimatikan mengikuti setelan sistem
          </span>
        )}
      </div>
    </div>
  );
}

function BedDetail({
  id,
  reading,
  condition,
  onClose,
}: {
  id: BedId;
  reading: BedReading;
  condition: BedCondition;
  onClose: () => void;
}) {
  return (
      <section className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/90 p-4 shadow-xl backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-medium text-[color:var(--color-fg)]">Detail Bed {id}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[color:var(--color-border-strong)] px-2.5 py-1 text-sm text-[color:var(--color-fg-muted)] hover:text-[color:var(--color-fg)]"
        >
          Tutup
        </button>
      </div>

      <p className="mb-3 flex items-center gap-2 text-sm text-[color:var(--color-fg-muted)]">
        <span aria-hidden>{condition === 'ok' ? '🟢' : condition === 'unknown' ? '⚪' : '🟠'}</span>
        {CONDITION_LABEL[condition]}
      </p>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <Stat label="Suhu udara" value={reading.suhu === null ? '—' : `${reading.suhu.toFixed(1)}°C`} />
        <Stat label="Kelembapan udara" value={reading.humUdara === null ? '—' : `${reading.humUdara.toFixed(0)}%`} />
        <Stat label="Kelembapan tanah" value={reading.humTanah === null ? '—' : `${reading.humTanah.toFixed(0)}%`} />
        <Stat label="Mode" value={reading.mode === 'auto' ? 'Otomatis' : 'Manual'} />
      </dl>

      <p className="mt-3 text-xs text-[color:var(--color-fg-subtle)]">
        Kelembapan tanah dibaca dari satu sensor di lokasi ini, jadi ketiganya
        menampilkan angka yang sama.
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[color:var(--color-fg-subtle)]">{label}</dt>
      <dd className="value-tabular text-[color:var(--color-fg)]">{value}</dd>
    </div>
  );
}
