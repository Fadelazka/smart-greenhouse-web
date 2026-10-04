import { Router } from 'express';
import { hardwareStatusChangeSchema } from '../config/schemas.js';
import { getActor, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { db } from '../db/client.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('logs');

export const logsRouter = Router();

logsRouter.get('/activity', requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? '50'), 200);
  const offset = Math.max(Number(req.query.offset ?? '0'), 0);

  const entries = await db.listActivity(limit, offset);
  res.json({ entries, limit, offset });
});

const HARDWARE_LABEL: Record<string, string> = {
  esp32: 'ESP32 DevKit C',
  dht22: 'DHT22',
  potentiometer: 'Potensiometer Tanah',
  relay: 'Relay 2-Channel',
  lcd: 'LCD 1602 I2C',
};

/**
 * Catat perubahan status komponen hardware ke activity log yang sama dengan
 * halaman Log Aktivitas.
 *
 * Tipe `sensor_error` dipakai apa adanya karena sudah ada di kontrak
 * ActivityType, jadi tidak ada tipe baru dan tidak ada perubahan pada payload
 * Socket.IO.
 *
 * CATATAN Kepercayaan: payload ini datang dari client, jadi frontend sedang
 * menyatakan sendiri bahwa hardware-nya rusak. Itu wajar untuk halaman
 * diagnostik, tapi berarti user terautentikasi bisa menyisipkan baris
 * `sensor_error` dengan isi bebas. Postalur ini selalu mencatat `actor`
 * sehingga jejaknya bisa ditelusuri.
 */
logsRouter.post(
  '/activity',
  requireAuth,
  validateBody(hardwareStatusChangeSchema),
  async (req, res) => {
    const { component, from, to, reason } = req.body as {
      component: 'esp32' | 'dht22' | 'potentiometer' | 'relay' | 'lcd';
      from: 'normal' | 'warning' | 'error';
      to: 'normal' | 'warning' | 'error';
      reason: string;
    };

    const actor = getActor(req);
    const label = HARDWARE_LABEL[component] ?? component;
    const message = `${label}: ${from.toUpperCase()} → ${to.toUpperCase()} — ${reason}`;

    await db.insertActivity({
      time: new Date(),
      type: 'sensor_error',
      actor,
      message,
      meta: { source: 'hardware', component, from, to, reason },
    });

    log.warn(`${actor}: ${message}`);

    res.json({ ok: true, component, from, to, message });
  },
);

logsRouter.get('/alerts', requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? '50'), 200);
  const alerts = await db.listAlerts(limit);
  res.json({ alerts, limit });
});