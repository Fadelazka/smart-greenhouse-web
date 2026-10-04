import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodType } from 'zod';

/** Validasi body dengan Zod, pesan error Bahasa Indonesia. */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: formatZod(result.error) });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({ error: formatZod(result.error) });
      return;
    }
    // Express 5 req.query read-only, jadi simpan di res.locals
    res.locals.query = result.data;
    next();
  };
}

export function getQuery<T>(res: Response): T {
  return res.locals.query as T;
}

function formatZod(error: ZodError): string {
  const first = error.issues[0];
  if (!first) return 'Data tidak valid.';
  const field = first.path.join('.');
  return field ? `${field}: ${first.message}` : first.message;
}