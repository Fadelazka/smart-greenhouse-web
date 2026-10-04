import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Catatan penting tentang TimescaleDB:
 * Konversi tabel sensor_readings jadi hypertable dilakukan di src/db/setup.ts
 * (perintah CREATE EXTENSION + SELECT create_hypertable), bukan di sini,
 * karena Drizzle tidak punya DSL untuk itu.
 */

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('operator'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_idx').on(t.email)],
);

export const sensorReadings = pgTable(
  'sensor_readings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: text('device_id').notNull(),
    time: timestamp('time', { withTimezone: true }).notNull(),
    suhu: numeric('suhu', { precision: 5, scale: 2 }).notNull(),
    humUdara: numeric('hum_udara', { precision: 5, scale: 2 }).notNull(),
    humTanah: numeric('hum_tanah', { precision: 5, scale: 2 }).notNull(),
    rssi: integer('rssi').notNull(),
    mode: text('mode').notNull().default('auto'),
  },
  (t) => [index('sensor_readings_device_time_idx').on(t.deviceId, t.time)],
);

export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: text('device_id').notNull(),
    time: timestamp('time', { withTimezone: true }).notNull(),
    sensor: text('sensor').notNull(),
    value: numeric('value', { precision: 6, scale: 2 }).notNull(),
    severity: text('severity').notNull(),
    message: text('message').notNull(),
    resolved: boolean('resolved').notNull().default(false),
  },
  (t) => [index('alerts_device_time_idx').on(t.deviceId, t.time)],
);

export const activityLogs = pgTable(
  'activity_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    time: timestamp('time', { withTimezone: true }).notNull(),
    type: text('type').notNull(),
    actor: text('actor').notNull(),
    message: text('message').notNull(),
    meta: jsonb('meta'),
  },
  (t) => [index('activity_logs_time_idx').on(t.time)],
);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const deviceState = pgTable('device_state', {
  deviceId: text('device_id').primaryKey(),
  online: boolean('online').notNull().default(false),
  lastSeen: timestamp('last_seen', { withTimezone: true }),
  lastTelemetry: jsonb('last_telemetry'),
  firmware: text('firmware').notNull().default('0.0.0'),
  uptime: integer('uptime').notNull().default(0),
});

export { sql };