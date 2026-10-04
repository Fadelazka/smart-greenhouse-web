/**
 * Kontrak payload MQTT - sumber kebenaran tunggal antara firmware ESP32, simulator, dan backend.
 * Ikuti dokumentasi ini saat mengubah apa pun di sini.
 */

export const MQTT_PREFIX = 'greenhouse';

export const TOPICS = {
  TELEMETRY: `${MQTT_PREFIX}/telemetry`,
  STATUS: `${MQTT_PREFIX}/status`,
  CMD: `${MQTT_PREFIX}/cmd`,
  CONFIG: `${MQTT_PREFIX}/config`,
  ALERTS: `${MQTT_PREFIX}/alerts`,
} as const;

export const DEVICE_ID = 'esp32-greenhouse-01';

/** Rentang fisik yang masuk akal - dipakai Zod untuk menolak payload rusak. */
export const SENSOR_RANGE = {
  suhu: { min: -10, max: 80 },
  humUdara: { min: 0, max: 100 },
  humTanah: { min: 0, max: 100 },
  rssi: { min: -100, max: 0 },
} as const;

/** Default threshold - dipakai seed database dan mode manual. */
export const DEFAULT_THRESHOLDS = {
  suhu: { min: 18, max: 32 },
  humUdara: { min: 50, max: 85 },
  humTanah: { min: 40, max: 75 },
} as const;

export type ThresholdValue = { min: number; max: number };

export type Thresholds = Record<'suhu' | 'humUdara' | 'humTanah', ThresholdValue>;

export type Calibration = Record<'suhu' | 'humUdara' | 'humTanah', number>;

export type DeviceMode = 'auto' | 'manual';

export type ActuatorState = 'on' | 'off' | 'auto';

export type ActuatorCommand = {
  pump?: ActuatorState;
  fan?: ActuatorState;
  light?: ActuatorState;
};

/** Payload yang ESP32/simulator publish setiap tick. */
export type TelemetryPayload = {
  ts: string;
  deviceId: string;
  suhu: number;
  humUdara: number;
  humTanah: number;
  rssi: number;
  mode: DeviceMode;
};

/** Payload status - retained message, dipesan sekali saat boot. */
export type StatusPayload = {
  ts: string;
  status: 'online' | 'offline';
  firmware: string;
  uptime: number;
};

/** Payload command - publish backend, subscribe ESP32. */
export type CmdPayload = ActuatorCommand & {
  ts: string;
  mode?: DeviceMode;
  /** Override manual expire di detik ke berapa (epoch ms). Setelah itu ESP32 kembali ke auto. */
  overrideUntil?: number | null;
  restart?: boolean;
  issuedBy?: string;
};

/** Payload konfigurasi - threshold & kalibrasi, retained. */
export type ConfigPayload = {
  thresholds: Thresholds;
  calibration: Calibration;
};

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type AlertPayload = {
  ts: string;
  sensor: 'suhu' | 'humUdara' | 'humTanah';
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

export type ActivityEntry = {
  id: string;
  ts: string;
  type: ActivityType;
  actor: string;
  message: string;
  meta?: Record<string, unknown> | null;
};

export type UserRole = 'admin' | 'operator';

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

/** Event yang di-broadcast ke frontend lewat Socket.io. */
export const SOCKET_EVENTS = {
  TELEMETRY: 'telemetry:update',
  STATUS: 'device:status',
  ALERT: 'alert:new',
  ACTIVITY: 'activity:new',
  CONTROL: 'control:update',
  CONFIG: 'config:update',
} as const;