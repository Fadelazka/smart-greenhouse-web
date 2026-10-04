/**
 * Seed user awal + threshold default.
 *
 * Jalankan: npm run db:seed
 * Requires SUPABASE_DB_URL terisi (lihat db:setup)
 *
 * Password demo:
 *   admin@greenhouse.local    / admin123    (role admin)
 *   operator@greenhouse.local / operator123 (role operator)
 */

import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { db } from './client.js';
import { DEFAULT_THRESHOLDS, type Calibration, type Thresholds } from '../types/mqtt.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('db:seed');

const SEED_USERS = [
  {
    name: 'Pak Rudi (Admin)',
    email: 'admin@greenhouse.local',
    password: 'admin123',
    role: 'admin',
  },
  {
    name: 'Dimas (Operator)',
    email: 'operator@greenhouse.local',
    password: 'operator123',
    role: 'operator',
  },
];

async function main(): Promise<void> {
  if (!env.hasDatabase) {
    log.warn('SUPABASE_DB_URL kosong - seed dilewati.');
    log.warn('Backend tetap jalan dengan fallback in-memory. Login demo tetap berfungsi lewat route /api/auth/login.');
    process.exit(0);
  }

  log.info('seed user + threshold default...');

  for (const user of SEED_USERS) {
    // bcrypt cost 12 - cukup kuat untuk proyek ini, masih <1 detik.
    const hash = await bcrypt.hash(user.password, 12);
    await db.insertUser({
      name: user.name,
      email: user.email,
      passwordHash: hash,
      role: user.role,
    });
    log.info(`user siap: ${user.email} (${user.role})`);
  }

  await db.setSetting('thresholds', DEFAULT_THRESHOLDS as unknown as Thresholds);
  log.info('threshold default disimpan');

  await db.setSetting('calibration', {
    suhu: 0,
    humUdara: 0,
    humTanah: 0,
  } satisfies Calibration);
  log.info('kalibrasi default disimpan');

  log.info('seed selesai');
  await db.close();
}

void main();