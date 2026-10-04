import http from 'node:http';
import net from 'node:net';
import { WebSocketServer, createWebSocketStream } from 'ws';
// Aedes v1 menghapus default export. Selain itu, instance harus dibuat lewat
// `Aedes.createBroker()` yang async karena persistence diinisialisasi di
// `listen()`. Memakai `new Aedes()` langsung membuat broker hidup tapi tidak
// pernah mengirim CONNACK, sehingga klien hanya melihat "connack timeout".
import { Aedes, type Client } from 'aedes';
import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('mqtt');

/**
 * Broker MQTT (Aedes) - zero install, cukup `npm i`.
 *
 * Dua mode:
 * 1. Embedded  - dijalankan di dalam proses backend (MQTT_BROKER_ENABLED=true)
 * 2. Standalone - dijalankan sendiri lewat `npm run dev:broker`
 *
 * Mode standalone dipakai saat development supaya:
 * - broker start lebih dulu, baru backend & simulator
 * - broker tidak ikut restart tiap kali backend di-refresh
 * - ESP32 dan MQTT Explorer bisa konek tanpa backend hidup
 *
 * Untuk production, ganti ke Mosquitto / HiveMQ Cloud / EMQX Cloud
 * dengan mengubah env - kode ini tidak perlu disentuh.
 */

let broker: Aedes | null = null;
let tcpServer: net.Server | null = null;
let wsServer: WebSocketServer | null = null;

/** Dipanggil sekali, sebelum server TCP/WebSocket di-bind. */
export async function createBroker(): Promise<Aedes> {
  if (broker) return broker;

  broker = await Aedes.createBroker({ id: 'greenhouse-broker' });

  broker.on('client', (client: Client) => {
    log.info(`client masuk: ${client.id}`);
  });

  broker.on('clientReady', (client: Client) => {
    log.debug(`client siap: ${client.id}`);
  });

  broker.on('clientDisconnect', (client: Client) => {
    log.info(`client keluar: ${client.id}`);
  });

  broker.on('connectionError', (client: Client | null, error: Error) => {
    log.error(`koneksi client ${client?.id ?? 'tidak diketahui'} gagal: ${error.message}`);
  });

  return broker;
}

export function getBroker(): Aedes {
  if (!broker) throw new Error('Broker belum dibuat - panggil createBroker() dulu');
  return broker;
}

/** Port 1883 - MQTT TCP, dipakai ESP32 dan simulator. */
async function attachTcp(instance: Aedes): Promise<net.Server> {
  // Aedes.handle() membaca raw byte dari stream, jadi socket TCP bisa
  // diteruskan apa adanya (createWebSocketStream hanya untuk jalur WebSocket).
  tcpServer = net.createServer(instance.handle);

  tcpServer.on('connection', (socket) => {
    socket.on('error', (error) => {
      log.debug(`tcp socket error: ${error.message}`);
      socket.destroy();
    });
  });

  tcpServer.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      log.error(`port ${env.MQTT_PORT} sudah dipakai. Hentikan proses lain atau ubah MQTT_PORT di .env`);
      process.exit(1);
    }
    log.error('mqtt tcp error', error.message);
  });

  await new Promise<void>((resolve, reject) => {
    tcpServer!.once('error', reject);
    tcpServer!.listen(env.MQTT_PORT, () => {
      tcpServer!.removeListener('error', reject);
      log.info(`MQTT TCP siap di mqtt://localhost:${env.MQTT_PORT}`);
      resolve();
    });
  });

  return tcpServer;
}

/** MQTT over WebSocket di /mqtt, untuk debugging dari browser (MQTT Explorer). */
function attachWebSocket(instance: Aedes, server: http.Server): WebSocketServer {
  wsServer = new WebSocketServer({ server, path: '/mqtt' });

  wsServer.on('connection', (socket, request) => {
    log.debug('mqtt websocket client terhubung');
    instance.handle(createWebSocketStream(socket), request);
  });

  return wsServer;
}

/** Dipanggil backend saat MQTT_BROKER_ENABLED=true. */
export async function startMqttBroker(httpServer: http.Server): Promise<void> {
  if (!env.MQTT_BROKER_ENABLED) {
    log.warn('broker embedded dinonaktifkan (MQTT_BROKER_ENABLED=false)');
    log.warn('backend akan konek ke broker eksternal - pastikan broker standalone sudah jalan');
    return;
  }

  const instance = await createBroker();
  await attachTcp(instance);
  attachWebSocket(instance, httpServer);
}

/** Dipanggil entry point standalone, mengabaikan flag MQTT_BROKER_ENABLED. */
export async function startStandaloneBroker(httpServer: http.Server): Promise<Aedes> {
  const instance = await createBroker();
  await attachTcp(instance);
  attachWebSocket(instance, httpServer);
  return instance;
}

export async function stopMqttBroker(): Promise<void> {
  tcpServer?.close();
  wsServer?.close();

  const instance = broker;
  broker = null;
  tcpServer = null;
  wsServer = null;

  if (instance) {
    await new Promise<void>((resolve) => instance.close(() => resolve()));
  }
}