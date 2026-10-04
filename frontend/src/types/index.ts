/**
 * Kontrak tipe frontend. Cerminan dari `backend/src/types/mqtt.ts` - kalau
 * bentuk payload berubah di backend, ubah di sini juga, jangan sampai
 * tidak menebak-nebak bentuk data.
 */

export type SensorName = 'suhu' | 'humUdara' | 'humTanah';

export type ActuatorName = 'pump' | 'fan' | 'light';

export type ActuatorState = 'auto' | 'on' | 'off';

export type DeviceMode = 'auto' | 'manual';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type ThresholdValue = { min: number; max: number };

export type Thresholds = Record<SensorName, ThresholdValue>;

export type Calibration = Record<SensorName, number>;

export type UserRole = 'admin' | 'operator';

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

/** Satu laporan sensor dari ESP32,_siarkan lewat Socket.io. */
export type Telemetry = {
  ts: string;
  deviceId: string;
  suhu: number;
  humUdara: number;
  humTanah: number;
  rssi: number;
  mode: DeviceMode;
};

/** Pesan status - retained, dikirim sekali saat perangkat boot. */
export type DeviceStatus = {
  ts: string;
  status: 'online' | 'offline';
  firmware: string;
  uptime: number;
};

export type Alert = {
  ts: string;
  sensor: SensorName;
  value: number;
  threshold: ThresholdValue;
  severity: AlertSeverity;
};

export type ActivityType =
  | 'actuator_on'
  | 'actuator_off'
  | 'mode_change'
  | 'threshold_change'
  | 'calibration_change'
  | 'restart'
  | 'alert'
  | 'sensor_error'
  | 'login';

/** Entri activity log. `time` ISO string, bukan `Date`. */
export type ActivityRow = {
  id: string;
  time: string;
  type: ActivityType | string;
  actor: string;
  message: string;
};

/** Payload `activity:new`. Bentuknya sama dengan `ActivityRow`. */
export type ActivityEvent = ActivityRow;

// --- Hardware 3D (halaman Visualisasi) ---

/**
 * Id komponen hardware. Sama persis dengan nilai `component` di
 * `hardwareStatusChangeSchema` backend - kalau salah satu berubah, yang lain
 * harus ikut berubah supaya POST-nya ditolak diam-diam, bukan error 500.
 */
export type HardwareComponentId = 'esp32' | 'dht22' | 'potentiometer' | 'relay' | 'lcd';

/**
 * Status kesehatan komponen. `normal` tidak berkedip, `warning` kuning dengan
 * pulse 2 detik, `error` merah dengan pulse 1 detik.
 */
export type HardwareStatus = 'normal' | 'warning' | 'error';

/** Satu entri log perubahan status, dipakai panel log di scene hardware. */
export type HardwareLogEntry = {
  id: string;
  /** Epoch ms, bukan string, supaya pengurutan tidak bergantung locale. */
  at: number;
  component: HardwareComponentId;
  from: HardwareStatus;
  to: HardwareStatus;
  reason: string;
  /**
   * Asal perubahan. `simulation` berarti status dipaksa dari DevSimulationPanel,
   * bukan hasil deteksi telemetry. Opsional supaya entri lama yang disimpan di
   * store tetap valid setelah penambahan field ini.
   */
  source?: 'auto' | 'simulation';
};

export type HistoryRange = '1h' | '6h' | '24h' | '7d';
/**
 * Satu bucket hasil agregasi. `samples` dipakai untuk tooltip "rata-rata N
 * sampel" supaya pengguna tahu seberapa banyak data yang diringkas.
 */
export type HistoryPoint = {
  time: string;
  suhu: number;
  humUdara: number;
  humTanah: number;
  samples: number;
};

export type HistoryResponse = {
  range: HistoryRange;
  /** Berapa kali panjang range jendela digeser ke belakang. 0 = periode terkini. */
  offset: number;
  bucketSeconds: number;
  from: string;
  to: string;
  thresholds: Thresholds;
  points: HistoryPoint[];
};

