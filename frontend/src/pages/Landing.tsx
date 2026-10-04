import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight, Radio, Thermometer, Waves } from 'lucide-react';
import { IntroOverlay } from '@/components/intro/IntroOverlay';
import { GreenhouseCanvas } from '@/components/landing/GreenhouseCanvas';
import { LeafEdge } from '@/components/landing/LeafEdge';
import { RootIndicator } from '@/components/landing/RootIndicator';
import { useAuthStore } from '@/store/authStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

const STATS = [
  { icon: Radio, label: '24/7 Monitor' },
  { icon: Thermometer, label: '3 Sensor' },
  { icon: Waves, label: 'Real-time' },
];

/** Delay berurutan untuk entrance heading → subheading → CTA → stat strip. */
const STAGGER = 0.1;

export function Landing() {
  const heroRef = useRef<HTMLElement | null>(null);
  const reducedMotion = useReducedMotion();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (reducedMotion) return;

    const hero = heroRef.current;
    if (!hero) return;

    // scope confines cleanup: kill() mencabut semua trigger milik konteks ini,
    // jadi tidak ada ScrollTrigger yang menggantung saat pindah halaman.
    const context = gsap.context(() => {
      const layers = gsap.utils.toArray<HTMLElement>('[data-parallax]');

      layers.forEach((layer, index) => {
        // Layer paling depan (index kecil) bergerak paling cepat supaya
        // foreground terasa dekat kamera.
        const yPercent = -(8 + index * 6);

        gsap.to(layer, {
          yPercent,
          ease: 'none',
          scrollTrigger: {
            trigger: hero,
            start: 'top top',
            end: 'bottom top',
            scrub: 0.5,
          },
        });
      });
    }, hero);

    return () => context.revert();
  }, [reducedMotion]);

  const enter = (delay: number) =>
    reducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease: [0, 0, 0.2, 1] as const },
        };

  return (
    <>
      <IntroOverlay />
      <main className="relative min-h-dvh overflow-x-clip bg-[color:var(--color-bg-deep)]">
      {/* Latar berlapis; tiap layer punya data-parallax untuk GSAP */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div data-parallax className="absolute inset-0">
          <GreenhouseCanvas />
        </div>

        {/* Lapisan dasar: gradasi struktur greenhouse di belakang kabut */}
        <div
          data-parallax
          className="absolute inset-x-0 bottom-0 h-[62%]"
          style={{
            background:
              'linear-gradient(to top, rgba(11,21,18,0.96) 0%, rgba(11,21,18,0.55) 48%, transparent 100%)',
          }}
        />

        {/* Cahaya hijau berdenyut sangat halus (PLANNING.md 7.2 "Background pulse") */}
        <div
          data-parallax
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(70% 55% at 50% 8%, rgba(34,197,94,0.18) 0%, transparent 70%)',
            animation: 'breathe 6s ease-in-out infinite',
          }}
        />

        <LeafEdge />
      </div>

      <section
        ref={heroRef}
        aria-labelledby="hero-title"
        className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col items-center px-5 pt-24 pb-40 text-center sm:px-8 sm:pt-28"
      >
        <motion.p
          {...enter(0)}
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border-strong)] bg-[color:color-mix(in_oklab,var(--color-surface)_60%,transparent)] px-3.5 py-1.5 text-[12px] text-[color:var(--color-fg-muted)] backdrop-blur"
        >
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[color:var(--color-canopy)] opacity-70" />
            <span className="relative inline-flex size-1.5 rounded-full bg-[color:var(--color-canopy)]" />
          </span>
          Greenhouse online · telemetry tiap 2 detik
        </motion.p>

        <motion.h1
          {...enter(STAGGER)}
          id="hero-title"
          className="max-w-4xl text-[clamp(34px,8vw,72px)] leading-[1.05] text-balance"
        >
          Kendalikan rumah hijau Anda dari ujung jari.
        </motion.h1>

        <motion.p
          {...enter(STAGGER * 2)}
          className="mt-5 max-w-xl text-[clamp(15px,2vw,20px)] text-pretty text-[color:var(--color-fg-muted)]"
        >
          Suhu, kelembapan udara, dan kelembapan tanah dipantau setiap dua detik.
          Pompa, kipas, dan lampu grow light Anda berdiri di satu panel.
        </motion.p>

        <motion.div {...enter(STAGGER * 3)} className="mt-9 flex flex-col items-center gap-3">
          <Link
            to={token ? '/dashboard' : '/login'}
            className="ripple-host group inline-flex items-center gap-2 rounded-[12px] bg-[color:var(--color-canopy)] px-6 py-3 text-[15px] font-semibold text-[color:var(--color-bg-deep)] transition-all hover:bg-[color:var(--color-canopy-deep)] hover:shadow-[0_10px_34px_-10px_var(--color-canopy)]"
          >
            {token ? 'Buka dashboard' : 'Masuk ke dashboard'}
            <ArrowRight
              className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>

          <a
            href="#berikutnya"
            className="text-[13px] text-[color:var(--color-fg-subtle)] underline-offset-4 transition-colors hover:text-[color:var(--color-fg-muted)] hover:underline"
          >
            Lihat ringkasan fitur
          </a>
        </motion.div>

        <motion.dl
          {...enter(STAGGER * 4)}
          className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          {STATS.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="glass flex items-center justify-center gap-2 px-5 py-3 text-[13px] text-[color:var(--color-fg-muted)]"
            >
              <Icon className="size-4 text-[color:var(--color-canopy)]" aria-hidden="true" />
              <dd className="m-0 font-medium text-[color:var(--color-fg)]">{label}</dd>
            </div>
          ))}
        </motion.dl>

        <div className="mt-14">
          <RootIndicator />
        </div>
      </section>

      <section
        id="berikutnya"
        aria-labelledby="fitur-title"
        className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-28 sm:px-8"
      >
        <h2
          id="fitur-title"
          className="text-center text-[clamp(22px,3.5vw,32px)]"
        >
          Satu greenhouse, satu panel
        </h2>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: 'Kartu sensor real-time',
              body: 'Tiga kartu beranimasi dengan sparkline, count-up, dan glow otomatis saat keluar dari ambang.',
            },
            {
              title: 'Grafik 24 jam',
              body: 'Area chart bertingkat dengan pita ambang dan tooltip; riwayat 1 jam sampai 7 hari plus ekspor CSV.',
            },
            {
              title: 'Kontrol aktuator',
              body: 'Pompa, kipas, dan lampu dengan konfirmasi sebelum override manual, plus mode auto dan editor ambang.',
            },
            {
              title: 'Status koneksi',
              body: 'Badge online/offline beserta lastSeen dan RSSI, dengan banner otomatis kalau nilai meleset dari ambang.',
            },
            {
              title: 'Log aktivitas',
              body: 'Setiap perubahan mode, aktuator, dan ambang tercatat beserta pelaku dan waktunya.',
            },
            {
              title: 'Siap offline',
              body: 'Seluruh visual dibuat prosedural dengan Canvas dan CSS, jadi tidak bergantung aset eksternal.',
            },
          ].map((item) => (
            <article key={item.title} className="glass p-5">
              <h3 className="text-[16px]">{item.title}</h3>
              <p className="mt-2 text-[13px] text-[color:var(--color-fg-muted)]">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-[color:var(--color-border)] py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-5 text-center sm:px-8">
          <p className="text-[13px] text-[color:var(--color-fg-muted)]">
            Smart IoT Greenhouse · monitoring rumah hijau real-time
          </p>
          <p className="text-[12px] text-[color:var(--color-fg-subtle)]">
            Greenhouse Malam · design tokens dari PLANNING.md bagian 6
          </p>
        </div>
      </footer>
      </main>
    </>
  );
}