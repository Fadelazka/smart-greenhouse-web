import { create } from 'zustand';
import type {
  ActuatorName,
  ActuatorState,
  Alert,
  DeviceMode,
  Telemetry,
  Thresholds,
} from '@/types';

export const SOCKET_EVENTS = {
  TELEMETRY: 'telemetry:update',
  STATUS: 'device:status',
  ALERT: 'alert:new',
  ACTIVITY: 'activity:new',
  CONTROL: 'control:update',
  CONFIG: 'config:update',
} as const;

/**
 * Jumlah laporan yang disimpan di browser (PLANNING.md F1.3: buffer 300 titik).
 *
 * Pada interval simulator 2 detik, 300 titik = sekitar 10 menit riwayat
 * langsung. Angka ini bukan 24 jam - jendela 24 jam diambil dari API di
 * halaman Riwayat, bukan dari buffer.
 *
 * Sparkline di kartu_sensor dan kartu_koneksi memakai `slice(-40)` sendiri,
 * jadi menaikkan nilai ini tidak menambah titik yang dirender kartu.
 */
const MAX_BUFFER = 300;
const OFFLINE_AFTER_MS = 10_000;

type SensorState = {
  connected: boolean;
  online: boolean;
  firmware: string;
  uptime: number;

  /**
   * Waktu telemetry terakhir tiba di browser (epoch ms), atau null kalau belum
   * pernah ada. Ini jam sisi browser, bukan jam perangkat, jadi tidak terpengaruh
   * oleh selisih jam ESP32.
   */
  lastSeen: number | null;
  /**
   * Selisih antara jam perangkat (`telemetry.ts`) dan jam browser saat data
   * diterima. Dipakai sebagai proxy penundaan data.
   *
   * PENTING: ini BUKAN latency jaringan murni. Nilainya ikut berubah kalau jam
   * ESP32 salah set, jadi hanya bermakna sebagai indikasi kasar dan tidak boleh
   * dipakai sebagai metrik performa. Backend tidak mengirim waktu server, jadi ini
   * satu-satunya ukuran yang tersedia di frontend tanpa mengubah kontrak payload.
   */
  latencyMs: number | null;

  telemetry: Telemetry | null;
  /** Buffer sparkline, 300 titik terakhir. */
  buffer: Telemetry[];
  /** Aktuator terakhir yang diketahui (dari telemetry/override UI). */
  actuators: Record<ActuatorName, ActuatorState>;
  mode: DeviceMode;

  lastAlert: Alert | null;
  alerts: Alert[];

  thresholds: Thresholds | null;

  actions: {
    setConnected: (connected: boolean) => void;
    setStatus: (payload: { status: 'online' | 'offline'; firmware: string; uptime: number }) => void;
    pushTelemetry: (payload: Telemetry) => void;
    setThresholds: (thresholds: Thresholds) => void;
    setActuator: (actuator: ActuatorName, state: ActuatorState) => void;
    setMode: (mode: DeviceMode) => void;
    pushAlert: (alert: Alert) => void;
    clearAlert: () => void;
    /** Dipanggil timer 1 detik untuk mendeteksi perangkat yang diam. */
    checkLiveness: () => void;
  };
};

export const useSensorStore = create<SensorState>((set, get) => ({
  connected: false,
  online: false,
  firmware: '0.0.0',
  uptime: 0,

  lastSeen: null,
  latencyMs: null,

  telemetry: null,
  buffer: [],
  actuators: { pump: 'auto', fan: 'auto', light: 'auto' },
  mode: 'auto',

  lastAlert: null,
  alerts: [],

  thresholds: null,

  actions: {
    setConnected: (connected) => set({ connected }),

    setStatus: (payload) =>
      set({
        online: payload.status === 'online',
        firmware: payload.firmware,
        uptime: payload.uptime,
      }),

    pushTelemetry: (payload) =>
      set((state) => ({
        telemetry: payload,
        online: true,
        mode: payload.mode,
        lastSeen: Date.now(),
        // Penjaga: payload.ts yang rusak atau jam perangkat menyimpang jauh
        // tidak boleh membuat UI menampilkan angka yang tidak masuk akal.
        latencyMs: safeLatency(payload.ts),
        buffer: [...state.buffer, payload].slice(-MAX_BUFFER),
      })),

    setThresholds: (thresholds) => set({ thresholds }),

    setActuator: (actuator, state) =>
      set((prev) => ({ actuators: { ...prev.actuators, [actuator]: state } })),

    setMode: (mode) => set({ mode }),

    pushAlert: (alert) =>
      set((state) => ({ lastAlert: alert, alerts: [alert, ...state.alerts].slice(0, 50) })),

    clearAlert: () => set({ lastAlert: null }),

    checkLiveness: () => {
      const { lastSeen, online } = get();
      if (lastSeen === null || !online) return;
      // Pakai lastSeen (jam browser), bukan telemetry.ts (jam perangkat):
      // kalau jam ESP32 meleset, deteksi offline ikut meleset.
      if (Date.now() - lastSeen > OFFLINE_AFTER_MS) {
        set({ online: false });
      }
    },
  },
}));

/** Nilai sensor saat ini, atau null kalau belum ada data. */
export function selectReading(telemetry: Telemetry | null, sensor: 'suhu' | 'humUdara' | 'humTanah'): number | null {
  if (!telemetry) return null;
  const value = telemetry[sensor];
  return Number.isFinite(value) ? value : null;
}

/**
 * Selisih jam perangkat vs jam browser, atau null kalau tidak masuk akal.
 *
 * Pada kondisi normal ESP32 dan browser berada di jam yang sama, jadi selisih
 * seharusnya hanya hitungan detik. Selisih besar hampir selalu berarti jam
 * perangkat salah set, bukan jaringan lambat - dan lebih baik ditampilkan
 * sebagai "tidak diketahui" daripada angka yang menyesatkan.
 */
const MAX_PLAUSIBLE_LATENCY_MS = 60_000;

function safeLatency(deviceTimestamp: string): number | null {
  const deviceTime = new Date(deviceTimestamp).getTime();
  if (!Number.isFinite(deviceTime)) return null;

  const delta = Date.now() - deviceTime;
  if (delta < 0 || delta > MAX_PLAUSIBLE_LATENCY_MS) return null;

  return delta;
}
