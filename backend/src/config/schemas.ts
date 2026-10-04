import { z } from 'zod';
import { SENSOR_RANGE } from '../types/mqtt.js';

const numberInRange = (key: keyof typeof SENSOR_RANGE, label: string) =>
  z.coerce
    .number()
    .finite(`${label} harus berupa angka`)
    .min(SENSOR_RANGE[key].min, `${label} terlalu rendah`)
    .max(SENSOR_RANGE[key].max, `${label} terlalu tinggi`);

const thresholdSchema = z
  .object({
    min: z.coerce.number().finite(),
    max: z.coerce.number().finite(),
  })
  .refine((t) => t.min < t.max, { message: 'nilai min harus lebih kecil dari max' });

const calibrationSchema = z.object({
  suhu: z.coerce.number().finite().min(-10).max(10),
  humUdara: z.coerce.number().finite().min(-20).max(20),
  humTanah: z.coerce.number().finite().min(-20).max(20),
});

export const telemetrySchema = z.object({
  ts: z.string().min(1, 'ts wajib diisi'),
  deviceId: z.string().min(1).max(64),
  suhu: numberInRange('suhu', 'suhu'),
  humUdara: numberInRange('humUdara', 'humUdara'),
  humTanah: numberInRange('humTanah', 'humTanah'),
  rssi: numberInRange('rssi', 'rssi'),
  mode: z.enum(['auto', 'manual']).catch('auto'),
});

export const statusSchema = z.object({
  ts: z.string().min(1),
  status: z.enum(['online', 'offline']).catch('offline'),
  firmware: z.string().max(32).catch('0.0.0'),
  uptime: z.coerce.number().finite().min(0).catch(0),
});

export const cmdSchema = z.object({
  ts: z.string().min(1),
  pump: z.enum(['on', 'off', 'auto']).optional(),
  fan: z.enum(['on', 'off', 'auto']).optional(),
  light: z.enum(['on', 'off', 'auto']).optional(),
  mode: z.enum(['auto', 'manual']).optional(),
  overrideUntil: z.coerce.number().int().positive().nullable().optional(),
  restart: z.boolean().optional(),
  issuedBy: z.string().max(64).optional(),
});

export const configSchema = z.object({
  thresholds: z.object({
    suhu: thresholdSchema,
    humUdara: thresholdSchema,
    humTanah: thresholdSchema,
  }),
  calibration: calibrationSchema,
});

export const loginSchema = z.object({
  email: z.string().email('format email tidak valid'),
  password: z.string().min(6, 'password minimal 6 karakter').max(128),
});

export const historyQuerySchema = z.object({
  range: z.enum(['1h', '6h', '24h', '7d']).default('24h'),
  bucket: z.coerce.number().int().min(1).max(1000).default(60),
});

export const actuatorControlSchema = z.object({
  actuator: z.enum(['pump', 'fan', 'light']),
  state: z.enum(['on', 'off', 'auto']),
  overrideSeconds: z.coerce.number().int().min(5).max(3600).default(60),
});

export const modeSchema = z.object({
  mode: z.enum(['auto', 'manual']),
});

export const calibrationUpdateSchema = z.object({
  calibration: calibrationSchema,
});

export const thresholdsUpdateSchema = z.object({
  thresholds: configSchema.shape.thresholds,
});

/**
 * Status kesehatan satu komponen hardware pada scene Visualisasi 3D.
 *
 * `normal` tidak berkedip, `warning` kuning dengan pulse lambat, `error`
 * merah dengan pulse cepat. Nama nilainya sengaja memakai bahasa Inggris
 * supaya sama dengan nilai yang dikirim ke backend, bukan label UI.
 */
const hardwareStatusSchema = z.enum(['normal', 'warning', 'error']);

/**
 * Perubahan status komponen hardware, dikirim dari halaman Visualisasi.
 *
 * `component` dibatasi ke 5 id yang benar-benar ada di scene. Kalau nanti ada
 * komponen baru, daftar ini yang harus ditambah - bukan diperlonggar jadi
 * string bebas, supaya activity log tidak bisa dipakai untuk spam.
 */
export const hardwareStatusChangeSchema = z.object({
  component: z.enum(['esp32', 'dht22', 'potentiometer', 'relay', 'lcd']),
  from: hardwareStatusSchema,
  to: hardwareStatusSchema,
  reason: z.string().min(1, 'reason wajib diisi').max(200),
});

export type TelemetryInput = z.infer<typeof telemetrySchema>;
export type CmdInput = z.infer<typeof cmdSchema>;
export type ConfigInput = z.infer<typeof configSchema>;
export type HistoryQuery = z.infer<typeof historyQuerySchema>;