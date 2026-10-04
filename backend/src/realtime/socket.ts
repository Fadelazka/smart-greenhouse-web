import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('socket');

let io: Server | null = null;

export function setupSocket(httpServer: import('node:http').Server): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigins,
      methods: ['GET', 'POST'],
    },
    // Greenhouse sering di WiFi rumah, jadi timeout diperlonggar sedikit.
    pingInterval: 20_000,
    pingTimeout: 25_000,
  });

  io.on('connection', (socket) => {
    log.debug(`client socket terhubung: ${socket.id}`);

    socket.on('disconnect', (reason) => {
      log.debug(`client socket terputus: ${socket.id} (${reason})`);
    });
  });

  return io;
}

/** Broadcast event ke semua client frontend. Aman dipanggil sebelum setupSocket. */
export function broadcast(event: string, payload: unknown): void {
  io?.emit(event, payload);
}

export function getSocketServer(): Server | null {
  return io;
}

export async function closeSocket(): Promise<void> {
  await io?.close();
}