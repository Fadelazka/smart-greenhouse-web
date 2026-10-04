import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { broadcast } from '../realtime/socket.js';
import { SOCKET_EVENTS } from '../types/mqtt.js';
import * as schema from './schema.js';

const log = createLogger('db');

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.data');
const FALLBACK_FILE = path.join(DATA_DIR, 'fallback.json');

export type ReadingRow = {
  id: string;
  deviceId: string;
  time: Date;
  suhu: string;
  humUdara: string;
  humTanah: string;
  rssi: number;
  mode: string;
};

export type AlertRow = {
  id: string;
  deviceId: string;
  time: Date;
  sensor: string;
  value: string;
  severity: string;
  message: string;
  resolved: boolean;
};

export type ActivityRow = {
  id: string;
  time: Date;
  type: string;
  actor: string;
  message: string;
  meta: Record<string, unknown> | null;
};

export type SettingRow = {
  key: string;
  value: unknown;
  updatedAt: Date;
};

export type UserRow = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
};

type FallbackData = {
  sensorReadings: ReadingRow[];
  alerts: AlertRow[];
  activityLogs: ActivityRow[];
  settings: SettingRow[];
};

const MAX_FALLBACK_READINGS = 5000;
const MAX_FALLBACK_ACTIVITY = 1000;

function emptyFallback(): FallbackData {
  return { sensorReadings: [], alerts: [], activityLogs: [], settings: [] };
}

let fallbackState: FallbackData = emptyFallback();

function loadFallback(): FallbackData {
  try {
    if (!fs.existsSync(FALLBACK_FILE)) return emptyFallback();
    const parsed = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf8')) as Partial<FallbackData>;
    return {
      sensorReadings: parsed.sensorReadings ?? [],
      alerts: parsed.alerts ?? [],
      activityLogs: parsed.activityLogs ?? [],
      settings: parsed.settings ?? [],
    };
  } catch (error) {
    log.warn('gagal baca file fallback, mulai dari kosong', error);
    return emptyFallback();
  }
}

function writeFallback(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(fallbackState), 'utf8');
  } catch (error) {
    log.error('gagal tulis file fallback', error);
  }
}

let fallbackTimer: NodeJS.Timeout | null = null;

function scheduleFlush(): void {
  if (fallbackTimer) return;
  fallbackTimer = setTimeout(() => {
    fallbackTimer = null;
    writeFallback();
  }, 2000);
  fallbackTimer.unref?.();
}

export function flushFallback(): void {
  writeFallback();
}

/**
 * Abstraksi penyimpanan.
 * - Bila SUPABASE_DB_URL diisi -> PostgreSQL (Supabase) + TimescaleDB.
 * - Bila kosong -> in-memory dengan flush periodik ke .data/fallback.json,
 *   supaya demo tetap bisa jalan tanpa akun Supabase.
 */
class Database {
  readonly pool: pg.Pool | null = null;
  readonly usingFallback: boolean;

  constructor() {
    if (env.hasDatabase) {
      this.pool = new pg.Pool({
        connectionString: env.SUPABASE_DB_URL,
        max: 10,
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 10_000,
      });
      this.pool.on('error', (error) => log.error('pg pool error', error.message));
      this.usingFallback = false;
      log.info('mode: PostgreSQL (Supabase)');
    } else {
      fallbackState = loadFallback();
      this.usingFallback = true;
      log.warn('SUPABASE_DB_URL kosong - mode: in-memory + .data/fallback.json');
    }
  }

  private get orm() {
    if (!this.pool) throw new Error('PostgreSQL tidak dikonfigurasi (set SUPABASE_DB_URL)');
    return drizzle(this.pool, { schema });
  }

  // ---------- sensor readings ----------

  async insertReading(row: {
    deviceId: string;
    time: Date;
    suhu: number;
    humUdara: number;
    humTanah: number;
    rssi: number;
    mode: string;
  }): Promise<void> {
    if (this.usingFallback) {
      fallbackState.sensorReadings.push({
        id: crypto.randomUUID(),
        deviceId: row.deviceId,
        time: row.time,
        suhu: String(row.suhu),
        humUdara: String(row.humUdara),
        humTanah: String(row.humTanah),
        rssi: row.rssi,
        mode: row.mode,
      });
      if (fallbackState.sensorReadings.length > MAX_FALLBACK_READINGS) {
        fallbackState.sensorReadings.splice(0, fallbackState.sensorReadings.length - MAX_FALLBACK_READINGS);
      }
      scheduleFlush();
      return;
    }

    await this.orm.insert(schema.sensorReadings).values({
      deviceId: row.deviceId,
      time: row.time,
      suhu: String(row.suhu),
      humUdara: String(row.humUdara),
      humTanah: String(row.humTanah),
      rssi: row.rssi,
      mode: row.mode,
    });
  }

