import { create } from 'zustand';
import type { PublicUser } from '@/types';
import { ApiError, api, getToken, setToken } from '@/lib/api';

/**
 * Status sesi.
 *
 * `checking` dipakai sesaat setelah aplikasi dimuat ulang, selama token yang
 * tersimpan diverifikasi ke server. Tanpa status ini, `RequireAuth` akan
 * menyimpulkan "sudah login" hanya karena token ada di localStorage - padahal
 * tokennya bisa saja kedaluwarsa. Akibatnya user melihat dashboard yang
 * hampa (semua request 401) alih-alih diarahkan ke halaman login.
 */
export type AuthStatus = 'checking' | 'authenticated' | 'anonymous';

type AuthState = {
  user: PublicUser | null;
  token: string | null;
  status: AuthStatus;
  actions: {
    hydrate: () => Promise<void>;
    login: (user: PublicUser, token: string) => void;
    logout: () => void;
  };
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: getToken(),
  status: getToken() ? 'checking' : 'anonymous',

  actions: {
    /**
     * Pulihkan sesi setelah reload: token dibaca dari localStorage lalu
     * diverifikasi ke `/auth/me`.
     *
     * Backend mati atau offline TIDAK boleh mengeluarkan user dari sesi, karena
     * itu akan membuang sesi yang sebenarnya masih sah - greenhouse sering
     * tanpa internet. Hanya 401/403 yang diartikan sebagai token benar-benar
     * tidak valid; error jaringan lain dibiarkan `anonymous` agar user bisa
     * login ulang sendiri.
     */
    hydrate: async () => {
      const token = getToken();
      if (!token) {
        set({ user: null, token: null, status: 'anonymous' });
        return;
      }

      set({ token, status: 'checking' });

      try {
        const { user } = await api.me();
        set({ user, token, status: 'authenticated' });
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          setToken(null);
          set({ user: null, token: null, status: 'anonymous' });
          return;
        }
        set({ user: null, token, status: 'anonymous' });
      }
    },

    login: (user, token) => {
      setToken(token);
      set({ user, token, status: 'authenticated' });
    },

    logout: () => {
      setToken(null);
      set({ user: null, token: null, status: 'anonymous' });
    },
  },
}));

export function isAdmin(user: PublicUser | null): boolean {
  return user?.role === 'admin';
}
