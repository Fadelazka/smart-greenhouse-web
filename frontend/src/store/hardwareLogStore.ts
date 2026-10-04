import { create } from 'zustand';
import type { HardwareComponentId, HardwareLogEntry, HardwareStatus } from '@/types';

/**
 * Store log perubahan status hardware.
 *
 * Terpisah dari `sensorStore` karena sifatnya berbeda: `sensorStore` menyimpan
 * data sensor yang terus ditimpa, sedangkan ini menyimpan riwayat kejadian
 * yang tidak boleh hilang diam-diam.
 *
 * Batas 50 entri memakai pola FIFO yang sama seperti `MAX_BUFFER` di
 * sensorStore: `slice(1)` membuang yang tertua, bukan memotong di tengah.
 */

const MAX_ENTRIES = 50;

type HardwareLogState = {
  entries: HardwareLogEntry[];
  /**
   * Status terakhir tiap komponen, dipakai `useHardwareStatus` untuk
   * mendeteksi transisi tanpa menyimpan riwayat lengkap.
   */
  lastStatus: Record<HardwareComponentId, HardwareStatus>;
  /** Simulasi manual dari DevSimulationPanel, menimpa deteksi otomatis. */
  forced: Partial<Record<HardwareComponentId, HardwareStatus>>;
  push: (entry: Omit<HardwareLogEntry, 'id' | 'at'>) => void;
  setForced: (component: HardwareComponentId, status: HardwareStatus | null) => void;
  clearForced: () => void;
  clear: () => void;
};

const ALL_COMPONENTS: HardwareComponentId[] = [
  'esp32',
  'dht22',
  'potentiometer',
  'relay',
  'lcd',
];

function initialStatus(): Record<HardwareComponentId, HardwareStatus> {
  return {
    esp32: 'normal',
    dht22: 'normal',
    potentiometer: 'normal',
    relay: 'normal',
    lcd: 'normal',
  };
}

/**
 * Id entry dibuat dari waktu dan counter, bukan dari `crypto.randomUUID()`.
 *
 * Alasannya: beberapa entry bisa dibuat pada milidetik yang sama saat dev panel
 * ditekan cepat, dan `Date.now()` saja bisa menghasilkan id kembar yang
 * membuat React menyisipkan key duplikat.
 */
let counter = 0;
function nextId(at: number): string {
  counter += 1;
  return `hw-${at}-${counter}`;
}

export const useHardwareLogStore = create<HardwareLogState>((set) => ({
  entries: [],
  lastStatus: initialStatus(),
  forced: {},

  push: (entry) =>
    set((state) => {
      const at = Date.now();
      const next: HardwareLogEntry = { ...entry, id: nextId(at), at };
      return {
        entries: [next, ...state.entries].slice(0, MAX_ENTRIES),
        lastStatus: { ...state.lastStatus, [entry.component]: entry.to },
      };
    }),

  setForced: (component, status) =>
    set((state) => {
      const forced = { ...state.forced };
      if (status === null) delete forced[component];
      else forced[component] = status;
      return { forced };
    }),

  clearForced: () => set({ forced: {} }),

  clear: () => set({ entries: [] }),
}));

/** Daftar komponen dalam urutan tetap, dipakai panel dan scene. */
export { ALL_COMPONENTS, MAX_ENTRIES };