  async queryReadings(
    deviceId: string,
    from: Date,
    to: Date,
    bucketSeconds: number,
  ): Promise<Array<{ time: Date; suhu: number; humUdara: number; humTanah: number; samples: number }>> {
    if (this.usingFallback) {
      const bucketMs = bucketSeconds * 1000;
      const buckets = new Map<number, { suhu: number; humUdara: number; humTanah: number; n: number }>();

      for (const row of fallbackState.sensorReadings) {
        const t = new Date(row.time).getTime();
        if (t < from.getTime() || t > to.getTime()) continue;
        const key = Math.floor(t / bucketMs) * bucketMs;
        const acc = buckets.get(key) ?? { suhu: 0, humUdara: 0, humTanah: 0, n: 0 };
        acc.suhu += Number(row.suhu);
        acc.humUdara += Number(row.humUdara);
        acc.humTanah += Number(row.humTanah);
        acc.n += 1;
        buckets.set(key, acc);
      }

      return [...buckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([time, acc]) => ({
          time: new Date(time),
          suhu: acc.suhu / acc.n,
          humUdara: acc.humUdara / acc.n,
          humTanah: acc.humTanah / acc.n,
          samples: acc.n,
        }));
    }

    const result = await this.pool!.query<{
      bucket: Date;
      suhu: string;
      hum_udara: string;
      hum_tanah: string;
      samples: number;
    }>(
      `SELECT
         time_bucket($1::interval, time) AS bucket,
         AVG(suhu)::numeric         AS suhu,
         AVG(hum_udara)::numeric    AS hum_udara,
         AVG(hum_tanah)::numeric    AS hum_tanah,
         COUNT(*)::int              AS samples
       FROM sensor_readings
       WHERE device_id = $2 AND time >= $3 AND time <= $4
       GROUP BY bucket
       ORDER BY bucket ASC`,
      [`${bucketSeconds} seconds`, deviceId, from.toISOString(), to.toISOString()],
    );

    return result.rows.map((r) => ({
      time: new Date(r.bucket),
      suhu: Number(r.suhu),
      humUdara: Number(r.hum_udara),
      humTanah: Number(r.hum_tanah),
      samples: Number(r.samples),
    }));
  }

