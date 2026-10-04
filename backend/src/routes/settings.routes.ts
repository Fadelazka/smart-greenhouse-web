import { Router } from 'express';
import {
  calibrationUpdateSchema,
  thresholdsUpdateSchema,
  type ConfigInput,
} from '../config/schemas.js';
import { DEFAULT_THRESHOLDS } from '../types/mqtt.js';
import { getActor, requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { publishConfigToDevice } from '../mqtt/handlers.js';
import { getCalibration, getThresholds } from '../services/alert.service.js';
import { broadcast } from '../realtime/socket.js';
import { db } from '../db/client.js';
import { SOCKET_EVENTS, type Calibration, type Thresholds } from '../types/mqtt.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('settings');

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

settingsRouter.get('/', async (_req, res) => {
  const [thresholds, calibration] = await Promise.all([getThresholds(), getCalibration()]);
  res.json({ thresholds, calibration });
});

settingsRouter.put('/thresholds', validateBody(thresholdsUpdateSchema), async (req, res) => {
  const { thresholds } = req.body as { thresholds: Thresholds };
  const actor = getActor(req);

  await db.setSetting('thresholds', thresholds);

  const calibration = await getCalibration();
  publishConfigToDevice(thresholds, calibration);

  await db.insertActivity({
    time: new Date(),
    type: 'threshold_change',
    actor,
    message: `Threshold diperbarui (suhu ${thresholds.suhu.min}–${thresholds.suhu.max}°C)`,
    meta: { thresholds },
  });

  broadcast(SOCKET_EVENTS.CONFIG, { thresholds, calibration });
  log.info(`${actor}: threshold diperbarui`);

  res.json({ ok: true, thresholds, message: 'Threshold berhasil disimpan.' });
});

/** Kalibrasi hanya admin. */
settingsRouter.put(
  '/calibration',
  requireRole('admin'),
  validateBody(calibrationUpdateSchema),
  async (req, res) => {
    const { calibration } = req.body as { calibration: Calibration };
    const actor = getActor(req);

    await db.setSetting('calibration', calibration);

    const thresholds = await getThresholds();
    publishConfigToDevice(thresholds, calibration);

    await db.insertActivity({
      time: new Date(),
      type: 'calibration_change',
      actor,
      message: `Kalibrasi diubah (suhu ${calibration.suhu >= 0 ? '+' : ''}${calibration.suhu}°C)`,
      meta: { calibration },
    });

    broadcast(SOCKET_EVENTS.CONFIG, { thresholds, calibration });

    res.json({ ok: true, calibration, message: 'Kalibrasi berhasil disimpan.' });
  },
);

settingsRouter.get('/users', requireRole('admin'), async (_req, res) => {
  const users = await db.listUsers();
  res.json({
    users,
    demoAccounts: [
      { email: 'admin@greenhouse.local', password: 'admin123', role: 'admin' },
      { email: 'operator@greenhouse.local', password: 'operator123', role: 'operator' },
    ],
    defaults: DEFAULT_THRESHOLDS as unknown as ConfigInput['thresholds'],
  });
});