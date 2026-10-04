/**
 * Simulator ESP32 (development only).
 *
 * Meniru perilaku sensor greenhouse sungguhan:
 * - Suhu mengikuti pola siang/malam (sinus, puncak sekitar pukul 14:00)
 * - Kelembaban udara berlawanan dengan suhu (transpirasi)
 * - Kelembaban tanah menurun perlahan saat pompa mati, naik cepat saat pompa nyala
 * - RSSI fluctuasi ringan
 *
 * Update memakai pendekatan "approach target":
 *   nilai_baru = nilai_lama + (target - nilai_lama) * rate + noise
 * sehingga kurva bergerak gradual seperti sensor nyata, bukan lompat-lompat.
 *
 * PENTING: log ditulis ke STDOUT saja (tidak ke STDERR), supaya kalau
 * dijalankan lewat concurrently / Start-Process tidak muncul "RemoteException"
 * dari PowerShell yang menganggap stderr sebagai error.
 */

import 'dotenv/config';
import mqtt from 'mqtt';

const MQTT_URL = process.env.MQTT_URL ?? 'mqtt://localhost:1883';
const INTERVAL_MS = Number(process.env.SIM_INTERVAL_MS ?? '2000');
const DEVICE_ID = process.env.SIM_DEVICE_ID ?? 'esp32-greenhouse-01';
const FIRMWARE = '1.0.0-sim';

const PREFIX = 'greenhouse';

