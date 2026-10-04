import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { broadcast } from '../realtime/socket.js';
import {
  DEFAULT_THRESHOLDS,
  SOCKET_EVENTS,
  type AlertPayload,
  type AlertSeverity,
  type TelemetryPayload,
  type Thresholds,
} from '../types/mqtt.js';
import { createLogger } from '../utils/logger.js';
import { sendTelegramAlert } from './telegram.service.js';

const log = createLogger('alert');

const DEFAULT_CALIBRATION = { suhu: 0, humUdara: 0, humTanah: 0 } as const;

export async function getThresholds(): Promise<Thresholds> {
  return db.getSetting<Thresholds>('thresholds', DEFAULT_THRESHOLDS as unknown as Thresholds);
}

export async function getCalibration(): Promise<Record<'suhu' | 'humUdara' | 'humTanah', number>> {
  return db.getSetting('calibration', { ...DEFAULT_CALIBRATION });
}

const SENSOR_LABEL: Record<'suhu' | 'humUdara' | 'humTanah', string> = {
  suhu: 'Suhu udara',
  humUdara: 'Kelembaban udara',
  humTanah: 'Kelembaban tanah',
};

const UNIT: Record<'suhu' | 'humUdara' | 'humTanah', string> = {
  suhu: '°C',
  humUdara: '%',
  humTanah: '%',
};

type SensorState = 'ok' | 'warning' | 'critical';
type Side = 'below' | 'above' | 'near-below' | 'near-above';

/**
 * Menentukan status satu nilai terhadap batas min/max, sekaligus arahnya.
 *
 * Arah dikembalikan bersama state, bukan dihitung ulang terpisah di pemanggil.
 * Kalau pemanggil menebak arah dengan `value < min ? bawah : atas`, nilai yang
 * masih di dalam rentang tapi mendekati batas akan salah dilaporkan sebagai
 * "di atas batas maksimum" - padahal belum keluar batas sama sekali.
 */
function evaluate(
  value: number,
  min: number,
  max: number,
): { state: SensorState; severity: AlertSeverity; side: Side } {
  if (value < min || value > max) {
    return { state: 'critical', severity: 'critical', side: value < min ? 'below' : 'above' };
  }

  const span = max - min;
  if (span <= 0) return { state: 'ok', severity: 'info', side: 'near-below' };

  const margin = span * 0.1;
  const nearLow = value < min + margin;
  const nearHigh = value > max - margin;

  if (nearLow || nearHigh) {
    return {
      state: 'warning',
      severity: 'warning',
      side: nearLow ? 'near-below' : 'near-above',
    };
  }

  return { state: 'ok', severity: 'info', side: 'near-below' };
}

/** Narasi arah untuk pesan alert, mengikuti sisi yang benar-benar dilanggar. */
const SIDE_LABEL: Record<Side, string> = {
  below: 'di bawah batas minimum',
  above: 'di atas batas maksimum',
  'near-below': 'mendekati batas minimum',
  'near-above': 'mendekati batas maksimum',
};

/**
 * Cek tiap nilai sensor terhadap threshold. Alert hanya dibuat saat berubah
 * dari "ok" -> tidak ok, lalu di-cooldown selama ALERT_COOLDOWN_SEC supaya
 * tidak spam setiap 2 detik.
 */
export async function checkThresholds(
  payload: TelemetryPayload,
  lastAlertAt: Map<string, number>,
): Promise<void> {
  const thresholds = await getThresholds();

  const sensors: Array<'suhu' | 'humUdara' | 'humTanah'> = ['suhu', 'humUdara', 'humTanah'];

  for (const sensor of sensors) {
    const value = payload[sensor];
    const limit = thresholds[sensor];
    const { state, severity, side } = evaluate(value, limit.min, limit.max);

    const key = `${payload.deviceId}:${sensor}`;

    if (state === 'ok') {
      lastAlertAt.delete(key);
      continue;
    }

    const last = lastAlertAt.get(key) ?? 0;
    const cooldownMs = env.ALERT_COOLDOWN_SEC * 1000;
    if (Date.now() - last < cooldownMs) continue;

    lastAlertAt.set(key, Date.now());

    const label = SENSOR_LABEL[sensor];
    const unit = UNIT[sensor];
    const direction = SIDE_LABEL[side];
    const message = `${label} ${value.toFixed(1)}${unit} ${direction} (${limit.min}–${limit.max}${unit})`;

    const alert: AlertPayload = {
      ts: new Date().toISOString(),
      sensor,
      value,
      threshold: limit,
      severity,
    };

    await db.insertAlert({
      deviceId: payload.deviceId,
      time: new Date(),
      sensor,
      value,
      severity,
      message,
    });

    await db.insertActivity({
      time: new Date(),
      type: 'alert',
      actor: 'system',
      message,
      meta: { sensor, value, threshold: limit, severity },
    });

    broadcast(SOCKET_EVENTS.ALERT, alert);
    log.warn(message);

    // Telegram adalah kanal tambahan, bukan jalur utama. Panggilannya tidak
    // di-await supaya satu pesan yang lambat tidak menunda alert berikutnya, dan
    // service-nya sendiri sudah menelan semua error jadi tidak ada Promise
    // yang menggantung tanpa penanganan.
    void sendTelegramAlert(key, severity, [
      `${label}: ${value.toFixed(1)}${unit} ${direction}`,
      `Rentang ideal ${limit.min}${unit} sampai ${limit.max}${unit}`,
      `Perangkat ${payload.deviceId}`,
      new Date().toLocaleString('id-ID'),
    ]);
  }
}