/**
 * Satu periode yang siap dibandingkan di halaman Riwayat.
 *
 * Compare menyelaraskan dua periode dengan panjang berbeda pada sumbu waktu
 * relatif, jadi setiap periode harus membawa jendela waktunya sendiri supaya
 * tooltip bisa menampilkan waktu absolut dari masing-masing sisi.
 */
export type HistoryPeriod = {
  range: HistoryRange;
  offset: number;
  bucketSeconds: number;
  from: string;
  to: string;
  points: HistoryPoint[];
};

export const SENSOR_META: Record<
  SensorName,
  { label: string; short: string; unit: string; accent: string; decimals: number }
> = {
  suhu: {
    label: 'Suhu udara',
    short: 'Suhu',
    unit: '°C',
    accent: 'var(--color-sun)',
    decimals: 1,
  },
  humUdara: {
    label: 'Kelembaban udara',
    short: 'Lembap udara',
    unit: '%',
    accent: 'var(--color-water)',
    decimals: 1,
  },
  humTanah: {
    label: 'Kelembaban tanah',
    short: 'Lembap tanah',
    unit: '%',
    accent: 'var(--color-bloom)',
    decimals: 1,
  },
};

export const ACTUATOR_META: Record<
  ActuatorName,
  { label: string; description: string; accent: string; icon: string }
> = {
  pump: {
    label: 'Pompa air',
    description: 'Menyiram saat tanah kering',
    accent: 'var(--color-water)',
    icon: 'droplet',
  },
  fan: {
    label: 'Kipas',
    description: 'Mendinginkan saat suhu naik',
    accent: 'var(--color-fg-muted)',
    icon: 'fan',
  },
  light: {
    label: 'Lampu grow',
    description: 'Menyala saat cahaya kurang',
    accent: 'var(--color-sun)',
    icon: 'lightbulb',
  },
};

export const ACTIVITY_META: Record<ActivityType, { label: string; color: string }> = {
  actuator_on: { label: 'Aktiator dinyalakan', color: 'var(--color-canopy)' },
  actuator_off: { label: 'Aktiator dimatikan', color: 'var(--color-fg-muted)' },
  mode_change: { label: 'Mode diubah', color: 'var(--color-water)' },
  threshold_change: { label: 'Threshold diubah', color: 'var(--color-sun)' },
  calibration_change: { label: 'Kalibrasi diubah', color: 'var(--color-bloom)' },
  restart: { label: 'Perangkat direstart', color: 'var(--color-destructive)' },
  alert: { label: 'Alert', color: 'var(--color-destructive)' },
  sensor_error: { label: 'Error sensor', color: 'var(--color-warning)' },
  login: { label: 'Login', color: 'var(--color-fg-subtle)' },
};

// ===== Cuaca real-time (F3.2) =====

export type WeatherSnapshot = {
  temp: number;
  feelsLike: number;
  humidity: number;
  description: string;
  icon: string;
  windSpeed: number;
  clouds: number;
  observedAt: string;
  place: string;
};

/**
 * Balasan endpoint cuaca.
 *
 * `enabled: false` selalu disertai `hint` yang bisa langsung ditampilkan ke
 * pengguna, jadi frontend tidak perlu membuat tebakan sendiri tentang penyebab
 * kegagalan. `stale` berarti data dipakai dari cache karena OpenWeatherMap tidak
 * bisa dihubungi.
 */
export type WeatherResult =
  | { enabled: true; stale: boolean; data: WeatherSnapshot }
  | {
      enabled: false;
      reason: 'no-key' | 'no-coords' | 'bad-key' | 'upstream-error';
      hint: string;
    };

export type WeatherConfigStatus = {
  enabled: boolean;
  configuredLocation: { lat: number; lon: number; place: string } | null;
};

// ===== Notifikasi Telegram (F3.4) =====

export type TelegramStatus = {
  enabled: boolean;
  reason: 'no-token' | 'no-chat-id' | 'disabled' | null;
  maskedChatId: string | null;
  cooldowns: Array<{ kind: string; remainingSec: number }>;
};
