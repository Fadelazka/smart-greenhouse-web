import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sendTelegramTest, telegramStatus } from '../services/telegram.service.js';

export const notificationRouter = Router();

/**
 * Status dan uji coba notifikasi Telegram (F3.4).
 *
 * Hanya admin yang boleh mengirim pesan uji, karena setiap percobaan memakai
 * kuota pesan bot. Membaca status boleh semua user yang sudah login.
 *
 * `requireRole` sudah memeriksa `req.auth` sendiri dan membalas 401 kalau
 * token tidak ada, jadi tidak perlu dirangkai dengan `requireAuth`.
 */
notificationRouter.get('/telegram', requireAuth, (_req, res) => {
  res.json(telegramStatus());
});

notificationRouter.post('/telegram/test', requireRole('admin'), async (_req, res) => {
  // Selalu 200: ini hasil uji koneksi, bukan kegagalan request. "Belum
  // terkonfigurasi" adalah jawaban yang valid, dan memakainya sebagai kode
  // HTTP hanya menambah pekerjaan frontend tanpa informasi baru.
  res.json(await sendTelegramTest());
});