const RESET = '\x1b[0m';
const COLOR = {
  info: '\x1b[35m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  ok: '\x1b[32m',
  dim: '\x1b[90m',
} as const;

function log(level: keyof typeof COLOR, message: string): void {
  // process.stdout.write tidak pernah memicu NativeCommandError,Berbeda dengan console.error.
  process.stdout.write(`${COLOR[level]}[simulator]${RESET} ${message}\n`);
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
const noise = (amplitude: number) => (Math.random() - 0.5) * amplitude;

type Actuators = { pump: boolean; fan: boolean; light: boolean };

const actuators: Actuators = { pump: false, fan: false, light: false };
let mode: 'auto' | 'manual' = 'auto';
let overrideUntil = 0;
let overrideAt: Partial<Record<keyof Actuators, boolean>> = {};

type SensorLimits = { min: number; max: number };
type Config = {
  thresholds: { suhu: SensorLimits; humUdara: SensorLimits; humTanah: SensorLimits };
  calibration: { suhu: number; humUdara: number; humTanah: number };
};

let config: Config = {
  thresholds: {
    suhu: { min: 18, max: 32 },
    humUdara: { min: 50, max: 85 },
    humTanah: { min: 40, max: 75 },
  },
  calibration: { suhu: 0, humUdara: 0, humTanah: 0 },
};

const state = {
  suhu: 26.0,
  humUdara: 68.0,
  humTanah: 55.0,
  rssi: -55,
};

const startedAt = Date.now();

function targetSuhu(): number {
  const now = new Date();
  const jam = now.getHours() + now.getMinutes() / 60;

  // Puncak panas sekitar pukul 14:00, terendah sekitar pukul 05:00.
  const cycle = Math.sin(((jam - 8) / 24) * Math.PI * 2);
  let base = 26 + cycle * 5;

  if (actuators.light) base += 2.5;
  if (actuators.fan) base -= 3.0;

  return base;
}

function targetHumUdara(): number {
  return clamp(88 - targetSuhu() * 0.85, 30, 98);
}

function targetHumTanah(): number {
  if (actuators.pump) return 78;
  const { min, max } = config.thresholds.humTanah;
  return (min + max) / 2 - 6;
}

function autoDecide(): void {
  if (Date.now() < overrideUntil) {
    for (const actuator of ['pump', 'fan', 'light'] as const) {
      const forced = overrideAt[actuator];
      if (typeof forced === 'boolean') actuators[actuator] = forced;
    }
    return;
  }

  // Override sudah habis -> keputusan balik ke ESP32 (mode auto).
  const { suhu, humTanah } = config.thresholds;
  const now = new Date();
  const hour = now.getHours();

  actuators.pump = state.humTanah < humTanah.min;
  actuators.fan = state.suhu > suhu.max;
  actuators.light = hour < 6 || (hour >= 18 && hour < 21) || state.suhu < suhu.min * 0.9;
}

let tickCount = 0;

function tick(): void {
  if (!client.connected) return;

  autoDecide();

  state.suhu = clamp(state.suhu + (targetSuhu() - state.suhu) * 0.08 + noise(0.25), 5, 60);
  state.humUdara = clamp(state.humUdara + (targetHumUdara() - state.humUdara) * 0.06 + noise(0.6), 20, 99);
  // Tanah punya massa air besar -> respons lebih lambat.
  state.humTanah = clamp(state.humTanah + (targetHumTanah() - state.humTanah) * 0.05 + noise(0.3), 5, 99);
  state.rssi = clamp(state.rssi + noise(2), -85, -30);

  const payload = {
    ts: new Date().toISOString(),
    deviceId: DEVICE_ID,
    suhu: round1(clamp(state.suhu + config.calibration.suhu, -10, 80)),
    humUdara: round1(clamp(state.humUdara + config.calibration.humUdara, 0, 100)),
    humTanah: round1(clamp(state.humTanah + config.calibration.humTanah, 0, 100)),
    rssi: Math.round(state.rssi),
    mode,
  };

  client.publish(`${PREFIX}/telemetry`, JSON.stringify(payload), { qos: 1 });

  tickCount += 1;
  if (tickCount % 15 === 1) {
    const aktuator = [
      actuators.pump ? 'pompa ON' : 'pompa off',
      actuators.fan ? 'kipas ON' : 'kipas off',
      actuators.light ? 'lampu ON' : 'lampu off',
    ].join(', ');

    log(
      'dim',
      `tick #${tickCount} | ${payload.suhu}C / ${payload.humUdara}% / ${payload.humTanah}% | rssi ${payload.rssi} | ${aktuator} | mode ${mode}`,
    );
  }
}

function publishStatus(status: 'online' | 'offline'): void {
  client.publish(
    `${PREFIX}/status`,
    JSON.stringify({
      ts: new Date().toISOString(),
      status,
      firmware: FIRMWARE,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
    }),
    { qos: 1, retain: true },
  );
}

const client = mqtt.connect(MQTT_URL, {
  clientId: `sim-${Math.random().toString(16).slice(2, 8)}`,
  // Backoff eksponensial bawaan mqtt.js (dibatasi connectTimeout), retry
  // tanpa henti. Menghindari stampede saat broker belum siap.
  reconnectPeriod: 1000,
  connectTimeout: 10_000,
  resubscribe: true,
});

let attempt = 0;

client.on('connect', () => {
  attempt = 0;
  log('ok', `terhubung ke ${MQTT_URL} sebagai ${DEVICE_ID}`);
  client.subscribe([`${PREFIX}/cmd`, `${PREFIX}/config`], { qos: 1 });
  publishStatus('online');
});

client.on('reconnect', () => {
  attempt += 1;
  if (attempt === 1 || attempt % 5 === 0) {
    log(
      'warn',
      `broker belum tersedia, mencoba lagi (percobaan ${attempt}). ` +
        `Pastikan \`npm run dev:broker\` sudah jalan di terminal lain.`,
    );
  }
});

client.on('error', (error) => {
  // Pesan error MQTT.js sering kosong; tampilkan kode error kalau ada.
  const detail = error.message || (error as { code?: string }).code || 'kesalahan tidak diketahui';
  log('error', `MQTT: ${detail}`);
});

client.on('close', () => {
  log('warn', 'koneksi terputus, menunggu broker...');
});

client.on('offline', () => {
  log('warn', 'klien offline');
});

client.on('message', (topic, message) => {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(message.toString()) as Record<string, unknown>;
  } catch {
    log('warn', `payload di ${topic} bukan JSON valid, diabaikan`);
    return;
  }

  if (topic === `${PREFIX}/cmd`) {
    if (data.restart === true) {
      log('warn', 'restart diminta - mensimulasikan reboot (aktigator dimatikan)');
      actuators.pump = false;
      actuators.fan = false;
      actuators.light = false;
      mode = 'auto';
      return;
    }

    if (typeof data.mode === 'string') mode = data.mode as 'auto' | 'manual';

    if (typeof data.overrideUntil === 'number') {
      overrideUntil = data.overrideUntil;
      overrideAt = {};

      for (const actuator of ['pump', 'fan', 'light'] as const) {
        const value = data[actuator];
        if (typeof value === 'string') overrideAt[actuator] = value === 'on';
      }

      if (mode !== 'manual') mode = 'manual';

      const aktif = Object.entries(overrideAt)
        .filter(([, on]) => on)
        .map(([nama]) => nama);

      const durasi = Math.max(0, Math.round((overrideUntil - Date.now()) / 1000));
      log('warn', `manual override ${aktif.join(', ') || 'tidak ada'} selama ${durasi} detik`);
    }
  }

  if (topic === `${PREFIX}/config`) {
    const incoming = data as unknown as Partial<Config>;
    if (incoming.thresholds) config.thresholds = incoming.thresholds;
    if (incoming.calibration) config.calibration = incoming.calibration;
    log('info', 'konfigurasi (threshold/kalibrasi) diperbarui');
  }
});

setInterval(tick, INTERVAL_MS);

function shutdown(): void {
  if (client.connected) {
    publishStatus('offline');
    client.end(false, {}, () => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
