import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('weather');

/**
 * Cuaca real-time untuk greenhouse (F3.2).
 *
 * Request diproxy backend, bukan dipanggil dari browser, dengan tiga alasan:
 *
 * 1. Kunci API tidak pernah masuk bundle frontend. Kalau memakai prefix VITE_,
 *    kunci terlihat oleh siapa pun yang membuka DevTools dan bisa dipakai habis
 *    kuotanya.
 * 2. Cache 10 menit di server. Dashboard, Riwayat, dan Log bisa meminta cuaca
 *    bersamaan. Tanpa cache, satu refresh dashboard menghabiskan tiga panggilan
 *    API untuk data yang identik.
 * 3. Batas kuota gratis OpenWeatherMap adalah 60 panggilan per menit. Dengan
 *    cache, pemakaian nyata menjadi satu panggilan per 10 menit per lokasi,
 *    bukan satu panggilan per render.
 *
 * Tanpa OPENWEATHER_API_KEY, service tidak melempar error dan tidak memanggil
 * API. Ia melaporkan status belum terkonfigurasi supaya frontend bisa
 * menampilkan petunjuk, bukan pesan error.
 */

/** Dipasang 10 menit: cukup untuk sebuah grafik, dan jauh di bawah batas kuota. */
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Koordinat dibulatkan ke 2 desimal, sekitar 1,1 km, sebelum jadi kunci cache.
 *
 * Greenhouse tidak berada tepat di titik bulat dan geolokasi browser bisa
 * bergeser puluhan meter antar permintaan. Tanpa pembulatan, tiap permintaan
 * menjadi entri cache baru sehingga cache tidak pernah benar-benar kena.
 */
function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

export type WeatherSnapshot = {
  /** Suhu udara saat ini, derajat Celsius. */
  temp: number;
  /** Suhu yang dirasakan tubuh, sudah disesuaikan angin dan kelembapan. */
  feelsLike: number;
  /** Kelembapan relatif, persen. */
  humidity: number;
  /** Deskripsi kondisi dari OpenWeatherMap, huruf pertama sudah dinaikkan. */
  description: string;
  /** Kode ikon OpenWeatherMap, frontend memetakannya ke ikon sendiri. */
  icon: string;
  /** Kecepatan angin, meter per detik. */
  windSpeed: number;
  /** Persentase tutupan awan. */
  clouds: number;
  /** Waktu pengamatan di lokasi tersebut, ISO. */
  observedAt: string;
  /** Nama lokasi, dari API atau dari label yang dikonfigurasi. */
  place: string;
};

export type WeatherResult =
  | { enabled: true; stale: boolean; data: WeatherSnapshot }
  | {
      enabled: false;
      reason: 'no-key' | 'no-coords' | 'bad-key' | 'upstream-error';
      hint: string;
    };

type CacheEntry = { at: number; data: WeatherSnapshot };

const cache = new Map<string, CacheEntry>();

/**
 * Buang entry yang sudah basi setiap kali cache diisi baru, supaya entri
 * tidak tumbuh tanpa batas kalau pengguna sering berpindah lokasi.
 */
function pruneCache(now: number): void {
  for (const [key, entry] of cache) {
    if (now - entry.at > CACHE_TTL_MS) cache.delete(key);
  }
}

export function isWeatherEnabled(): boolean {
  return env.hasWeatherKey;
}

/** Koordinat dari env, dipakai browser sebagai fallback saat geolokasi ditolak. */
export function configuredLocation(): { lat: number; lon: number; place: string } | null {
  if (!env.configuredCoords) return null;
  return {
    lat: env.configuredCoords.lat,
    lon: env.configuredCoords.lon,
    place: env.GREENHOUSE_PLACE.trim(),
  };
}

/** Bagian balasan OpenWeatherMap yang benar-benar dipakai service ini. */
type OwmResponse = {
  main?: { temp?: number; feels_like?: number; humidity?: number };
  weather?: Array<{ description?: string; icon?: string }>;
  wind?: { speed?: number };
  clouds?: { all?: number };
  dt?: number;
  name?: string;
};

/** Naikkan huruf pertama tanpa menyentrakkan huruf besar lain. */
function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

class WeatherError extends Error {
  constructor(readonly reason: 'bad-key' | 'upstream-error') {
    super(reason);
    this.name = 'WeatherError';
  }
}

