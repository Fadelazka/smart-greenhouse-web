import mqtt, { type MqttClient } from 'mqtt';
import { env } from '../config/env.js';
import { telemetrySchema, statusSchema } from '../config/schemas.js';
import { db } from '../db/client.js';
import { broadcast } from '../realtime/socket.js';
import { SOCKET_EVENTS, TOPICS, type TelemetryPayload } from '../types/mqtt.js';
import { createLogger } from '../utils/logger.js';
import { checkThresholds } from '../services/alert.service.js';
import { DEVICE_ID } from '../types/mqtt.js';

const log = createLogger('mqtt:handlers');

/** Buffer insert ke DB supaya tidak satu query per pesan MQTT. */
const WRITE_BUFFER: Array<TelemetryPayload> = [];
const FLUSH_INTERVAL_MS = 5000;
const FLUSH_MAX_SIZE = 10;

let flushTimer: NodeJS.Timeout | null = null;

/** Anti-spam alert per sensor. */
const lastAlertAt = new Map<string, number>();

let client: MqttClient | null = null;

export function getMqttClient(): MqttClient | null {
  return client;
}

export function publishCmd(topic: string, payload: unknown): void {
  if (!client) {
    log.warn('client MQTT belum siap, payload tidak terkirim');
    return;
  }
  client.publish(topic, JSON.stringify(payload), { qos: 1 });
}

export function publishCmdToDevice(payload: Record<string, unknown>): void {
  publishCmd(TOPICS.CMD, payload);
}

export function publishConfigToDevice(thresholds: unknown, calibration: unknown): void {
  publishCmd(TOPICS.CONFIG, { ts: new Date().toISOString(), thresholds, calibration });
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushBuffer();
  }, FLUSH_INTERVAL_MS);
  flushTimer.unref?.();
}

export async function flushBuffer(): Promise<void> {
  if (WRITE_BUFFER.length === 0) return;

  const batch = WRITE_BUFFER.splice(0, WRITE_BUFFER.length);

  await Promise.allSettled(
    batch.map((reading) =>
      db.insertReading({
        deviceId: reading.deviceId,
        time: new Date(reading.ts),
        suhu: reading.suhu,
        humUdara: reading.humUdara,
        humTanah: reading.humTanah,
        rssi: reading.rssi,
        mode: reading.mode,
      }),
    ),
  );
}

function handleTelemetry(raw: Buffer): void {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw.toString('utf8'));
  } catch {
    log.warn('payload telemetry bukan JSON valid');
    return;
  }

  const result = telemetrySchema.safeParse(parsedJson);
  if (!result.success) {
    log.warn('payload telemetry tidak valid', result.error.issues[0]?.message);
    void db.insertActivity({
      time: new Date(),
      type: 'sensor_error',
      actor: 'device',
      message: `Payload telemetry ditolak: ${result.error.issues[0]?.message ?? 'tidak valid'}`,
      meta: { issues: result.error.issues },
    });
    return;
  }

  const payload = result.data;

  WRITE_BUFFER.push(payload);
  scheduleFlush();

  broadcast(SOCKET_EVENTS.TELEMETRY, payload);

  void checkThresholds(payload, lastAlertAt);
}

function handleStatus(raw: Buffer): void {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw.toString('utf8'));
  } catch {
    log.warn('payload status bukan JSON valid');
    return;
  }

  const result = statusSchema.safeParse(parsedJson);
  if (!result.success) return;

  broadcast(SOCKET_EVENTS.STATUS, result.data);

  log.info(`device ${result.data.status} (firmware ${result.data.firmware})`);
}

export function connectMqttClient(): void {
  const url = `mqtt://localhost:${env.MQTT_PORT}`;

  const instance = mqtt.connect(url, {
    clientId: `greenhouse-backend-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 2000,
    clean: true,
  });

  client = instance;

  instance.on('connect', () => {
    log.info(`terhubung ke broker di ${url}`);
    instance.subscribe([TOPICS.TELEMETRY, TOPICS.STATUS], { qos: 1 });
  });

  instance.on('message', (topic, payload) => {
    if (topic === TOPICS.TELEMETRY) handleTelemetry(payload);
    else if (topic === TOPICS.STATUS) handleStatus(payload);
  });

  instance.on('error', (error) => log.error('mqtt client error', error.message));

  instance.on('reconnect', () => log.debug('mqtt reconnecting...'));
}

export function disconnectMqttClient(): void {
  void flushBuffer();
  client?.end(true);
}

export { DEVICE_ID };