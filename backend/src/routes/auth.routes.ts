import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { loginSchema } from '../config/schemas.js';
import { db } from '../db/client.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import type { PublicUser, UserRole } from '../types/mqtt.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('auth');

export const authRouter = Router();

/**
 * Login dev - menerima kredensial hardcoded.
 * Ini hanya untuk tahap awal: frontend belum butuh DB untuk masuk dashboard.
 * Seed user sungguhan (bcrypt + Supabase) disiapkan di src/db/seed.ts.
 */
const DEMO_USERS: Record<string, { password: string; user: PublicUser }> = {
  'admin@greenhouse.local': {
    password: 'admin123',
    user: { id: 'demo-admin', name: 'Pak Rudi (Admin)', email: 'admin@greenhouse.local', role: 'admin' },
  },
  'operator@greenhouse.local': {
    password: 'operator123',
    user: {
      id: 'demo-operator',
      name: 'Dimas (Operator)',
      email: 'operator@greenhouse.local',
      role: 'operator',
    },
  },
};

authRouter.post(
  '/login',
  validateBody(loginSchema),
  async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };

    // Coba database dulu (user sungguhan), lalu fallback ke user demo.
    const dbUser = await db.findUserByEmail(email);
    let user: PublicUser;

    if (dbUser) {
      const ok = await bcrypt.compare(password, dbUser.passwordHash);
      if (!ok) {
        await db.insertActivity({
          time: new Date(),
          type: 'login',
          actor: email,
          message: 'Percobaan login gagal: kata sandi salah',
        });
        res.status(401).json({ error: 'Email atau kata sandi salah.' });
        return;
      }
      user = {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role as UserRole,
      };
    } else {
      const demo = DEMO_USERS[email.toLowerCase()];
      if (!demo || demo.password !== password) {
        await db.insertActivity({
          time: new Date(),
          type: 'login',
          actor: email,
          message: 'Percobaan login gagal: email atau kata sandi salah',
        });
        res.status(401).json({ error: 'Email atau kata sandi salah.' });
        return;
      }
      user = demo.user;
    }

    await db.insertActivity({
      time: new Date(),
      type: 'login',
      actor: user.email,
      message: `${user.name} berhasil login`,
    });

    log.info(`login: ${user.email} (${user.role})`);

    res.json({ token: signToken(user), user });
  },
);

/**
 * Profil user dari token yang sedang dipakai.
 *
 * Endpoint ini dipakai frontend untuk memulihkan sesi setelah reload: token
 * disimpan di localStorage, jadi begitu halaman dimuat ulang kita perlu tahu
 * apakah token itu masih valid, nama siapa yang dipakai, dan role-nya apa
 * (role menentukan apakah tombol kalibrasi/restart tampil).
 *
 * Sebelumnya endpoint ini cuma menebak "ada header Bearer atau tidak" dan
 * selalu balas 200 - sehingga token sampah seperti "Bearer ngawur" ikut
 * dianggap sah. Sekarang token benar-benar diverifikasi, dan kalau DB tersedia
 * profil disegarkan dari sana agar nama/role terbaru yang dipakai.
 */
authRouter.get('/me', requireAuth, async (req, res) => {
  const authUser = req.auth!.user;

  // Akun demo tidak ada di DB, jadi hasil verifikasi token sudah yang benar.
  const dbUser = await db.findUserByEmail(authUser.email);
  if (!dbUser) {
    res.json({ user: authUser });
    return;
  }

  res.json({
    user: {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role as UserRole,
    } satisfies PublicUser,
  });
});