  async latestReading(deviceId: string): Promise<{
    time: Date;
    suhu: number;
    humUdara: number;
    humTanah: number;
    rssi: number;
    mode: string;
  } | null> {
    if (this.usingFallback) {
      const row = fallbackState.sensorReadings
        .filter((r) => r.deviceId === deviceId)
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
      if (!row) return null;
      return {
        time: new Date(row.time),
        suhu: Number(row.suhu),
        humUdara: Number(row.humUdara),
        humTanah: Number(row.humTanah),
        rssi: row.rssi,
        mode: row.mode,
      };
    }

    const rows = await this.orm
      .select()
      .from(schema.sensorReadings)
      .where(eq(schema.sensorReadings.deviceId, deviceId))
      .orderBy(desc(schema.sensorReadings.time))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      time: row.time,
      suhu: Number(row.suhu),
      humUdara: Number(row.humUdara),
      humTanah: Number(row.humTanah),
      rssi: row.rssi,
      mode: row.mode,
    };
  }

  async countReadings(): Promise<number> {
    if (this.usingFallback) return fallbackState.sensorReadings.length;
    const result = await this.pool!.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM sensor_readings',
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  // ---------- alerts ----------

  async insertAlert(row: {
    deviceId: string;
    time: Date;
    sensor: string;
    value: number;
    severity: string;
    message: string;
  }): Promise<void> {
    if (this.usingFallback) {
      fallbackState.alerts.push({
        id: crypto.randomUUID(),
        deviceId: row.deviceId,
        time: row.time,
        sensor: row.sensor,
        value: String(row.value),
        severity: row.severity,
        message: row.message,
        resolved: false,
      });
      scheduleFlush();
      return;
    }

    await this.orm.insert(schema.alerts).values({
      deviceId: row.deviceId,
      time: row.time,
      sensor: row.sensor,
      value: String(row.value),
      severity: row.severity,
      message: row.message,
    });
  }

  async listAlerts(limit = 50): Promise<
    Array<{ id: string; time: Date; sensor: string; value: number; severity: string; message: string }>
  > {
    if (this.usingFallback) {
      return [...fallbackState.alerts]
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, limit)
        .map((a) => ({
          id: a.id,
          time: new Date(a.time),
          sensor: a.sensor,
          value: Number(a.value),
          severity: a.severity,
          message: a.message,
        }));
    }

    const rows = await this.orm
      .select()
      .from(schema.alerts)
      .orderBy(desc(schema.alerts.time))
      .limit(limit);

    return rows.map((a) => ({
      id: a.id,
      time: a.time,
      sensor: a.sensor,
      value: Number(a.value),
      severity: a.severity,
      message: a.message,
    }));
  }

  // ---------- activity logs ----------

  /**
   * Catat satu entri activity lalu siarkan ke client Socket.io.
   *
   * Broadcast dilakukan di sini, bukan di tiap route, supaya halaman Timeline
   * tetap sinkron tanpa perlu setiap pemanggil ingat memanggil `broadcast`.
   * Consequence: `time` disiarkan sebagai ISO string, karena `Date` akan
   * di-JSON jadi string anyways tapi ini menghindari perbedaan tipe.
   */
  async insertActivity(row: {
    time: Date;
    type: string;
    actor: string;
    message: string;
    meta?: Record<string, unknown> | null;
  }): Promise<void> {
    let entry: { id: string; time: Date; type: string; actor: string; message: string };

    if (this.usingFallback) {
      entry = {
        id: crypto.randomUUID(),
        time: row.time,
        type: row.type,
        actor: row.actor,
        message: row.message,
      };

      fallbackState.activityLogs.push({ ...entry, meta: row.meta ?? null });
      if (fallbackState.activityLogs.length > MAX_FALLBACK_ACTIVITY) {
        fallbackState.activityLogs.splice(
          0,
          fallbackState.activityLogs.length - MAX_FALLBACK_ACTIVITY,
        );
      }
      scheduleFlush();
    } else {
      const inserted = await this.orm
        .insert(schema.activityLogs)
        .values({
          time: row.time,
          type: row.type,
          actor: row.actor,
          message: row.message,
          meta: row.meta ?? null,
        })
        .returning({
          id: schema.activityLogs.id,
          time: schema.activityLogs.time,
          type: schema.activityLogs.type,
          actor: schema.activityLogs.actor,
          message: schema.activityLogs.message,
        });

      const created = inserted[0];
      if (!created) return;
      entry = {
        id: created.id,
        time: created.time,
        type: created.type,
        actor: created.actor,
        message: created.message,
      };
    }

    broadcast(SOCKET_EVENTS.ACTIVITY, {
      id: entry.id,
      time: entry.time.toISOString(),
      type: entry.type,
      actor: entry.actor,
      message: entry.message,
    });
  }

  async listActivity(
    limit = 50,
    offset = 0,
  ): Promise<Array<{ id: string; time: Date; type: string; actor: string; message: string }>> {
    if (this.usingFallback) {
      return [...fallbackState.activityLogs]
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(offset, offset + limit)
        .map((a) => ({
          id: a.id,
          time: new Date(a.time),
          type: a.type,
          actor: a.actor,
          message: a.message,
        }));
    }

    const rows = await this.orm
      .select()
      .from(schema.activityLogs)
      .orderBy(desc(schema.activityLogs.time))
      .limit(limit)
      .offset(offset);

    return rows.map((a) => ({
      id: a.id,
      time: a.time,
      type: a.type,
      actor: a.actor,
      message: a.message,
    }));
  }

  // ---------- settings ----------

  async getSetting<T>(key: string, fallbackValue: T): Promise<T> {
    if (this.usingFallback) {
      const row = fallbackState.settings.find((s) => s.key === key);
      return row ? (row.value as T) : fallbackValue;
    }

    const rows = await this.orm.select().from(schema.settings).limit(200);
    const row = rows.find((r) => r.key === key);
    return row ? (row.value as T) : fallbackValue;
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    if (this.usingFallback) {
      const existing = fallbackState.settings.find((s) => s.key === key);
      if (existing) {
        existing.value = value as SettingRow['value'];
        existing.updatedAt = new Date();
      } else {
        fallbackState.settings.push({ key, value: value as SettingRow['value'], updatedAt: new Date() });
      }
      scheduleFlush();
      return;
    }

    await this.orm
      .insert(schema.settings)
      .values({ key, value: value as SettingRow['value'] })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: value as SettingRow['value'], updatedAt: new Date() },
      });
  }

  // ---------- users ----------

  async findUserByEmail(email: string): Promise<UserRow | null> {
    if (this.usingFallback) return null;

    const rows = await this.orm
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1);

    return rows[0] ?? null;
  }

  async listUsers(): Promise<Array<Omit<UserRow, 'passwordHash'>>> {
    if (this.usingFallback) return [];

    const rows = await this.orm
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
      })
      .from(schema.users);

    return rows;
  }

  async insertUser(row: { name: string; email: string; passwordHash: string; role: string }): Promise<void> {
    if (this.usingFallback) {
      log.warn('mode in-memory tidak bisa menyimpan user - jalankan db:setup dengan SUPABASE_DB_URL');
      return;
    }

    await this.orm
      .insert(schema.users)
      .values({
        name: row.name,
        email: row.email.toLowerCase(),
        passwordHash: row.passwordHash,
        role: row.role,
      })
      .onConflictDoNothing();
  }

  async close(): Promise<void> {
    flushFallback();
    await this.pool?.end();
  }
}

export const db = new Database();