async function fetchSnapshot(lat: number, lon: number): Promise<OwmResponse> {
  const url = new URL('https://api.openweathermap.org/data/2.5/weather');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('units', 'metric');
  url.searchParams.set('lang', 'id');
  url.searchParams.set('appid', env.OPENWEATHER_API_KEY);

  // AbortController dengan timer manual, bukan AbortSignal.timeout, supaya
  // tetap bekerja di runtime Node 18 yang dipakai skripsi ini.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (response.status === 401) {
      throw new WeatherError('bad-key');
    }
    if (!response.ok) {
      throw new WeatherError('upstream-error');
    }

    return (await response.json()) as OwmResponse;
  } finally {
    clearTimeout(timer);
  }
}

const HINTS = {
  'no-key':
    'Cuaca belum aktif. Isi OPENWEATHER_API_KEY di backend/.env lalu jalankan ulang backend.',
  'no-coords':
    'Lokasi greenhouse belum ditentukan. Beri izin geolokasi di browser atau isi GREENHOUSE_LAT dan GREENHOUSE_LON di backend/.env.',
  'bad-key': 'OPENWEATHER_API_KEY ditolak OpenWeatherMap. Periksa kembali kuncinya.',
  'upstream-error':
    'OpenWeatherMap sedang tidak dapat dihubungi. Data cuaca terakhir dipakai bila masih tersimpan.',
} as const;

/**
 * Ambil cuaca untuk satu titik.
 *
 * Tidak pernah melempar error. Kegagalan upstream dikembalikan sebagai bagian
 * dari WeatherResult supaya pemanggil bisa membedakan "belum terkonfigurasi",
 * yang perlu petunjuk dari pengguna, dari "sementara gagal", yang cukup
 * diamkan sebentar lalu dicoba lagi.
 */
export async function getWeather(lat: number, lon: number): Promise<WeatherResult> {
  if (!env.hasWeatherKey) {
    return { enabled: false, reason: 'no-key', hint: HINTS['no-key'] };
  }

  const key = cacheKey(lat, lon);
  const now = Date.now();
  const cached = cache.get(key);

  if (cached && now - cached.at < CACHE_TTL_MS) {
    return { enabled: true, stale: false, data: cached.data };
  }

  try {
    const raw = await fetchSnapshot(lat, lon);
    const condition = raw.weather?.[0];

    if (typeof raw.main?.temp !== 'number') {
      // Balasan 200 tapi tanpa data cuaca, diperlakukan sebagai upstream error.
      throw new WeatherError('upstream-error');
    }

    const data: WeatherSnapshot = {
      temp: raw.main.temp,
      feelsLike: typeof raw.main.feels_like === 'number' ? raw.main.feels_like : raw.main.temp,
      humidity: typeof raw.main.humidity === 'number' ? raw.main.humidity : 0,
      description: titleCase(condition?.description ?? 'tidak diketahui'),
      icon: condition?.icon ?? '01d',
      windSpeed: typeof raw.wind?.speed === 'number' ? raw.wind.speed : 0,
      clouds: typeof raw.clouds?.all === 'number' ? raw.clouds.all : 0,
      observedAt: new Date((raw.dt ?? Math.floor(now / 1000)) * 1000).toISOString(),
      place: env.GREENHOUSE_PLACE.trim() || raw.name || 'lokasi greenhouse',
    };

    pruneCache(now);
    cache.set(key, { at: now, data });

    return { enabled: true, stale: false, data };
  } catch (error) {
    if (error instanceof WeatherError) {
      log.warn(`Cuaca gagal: ${error.reason}`);
      return { enabled: false, reason: error.reason, hint: HINTS[error.reason] };
    }

    log.warn('Request cuaca gagal', error instanceof Error ? error.message : error);

    // Jawaban terakhir yang masih relevan lebih baik daripada kosong total.
    if (cached) {
      return { enabled: true, stale: true, data: cached.data };
    }

    return { enabled: false, reason: 'upstream-error', hint: HINTS['upstream-error'] };
  }
}

/** Dipakai health check agar status fitur terlihat tanpa memanggil API. */
export function weatherStatus(): { configured: boolean; cachedLocations: number } {
  return { configured: env.hasWeatherKey, cachedLocations: cache.size };
}
