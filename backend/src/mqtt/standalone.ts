/**
 * Entry point broker MQTT standalone.
 *
 * Jalankan broker DULUAN sebelum backend & simulator:
 *   npm run dev:broker
 *
 * Lalu jalankan sisanya:
 *   npm run dev
 *
 * Backend dikonfigurasi dengan MQTT_BROKER_ENABLED=false supaya backend
 * tidak merebut port 1883 saat broker standalone sudah berjalan.
 */

import http from 'node:http';
import { env } from '../config/env.js';
import { getBroker, startStandaloneBroker, stopMqttBroker } from './broker.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('broker');

const httpServer = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      service: 'greenhouse-mqtt-broker',
      status: 'running',
      mqttPort: env.MQTT_PORT,
      mqttWsPath: '/mqtt',
      clients: getBroker().connectedClients,
    }),
  );
});

async function main(): Promise<void> {
  await startStandaloneBroker(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(env.MQTT_WS_PORT, () => {
      log.info(`HTTP status broker di http://localhost:${env.MQTT_WS_PORT}`);
      log.info(`MQTT over WebSocket siap di ws://localhost:${env.MQTT_WS_PORT}/mqtt`);
      resolve();
    });
  });

  log.info('broker MQTT berjalan mandiri (mode development)');
}

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  log.info(`${signal} diterima, menutup broker...`);
  await stopMqttBroker();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

main().catch((error: unknown) => {
  log.error('broker gagal start', error instanceof Error ? error.message : String(error));
  process.exit(1);
});