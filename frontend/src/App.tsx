import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AlertBanner } from '@/components/alert/AlertBanner';
import { Landing } from '@/pages/Landing';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { Riwayat } from '@/pages/Riwayat';
import { Log } from '@/pages/Log';
import { Pengaturan } from '@/pages/Pengaturan';
import { useAuthStore } from '@/store/authStore';
import { useSocket } from '@/hooks/useSocket';

/**
 * Halaman 3D di-lazy-load.
 *
 * three.js + drei menambah ratusan kilobyte. Dimuat di main bundle, orang yang
 * cuma mau lihat dashboard akan ikut menanggungnya; dengan lazy, chunk 3D baru
 * diambil ketika rute `/visualisasi` benar-benar dibuka (PLANNING.md 9.2).
 */
const Visualisasi = lazy(() => import('@/pages/Visualisasi'));

function RouteFallback() {
  return (
    <div className="grid min-h-[60vh] place-items-center" role="status" aria-live="polite">
      <p className="text-[14px] text-[color:var(--color-fg-muted)]">Menyiapkan scene 3D...</p>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  // Selagi token diverifikasi, jangan putuskan dulu. Tanpa ini user yang
  // sebenarnya masih login akan sempat diarahkan ke /login (flash) setiap
  // kali halaman dimuat ulang.
  if (status === 'checking') {
    return (
      <div className="grid min-h-dvh place-items-center" role="status" aria-live="polite">
        <p className="text-[14px] text-[color:var(--color-fg-muted)]">Memeriksa sesi...</p>
      </div>
    );
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <AppShell>{children}</AppShell>;
}

function NotFound() {
  return (
    <div className="grid place-items-center gap-2 py-24 text-center">
      <p className="font-[family-name:var(--font-display)] text-[28px]">404</p>
      <p className="text-[14px] text-[color:var(--color-fg-muted)]">Halaman tidak ditemukan.</p>
    </div>
  );
}

export function App() {
  useSocket();

  useEffect(() => {
    // Token yang tersimpan harus diverifikasi ke server sebelum UI dianggap
    // login. Tidak perlu di-await: yang penting prosesnya jalan.
    void useAuthStore.getState().actions.hydrate();
  }, []);

  return (
    <BrowserRouter>
      <AlertBanner />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/riwayat"
          element={
            <RequireAuth>
              <Riwayat />
            </RequireAuth>
          }
        />
        <Route
          path="/log"
          element={
            <RequireAuth>
              <Log />
            </RequireAuth>
          }
        />
        <Route
          path="/visualisasi"
          element={
            <RequireAuth>
              <Suspense fallback={<RouteFallback />}>
                <Visualisasi />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/pengaturan"
          element={
            <RequireAuth>
              <Pengaturan />
            </RequireAuth>
          }
        />
        <Route
          path="*"
          element={
            <RequireAuth>
              <NotFound />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}