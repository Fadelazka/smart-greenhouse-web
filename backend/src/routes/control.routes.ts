import { Router } from 'express';
import { actuatorControlSchema, modeSchema } from '../config/schemas.js';
import { getActor, requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { publishCmdToDevice } from '../mqtt/handlers.js';
import { broadcast } from '../realtime/socket.js';
import { db } from '../db/client.js';
import { SOCKET_EVENTS } from '../types/mqtt.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('control');

export const controlRouter = Router();

// Semua route kontrol WAJIB lewat requireAuth. Jangan pernah dihapus.
controlRouter.use(requireAuth);

const ACTUATOR_LABEL = { pump: 'Pompa air', fan: 'Kipas', light: 'Lampu grow' } as const;
const STATE_LABEL = { on: 'dinyalakan', off: 'dimatikan', auto: 'dikembalikan ke mode auto' } as const;

controlRouter.post(
  '/actuator',
  validateBody(actuatorControlSchema),
  async (req, res) => {
    const { actuator, state, overrideSeconds } = req.body as {
      actuator: 'pump' | 'fan' | 'light';
      state: 'on' | 'off' | 'auto';
      overrideSeconds: number;
    };

    const actor = getActor(req);
    const overrideUntil = state === 'auto' ? null : Date.now() + overrideSeconds * 1000;

    const payload: Record<string, unknown> = {
      ts: new Date().toISOString(),
      [actuator]: state,
      mode: state === 'auto' ? 'auto' : 'manual',
      overrideUntil,
      issuedBy: actor,
    };

    publishCmdToDevice(payload);

    const message = `${ACTUATOR_LABEL[actuator]} ${STATE_LABEL[state]}${
      state === 'auto' ? '' : ` (manual ${overrideSeconds} detik)`
    }`;

    await db.insertActivity({
      time: new Date(),
      type: state === 'on' ? 'actuator_on' : state === 'off' ? 'actuator_off' : 'mode_change',
      actor,
      message,
      meta: { actuator, state, overrideSeconds },
    });

    broadcast(SOCKET_EVENTS.CONTROL, { actuator, state, overrideUntil, by: actor });
    log.info(`${actor}: ${message}`);

    res.json({ ok: true, actuator, state, overrideUntil, message });
  },
);

controlRouter.post('/mode', validateBody(modeSchema), async (req, res) => {
  const { mode } = req.body as { mode: 'auto' | 'manual' };
  const actor = getActor(req);

  publishCmdToDevice({
    ts: new Date().toISOString(),
    mode,
    overrideUntil: null,
    issuedBy: actor,
  });

  const message = `Mode diubah ke ${mode === 'auto' ? 'AUTO' : 'MANUAL'}`;
  await db.insertActivity({ time: new Date(), type: 'mode_change', actor, message, meta: { mode } });
  broadcast(SOCKET_EVENTS.CONTROL, { mode, by: actor });

  res.json({ ok: true, mode, message });
});

/** Restart hanya untuk admin. */
controlRouter.post('/restart', requireRole('admin'), async (req, res) => {
  const actor = getActor(req);

  publishCmdToDevice({
    ts: new Date().toISOString(),
    restart: true,
    issuedBy: actor,
  });

  const message = 'Perintah restart dikirim ke perangkat';
  await db.insertActivity({ time: new Date(), type: 'restart', actor, message });
  broadcast(SOCKET_EVENTS.CONTROL, { restart: true, by: actor });
  log.warn(`${actor}: restart perangkat`);

  res.json({ ok: true, message });
});