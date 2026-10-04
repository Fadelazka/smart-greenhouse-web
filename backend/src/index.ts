import http from 'node:http';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { env } from './config/env.js';
import { db } from './db/client.js';
import { startMqttBroker, stopMqttBroker } from './mqtt/broker.js';
import { connectMqttClient, disconnectMqttClient } from './mqtt/handlers.js';
import { closeSocket, setupSocket } from './realtime/socket.js';
import { authRouter } from './routes/auth.routes.js';
import { controlRouter } from './routes/control.routes.js';
import { logsRouter } from './routes/logs.routes.js';
import { sensorRouter } from './routes/sensor.routes.js';
import { settingsRouter } from './routes/settings.routes.js';
import { getThresholds } from './services/alert.service.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('server');

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      // Permitir request tanpa Origin (curl, Postman, health check).
      if (!origin) return callback(null, true);
      if (env.corsOrigins.includes(origin)) return callback(null, true);
      log.warn(`CORS ditolak untuk origin: ${origin}`);
      return callback(new Error('Origin tidak diizinkan oleh CORS'));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '256kb' }));

app.get('/api/health', async (_req, res) => {
  let readings = 0;
  try {
    readings = await db.countReadings();
  } catch (error) {
    log.error('health check gagal', error);
  }

  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    database: db.usingFallback ? 'in-memory' : 'postgresql',
    readings,
    thresholds: await getThresholds().catch(() => null),
    env: env.NODE_ENV,
  });
});

app.use('/api/auth', authRouter);
app.use('/api/sensors', sensorRouter);
app.use('/api/control', controlRouter);
app.use('/api/logs', logsRouter);
app.use('/api/settings', settingsRouter);

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Endpoint ${req.method} ${req.path} tidak ditemukan.` });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error('unhandled error', error.message);
  res.status(500).json({ error: 'Terjadi kesalahan di server.' });
});

const httpServer = http.createServer(app);

setupSocket(httpServer);
void startMqttBroker(httpServer);

httpServer.listen(env.PORT, () => {
  log.info(`HTTP + Socket.io siap di http://localhost:${env.PORT}`);
  connectMqttClient();
});

async function shutdown(signal: string): Promise<void> {
  log.info(`${signal} diterima, menutup dengan rapi...`);
  await closeSocket();
  disconnectMqttClient();
  await stopMqttBroker();
  await db.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));