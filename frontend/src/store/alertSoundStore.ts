import { create } from 'zustand';

const STORAGE_KEY = 'greenhouse.alertSound';

/**
 * Preferensi bunyi alert disimpan lokal, jadi tidak perlu diubah ulang setiap
 * reload sebelum bunyi keluar.
 *
 * State ini lifted ke store (bukan `useState` di dalam komponen) karena
 * tombolnya ada di dua tempat: header AppShell dan banner alert. Kalau masing-masing
 * punya state sendiri, tombol di header akan menampilkan "menyala" sementara
 * banner menampilkan "bisu" - dua keadaan yang saling bertentangan.
 *
 * Default-nya BISU. Bunyi alert yang tiba-tiba berbunyi tanpa diminta adalah
 * keluhan yang jauh lebih sering daripada "saya tidak alerted-nya bunyi".
 */
type AlertSoundState = {
  muted: boolean;
  actions: {
    toggle: () => void;
  };
};

function readMuted(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(STORAGE_KEY) !== 'on';
}

function persist(muted: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on');
  } catch {
    // localStorage bisa diblokir di private mode. Preferensi hanya berlaku
    // untuk sesi ini, itu cukup.
  }
}

export const useAlertSoundStore = create<AlertSoundState>((set, get) => ({
  muted: readMuted(),
  actions: {
    toggle: () => {
      const next = !get().muted;
      persist(next);
      set({ muted: next });
    },
  },
}));
