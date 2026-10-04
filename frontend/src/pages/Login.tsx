import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sprout, Loader2, LogIn } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { IntroOverlay } from '@/components/intro/IntroOverlay';
import { LoginBackdrop } from '@/components/layout/AppShell';
import { api, setToken } from '@/lib/api';
import type { PublicUser } from '@/types';

const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@greenhouse.local', password: 'admin123' },
  { role: 'Operator', email: 'operator@greenhouse.local', password: 'operator123' },
];

export function Login() {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const login = useAuthStore((s) => s.actions.login);

  // Hanya arahkan ke dashboard kalau sesi sudah dipastikan valid oleh server.
  // Memakai `status`, bukan keberadaan token: kalau tokennya sudah kedaluwarsa,
  // user akan terpental ke /login -> /dashboard -> /login berulang.
  const status = useAuthStore((s) => s.status);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') navigate('/dashboard', { replace: true });
  }, [status, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);

    try {
      const result = await api.login(email.trim(), password);
      login(result.user as PublicUser, result.token);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      // Pesan dari server sudah dalam Bahasa Indonesia
      setError(err instanceof Error ? err.message : 'Login gagal');
    } finally {
      setPending(false);
    }
  }

  function useDemo(demoEmail: string, demoPassword: string) {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError(null);
  }

  return (
    <>
      <IntroOverlay />
      <LoginBackdrop>
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0, 0, 0.2, 1] }}
        className="glass-strong w-full p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[color:var(--color-canopy)] text-[color:var(--color-bg-deep)]">
            <Sprout className="size-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-[20px] leading-tight">
              Smart IoT Greenhouse
            </h1>
            <p className="text-[13px] text-[color:var(--color-fg-muted)]">
              Monitoring greenhouse real-time
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-[13px] font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-[10px] border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-deep)] px-3 py-2.5 text-[14px] outline-none transition-colors focus:border-[color:var(--color-canopy)]"
              placeholder="admin@greenhouse.local"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-[13px] font-medium">
              Kata sandi
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-[10px] border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-deep)] px-3 py-2.5 text-[14px] outline-none transition-colors focus:border-[color:var(--color-canopy)]"
              placeholder="admin123"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-[10px] border border-[color:color-mix(in_oklab,var(--color-destructive)_40%,transparent)] bg-[color:color-mix(in_oklab,var(--color-destructive)_12%,transparent)] px-3 py-2 text-[13px] text-[color:var(--color-destructive)]"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending || !email || !password}
            className="ripple-host relative mt-1 inline-flex items-center justify-center gap-2 rounded-[10px] bg-[color:var(--color-canopy)] px-4 py-2.5 text-[14px] font-semibold text-[color:var(--color-bg-deep)] transition-colors hover:bg-[color:var(--color-canopy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Memproses...
              </>
            ) : (
              <>
                <LogIn className="size-4" aria-hidden="true" />
                Masuk
              </>
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-[color:var(--color-border)] pt-4">
          <p className="text-[12px] text-[color:var(--color-fg-subtle)]">
            Akun demo - klik untuk mengisi otomatis:
          </p>
          <div className="mt-2 grid gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => useDemo(account.email, account.password)}
                className="flex items-center justify-between rounded-[10px] border border-[color:var(--color-border)] bg-[color:var(--color-bg-deep)] px-3 py-2 text-left transition-colors hover:border-[color:var(--color-canopy)]"
              >
                <span>
                  <span className="block text-[13px] font-medium">{account.role}</span>
                  <span className="block text-[12px] text-[color:var(--color-fg-subtle)]">
                    {account.email}
                  </span>
                </span>
                <span className="value-tabular text-[12px] text-[color:var(--color-fg-muted)]">
                  {account.password}
                </span>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
      </LoginBackdrop>
    </>
  );
}

// Dipakai halaman lain untuk memastikan token tidak nyangkut setelah logout.
export function clearSession() {
  setToken(null);
}