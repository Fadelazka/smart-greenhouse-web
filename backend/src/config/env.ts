import 'dotenv/config';
import { z } from 'zod';

/**
 * Validasi env dengan Zod - fail fast di startup, bukan crash belakangan.
 * Kalau SUPABASE_DB_URL kosong, backend otomatis pakai fallback in-memory
 * supaya demo tetap bisa jalan tanpa akun Supabase.
 */

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  SUPABASE_URL: z.string().default(''),
  SUPABASE_ANON_KEY: z.string().default(''),
  SUPABASE_SERVICE_KEY: z.string().default(''),
  SUPABASE_DB_URL: z.string().default(''),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET minimal 16 karakter').default('dev-only-secret-change-me-please'),
  JWT_EXPIRES_IN: z.string().default('12h'),

  MQTT_BROKER_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  MQTT_PORT: z.coerce.number().int().positive().default(1883),
  MQTT_WS_PORT: z.coerce.number().int().positive().default(9001),
  MQTT_USERNAME: z.string().default(''),
  MQTT_PASSWORD: z.string().default(''),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  ALERT_COOLDOWN_SEC: z.coerce.number().int().min(0).default(300),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Konfigurasi environment tidak valid:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  console.error('\nSalin backend/.env.example ke backend/.env lalu isi nilainya.');
  process.exit(1);
}

const raw = parsed.data;

const isProduction = raw.NODE_ENV === 'production';

if (isProduction && raw.JWT_SECRET === 'dev-only-secret-change-me-please') {
  console.error('JWT_SECRET wajib diganti pada mode production.');
  process.exit(1);
}

const hasDatabase = raw.SUPABASE_DB_URL.length > 0;

export const env = {
  ...raw,
  isProduction,
  hasDatabase,
  corsOrigins: raw.CORS_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
} as const;

export type Env = typeof env;