import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import type { PublicUser, UserRole } from '../types/mqtt.js';

export type AuthContext = {
  user: PublicUser;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function signToken(user: PublicUser): string {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions,
  );
}

export function verifyToken(token: string): PublicUser | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    if (!payload.sub || typeof payload.email !== 'string') return null;
    return {
      id: payload.sub,
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : 'Pengguna',
      role: payload.role === 'admin' ? 'admin' : 'operator',
    };
  } catch {
    return null;
  }
}

/** Wajib JWT valid. Endpoint kontrol aktuator memakai ini. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ error: 'Token tidak ditemukan. Silakan login.' });
    return;
  }

  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: 'Token tidak valid atau sudah kedaluwarsa.' });
    return;
  }

  req.auth = { user };
  next();
}

/** Wajib role admin (kalibrasi, restart device). */
export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'Belum terautentikasi.' });
      return;
    }
    if (auth.user.role !== role) {
      res.status(403).json({ error: `Akses khusus ${role}. Akun kamu terdaftar sebagai ${auth.user.role}.` });
      return;
    }
    next();
  };
}

export function getActor(req: Request): string {
  return req.auth?.user.email ?? 'anonymous';
}