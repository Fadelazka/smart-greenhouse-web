/**
 * Membuat schema di PostgreSQL + mengaktifkan TimescaleDB.
 *
 * Jalankan: npm run db:setup
 * Requires SUPABASE_DB_URL terisi di backend/.env
 */

import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('db:setup');

const SQL_STATEMENTS = [
  `CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE`,
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp" CASCADE`,

  `CREATE TABLE IF NOT EXISTS users (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name text NOT NULL,
     email text NOT NULL UNIQUE,
     password_hash text NOT NULL,
     role text NOT NULL DEFAULT 'operator',
     created_at timestamptz NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS sensor_readings (
     id uuid NOT NULL,
     device_id text NOT NULL,
     time timestamptz NOT NULL,
     suhu numeric(5,2) NOT NULL,
     hum_udara numeric(5,2) NOT NULL,
     hum_tanah numeric(5,2) NOT NULL,
     rssi integer NOT NULL,
     mode text NOT NULL DEFAULT 'auto'
   )`,

  `CREATE INDEX IF NOT EXISTS sensor_readings_device_time_idx
     ON sensor_readings (device_id, time DESC)`,

  `ALTER TABLE sensor_readings SET (timescaledb.hypertable)`,

  `SELECT set_chunk_preprocess('sensor_readings', 1)`,

  // Retention: hapus data lebih dari 90 hari otomatis.
  `SELECT add_retention_policy('sensor_readings', INTERVAL '90 days', if_not_exists => true)`,

  `CREATE TABLE IF NOT EXISTS alerts (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     device_id text NOT NULL,
     time timestamptz NOT NULL,
     sensor text NOT NULL,
     value numeric(6,2) NOT NULL,
     severity text NOT NULL,
     message text NOT NULL,
     resolved boolean NOT NULL DEFAULT false
   )`,

  `CREATE INDEX IF NOT EXISTS alerts_device_time_idx ON alerts (device_id, time DESC)`,

  `CREATE TABLE IF NOT EXISTS activity_logs (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     time timestamptz NOT NULL,
     type text NOT NULL,
     actor text NOT NULL,
     message text NOT NULL,
     meta jsonb
   )`,

  `CREATE INDEX IF NOT EXISTS activity_logs_time_idx ON activity_logs (time DESC)`,

  `CREATE TABLE IF NOT EXISTS settings (
     key text PRIMARY KEY,
     value jsonb NOT NULL,
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS device_state (
     device_id text PRIMARY KEY,
     online boolean NOT NULL DEFAULT false,
     last_seen timestamptz,
     last_telemetry jsonb,
     firmware text NOT NULL DEFAULT '0.0.0',
     uptime integer NOT NULL DEFAULT 0
   )`,
];

async function main(): Promise<void> {
  if (!env.hasDatabase) {
    log.error('SUPABASE_DB_URL belum diisi di backend/.env');
    log.error('Salin backend/.env.example ke backend/.env lalu isi connection string dari Supabase Dashboard.');
    log.error('Sementara backend berjalan dengan fallback in-memory, jadi script ini bisa dilewati.');
    process.exit(1);
  }

  log.info('menghubungkan ke PostgreSQL...');

  const pg = (await import('pg')).default;
  const pool = new pg.Pool({ connectionString: env.SUPABASE_DB_URL, max: 1, connectionTimeoutMillis: 15_000 });

  try {
    for (const statement of SQL_STATEMENTS) {
      const label = statement.trim().split('\n')[0]?.slice(0, 70) ?? statement.slice(0, 70);
      try {
        await pool.query(statement);
        log.info(`OK  ${label}`);
      } catch (error) {
        // Pernyataan yang "sudah ada" (hypertable, retention policy) boleh gagal diam-diam.
        const message = (error as Error).message;
        if (/already a hypertable|already exists|already exists|is not NULL|duplicate/i.test(message)) {
          log.warn(`SKIP ${label} - ${message.split('\n')[0]}`);
        } else {
          log.error(`FAIL ${label} - ${message}`);
          throw error;
        }
      }
    }

    log.info('schema selesai. Lanjut: npm run db:seed');
  } catch (error) {
    log.error('setup gagal', (error as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();