import { Router } from 'express';
import { historyQuerySchema, type HistoryQuery } from '../config/schemas.js';
import { db } from '../db/client.js';
import { getThresholds } from '../services/alert.service.js';
import { DEVICE_ID } from '../types/mqtt.js';
import { getQuery, validateQuery } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';

export const sensorRouter = Router();

/*
 * Seluruh data greenhouse hanya untuk pengguna yang sudah login.
 *
 * Router ini dulu dipasang tanpa autentikasi, sehingga `/latest` dan
 * `export.csv` bisa dibaca siapa saja tanpa token. Esp32 dan simulator
 * tidak terdampak karena keduanya menulis lewat MQTT, bukan REST, dan
 * frontend sudah mengirim token di setiap request.
 */
sensorRouter.use(requireAuth);

const RANGE_MS: Record<HistoryQuery['range'], number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

/** Bucket default sesuai range supaya grafik tidak pernah melebihi ~300 titik. */
function defaultBucket(range: HistoryQuery['range']): number {
  switch (range) {
    case '1h':
      return 12;
    case '6h':
      return 60;
    case '24h':
      return 240;
    case '7d':
      return 1800;
  }
}

/**
 * Jendela waktu untuk satu permintaan riwayat.
 *
 * `offset` menggeser jendela ke belakang sebanyak N kali panjang range, sehingga
 * `offset=1` menghasilkan periode sepanjang `range` yang tepat berada di depan
 * periode `offset=0`. Ini yang dipakai fitur multi-sensor compare supaya dua
 * periode dengan panjang sama bisa diletakkan di satu sumbu waktu relatif.
 */
function resolveWindow(range: HistoryQuery['range'], offset: number): { from: Date; to: Date } {
  const span = RANGE_MS[range];
  const to = new Date(Date.now() - offset * span);
  return { from: new Date(to.getTime() - span), to };
}

sensorRouter.get(
  '/history',
  validateQuery(historyQuerySchema),
  async (req, res) => {
    const { range, offset } = getQuery<HistoryQuery>(res);
    const bucketParam = req.query.bucket;
    const bucket = bucketParam ? Number(bucketParam) : defaultBucket(range);

    const { from, to } = resolveWindow(range, offset);

    const [points, thresholds] = await Promise.all([
      db.queryReadings(DEVICE_ID, from, to, bucket),
      getThresholds(),
    ]);

    res.json({
      range,
      offset,
      bucketSeconds: bucket,
      from: from.toISOString(),
      to: to.toISOString(),
      thresholds,
      points,
    });
  },
);

sensorRouter.get('/latest', async (_req, res) => {
  const latest = await db.latestReading(DEVICE_ID);
  if (!latest) {
    res.status(404).json({ error: 'Belum ada data telemetry.' });
    return;
  }
  res.json(latest);
});

/** CSV export untuk laporan. */
sensorRouter.get('/export.csv', async (req, res) => {
  const range = (req.query.range as HistoryQuery['range']) ?? '24h';
  const to = new Date();
  const from = new Date(to.getTime() - (RANGE_MS[range] ?? RANGE_MS['24h']));

  const points = await db.queryReadings(DEVICE_ID, from, to, 60);

  const header = 'timestamp,suhu_c,hum_udara_pct,hum_tanah_pct,samples';
  const lines = points.map(
    (p) =>
      `${p.time.toISOString()},${p.suhu.toFixed(2)},${p.humUdara.toFixed(2)},${p.humTanah.toFixed(2)},${p.samples}`,
  );

  const csv = [header, ...lines].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sensor-${range}-${Date.now()}.csv"`);
  res.send(csv);
});