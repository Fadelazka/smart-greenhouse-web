import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { configuredLocation, getWeather, isWeatherEnabled } from '../services/weather.service.js';

export const weatherRouter = Router();

// Cuaca ikut aturan auth yang sama dengan sensor dan settings: tidak ada data
// greenhouse yang boleh terbuka untuk tamu.
weatherRouter.use(requireAuth);

/**
 * Koordinat bisa dikirim browser (hasil geolokasi) atau tidak sama sekali.
 * Kalau tidak dikirim, backend memakai GREENHOUSE_LAT/GREENHOUSE_LON. Rentang
 * dibatasi ke nilai yang mungkin dipakai browser sungguhan supaya parameter ini
 * tidak jadi alat mengarang query lain.
 */
const weatherQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
});

/**
 * Status konfigurasi, dipanggil tanpa koordinat.
 *
 * Dipisah dari endpoint data supaya frontend bisa membedakan "saya tidak punya
 * kunci" dari "OpenWeatherMap sedang down" tanpa menebak dari pesan error.
 */
weatherRouter.get('/status', (_req, res) => {
  const fallback = configuredLocation();

  res.json({
    enabled: isWeatherEnabled(),
    configuredLocation: fallback
      ? { lat: fallback.lat, lon: fallback.lon, place: fallback.place }
      : null,
  });
});

weatherRouter.get('/', async (req, res) => {
  const parsed = weatherQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Koordinat tidak valid.' });
    return;
  }

  const { lat, lon } = parsed.data;
  const fallback = configuredLocation();

  // Prioritas: koordinat dari browser, lalu koordinat yang dikonfigurasi.
  const point =
    typeof lat === 'number' && typeof lon === 'number'
      ? { lat, lon }
      : fallback
        ? { lat: fallback.lat, lon: fallback.lon }
        : null;

  if (!point) {
    res.json({
      enabled: false,
      reason: 'no-coords',
      hint: 'Lokasi greenhouse belum ditentukan. Beri izin geolokasi di browser atau isi GREENHOUSE_LAT dan GREENHOUSE_LON di backend/.env.',
    });
    return;
  }

  // `stale` sengaja diteruskan apa adanya supaya frontend bisa menandai data
  // lama, bukan apresentaçãoinya seolah-olah baru saja.
  res.json(await getWeather(point.lat, point.lon));
});
