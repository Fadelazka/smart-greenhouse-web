import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Sprout, Wifi, WifiOff } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useSensorStore } from '@/store/sensorStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { SoundToggle } from '@/components/alert/SoundToggle';
import { Badge } from '@/components/ui/badge';
import { TooltipProvider } from '@/components/ui/tooltip';
import { formatUptime } from '@/lib/utils';

const LINKS = [
  { to: '/', label: 'Beranda' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/visualisasi', label: 'Visualisasi 3D' },
  { to: '/riwayat', label: 'Riwayat' },
  { to: '/log', label: 'Log Aktivitas' },
  { to: '/pengaturan', label: 'Pengaturan' },
];

/**
 * Background prosedural: atap greenhouse + berkas cahaya + baris tanaman.
 * Entirely SVG/CSS, no image asset.
 */
function GreenhouseBackdrop() {
  const reducedMotion = useReducedMotion();

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% -10%, rgba(34,197,94,0.16) 0%, transparent 55%), radial-gradient(90% 70% at 12% 100%, rgba(14,165,233,0.10) 0%, transparent 60%)',
        }}
      />

      <svg
        viewBox="0 0 1200 700"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-x-0 bottom-0 h-[70%] w-full"
      >
        <defs>
          <linearGradient id="gh-frame" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-canopy)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-canopy)" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="gh-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-soil)" stopOpacity="0.20" />
            <stop offset="100%" stopColor="var(--color-bg-deep)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g stroke="url(#gh-frame)" strokeWidth="2" fill="none">
          <path d="M180 700 L180 300 L600 120 L1020 300 L1020 700" />
          <path d="M600 120 L600 700" />
          <path d="M180 300 L600 480 L1020 300" />
          <path d="M180 420 L600 600 L1020 420" />
          <path d="M300 300 L300 700" />
          <path d="M900 300 L900 700" />
        </g>

        <path d="M0 700 L1200 700 L1200 620 L0 620 Z" fill="url(#gh-floor)" />

        {[
          { x: 330, s: 1 },
          { x: 520, s: 1.25 },
          { x: 700, s: 0.9 },
          { x: 870, s: 1.1 },
        ].map((plant, index) => (
          <g
            key={plant.x}
            transform={`translate(${plant.x} 620)`}
            stroke="var(--color-canopy)"
            strokeOpacity="0.5"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          >
            <path d={`M0 0 L0 ${-46 * plant.s}`} />
            <path d={`M0 ${-46 * plant.s} C -18 ${-52 * plant.s}, -22 ${-70 * plant.s}, 0 ${-74 * plant.s} C 22 ${-70 * plant.s}, 18 ${-52 * plant.s}, 0 ${-46 * plant.s} Z`} />
            <path
              d={`M0 ${-30 * plant.s} C -16 ${-36 * plant.s}, -18 ${-52 * plant.s}, 0 ${-54 * plant.s} C 18 ${-52 * plant.s}, 16 ${-36 * plant.s}, 0 ${-30 * plant.s} Z`}
              strokeOpacity="0.3"
            />
            {!reducedMotion && (
              <animateTransform
                attributeName="transform"
                type="rotate"
                values={`-2 ${plant.x} 620; 2 ${plant.x} 620; -2 ${plant.x} 620`}
                dur={`${4 + index}s`}
                repeatCount="indefinite"
                additive="sum"
              />
            )}
          </g>
        ))}
      </svg>

      <motion.div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: 'radial-gradient(closest-side, rgba(250,204,21,0.10), transparent)' }}
        animate={reducedMotion ? undefined : { opacity: [0.35, 0.55, 0.35] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

/**
 * Rute fullscreen: sidebar dan header disembunyikan, scene mengisi layar.
 *
 * Halaman yang masuk daftar ini WAJIB menyediakan tombol keluar sendiri,
 * karena navigasi normal tidak ada.
 */
const IMMERSIVE_ROUTES = new Set(['/visualisasi']);

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.actions.logout);

  const online = useSensorStore((s) => s.online);
  const connected = useSensorStore((s) => s.connected);
  const uptime = useSensorStore((s) => s.uptime);
  const firmware = useSensorStore((s) => s.firmware);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  /**
   * Rute yang memakai seluruh layar tanpa navigasi apa pun.
   *
   * Dipisah dari cek `location.pathname` yang lain supaya tidak ada aturan
   * fullscreen yang tumbuh diam-diam di beberapa tempat berbeda.
   */
  const immersive = IMMERSIVE_ROUTES.has(location.pathname);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <TooltipProvider>
      <div className="grain relative min-h-dvh">
        <div className="relative flex min-h-dvh">
        {/*
          Mode fullscreen untuk halaman 3D: sidebar dan header disembunyikan
          supaya scene benar-benar memenuhi layar. Halaman 3D wajib
          menyediakan tombol keluar sendiri, karena tanpa ini user tidak
          punya cara untuk kembali ke halaman lain.
        */}
          {immersive ? null : (
          <aside className="hidden w-60 shrink-0 flex-col border-r border-[color:var(--color-border)] bg-[color:var(--color-surface-soft)] p-4 lg:flex">
          <Link to="/dashboard" className="flex items-center gap-2.5 px-2 py-2">
            <span className="grid size-9 place-items-center rounded-xl bg-[color:var(--color-canopy)] text-[color:var(--color-bg-deep)]">
              <Sprout className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block font-[family-name:var(--font-display)] text-[15px] leading-tight font-semibold">
                Smart Greenhouse
              </span>
              <span className="block text-[11px] text-[color:var(--color-fg-subtle)]">ESP32 monitor</span>
            </span>
          </Link>

          <nav aria-label="Navigasi utama" className="mt-6 flex flex-1 flex-col gap-1">
            {LINKS.map((link) => {
              const active = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-[10px] px-3 py-2 text-[14px] transition-colors ${
                    active
                      ? 'bg-[color:var(--color-surface-raised)] font-medium text-[color:var(--color-fg)]'
                      : 'text-[color:var(--color-fg-muted)] hover:bg-[color:var(--color-surface)] hover:text-[color:var(--color-fg)]'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="rounded-[10px] border border-[color:var(--color-border)] p-3 text-[12px]">
            <p className="text-[color:var(--color-fg-subtle)]">Perangkat</p>
            <p className="value-tabular mt-1">{firmware}</p>
            <p className="value-tabular text-[color:var(--color-fg-muted)]">
              Up {formatUptime(uptime)}
            </p>
          </div>
        </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {immersive ? null : (
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-soft)] px-4 py-3 backdrop-blur-xl lg:px-6">
            <Link to="/dashboard" className="flex items-center gap-2 lg:hidden">
              <span className="grid size-8 place-items-center rounded-lg bg-[color:var(--color-canopy)] text-[color:var(--color-bg-deep)]">
                <Sprout className="size-4" aria-hidden="true" />
              </span>
              <span className="font-[family-name:var(--font-display)] text-[14px] font-semibold">
                Greenhouse
              </span>
            </Link>

            <nav aria-label="Navigasi utama mobile" className="flex gap-1 overflow-x-auto lg:hidden">
              {LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] ${
                    location.pathname === link.to
                      ? 'bg-[color:var(--color-surface-raised)] font-medium'
                      : 'text-[color:var(--color-fg-muted)]'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-3">
              <SoundToggle />
              <Badge
                variant={online ? 'success' : 'destructive'}
                className="gap-1.5 border-[color:color-mix(in_oklab,currentColor_45%,transparent)]"
              >
                {online ? (
                  <Wifi className="size-3.5" aria-hidden="true" />
                ) : (
                  <WifiOff className="size-3.5" aria-hidden="true" />
                )}
                {online ? 'ESP32 online' : 'ESP32 offline'}
                <span className="sr-only">
                  {connected ? 'Socket server tersambung' : 'Socket server terputus'}
                </span>
              </Badge>

              <div ref={menuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  className="flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-left transition-colors hover:bg-[color:var(--color-surface-raised)]"
                >
                  <span className="grid size-7 place-items-center rounded-full bg-[color:var(--color-surface-raised)] text-[12px] font-semibold uppercase">
                    {user?.name?.[0] ?? '?'}
                  </span>
                  <span className="hidden text-[13px] sm:block">{user?.name ?? 'Pengguna'}</span>
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="glass-strong absolute right-0 mt-2 w-52 overflow-hidden p-1.5"
                  >
                    <div className="px-2.5 py-2">
                      <p className="text-[13px] font-medium">{user?.name}</p>
                      <p className="truncate text-[12px] text-[color:var(--color-fg-subtle)]">
                        {user?.email}
                      </p>
                      <p className="mt-1 inline-block rounded-full bg-[color:var(--color-surface-raised)] px-2 py-0.5 text-[11px] uppercase">
                        {user?.role}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        logout();
                        navigate('/login');
                      }}
                      className="w-full rounded-lg px-2.5 py-2 text-left text-[13px] text-[color:var(--color-destructive)] transition-colors hover:bg-[color:var(--color-surface)]"
                    >
                      Keluar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>
        )}

        {/*
          Halaman 3D memakai canvas full-bleed: padding dan batas rounded
          di sini dimatikan khusus untuk rute itu, supaya scene memenuhi layar
          selebar layar. Halaman lain tetap dapat padding seperti biasa.

          Rute immersive juga dibuat scrollable. Dulu `h-dvh overflow-hidden`
          supaya canvas greenhouse terpotong pas di layar, tapi sekarang
          /visualisasi punya section hardware di bawah scene greenhouse, jadi
          area utama harus bisa digulir. Tingginya `min-h-dvh` supaya bagian
          atas tetap pas setinggi layar sebelum digulir, dan `overflow-y-auto`
          supaya halaman pendek di bawah tidak menciptakan ruang kosong yang sia-sia.
        */}
          <main
            className={
              immersive
                ? 'relative min-h-dvh min-w-0 overflow-y-auto'
                : 'min-w-0 flex-1 p-4 lg:p-6'
            }
          >
            {children}
          </main>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}

export function LoginBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-[color:var(--color-bg-deep)]">
      <GreenhouseBackdrop />
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md items-center px-4 py-10">
        {children}
      </div>
    </div>
  );
}
