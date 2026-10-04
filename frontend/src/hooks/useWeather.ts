import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { WeatherResult } from '@/types';

/**
 * Cuaca real-time untuk greenhouse (F3.2).
 *
 * Dua keputusan yang perlu dijelaskan:
 *
 * 1. Geolokasi browser TIDAK diminta otomatis. Browser memunculkan prompt izin
 *    saat halaman dimuat, dan itu terasa mengganggu untuk dashboard yang
 *    majority isinya data internal. Koordinat hanya diambil setelah pengguna
 *    mengaktifkannya lewat halaman Pengaturan, lalu disimpan di localStorage.
 *    Tanpa koordinat, backend memakai GREENHOUSE_LAT/GREENHOUSE_LON, jadi
 *    weather tetap berfungsi untuk instalasi dengan lokasi tetap.
 *
 * 2. Polling 15 menit, bukan beberapa detik. Backend sudah melakukan cache 10
 *    menit; poll lebih cepat dari itu hanya mengulang data yang sama dan
 *    membuang kuota API gratis OpenWeatherMap.
 */

const COORDS_KEY = 'greenhouse.coords';
const REFRESH_MS = 15 * 60 * 1000;

export type Coords = { lat: number; lon: number };

export function readStoredCoords(): Coords | null {
  try {
    const raw = localStorage.getItem(COORDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Coords>;
    if (
      typeof parsed.lat === 'number' &&
      typeof parsed.lon === 'number' &&
      Number.isFinite(parsed.lat) &&
      Number.isFinite(parsed.lon)
    ) {
      return { lat: parsed.lat, lon: parsed.lon };
    }
  } catch {
    /* storage tidak tersedia atau isinya rusak - abaikan */
  }
  return null;
}

export function storeCoords(coords: Coords): void {
  try {
    localStorage.setItem(COORDS_KEY, JSON.stringify(coords));
  } catch {
    /* mode privat: cuaca tetap jalan dengan koordinat tetap dari backend */
  }
}

export function clearStoredCoords(): void {
  try {
    localStorage.removeItem(COORDS_KEY);
  } catch {
    /* abaikan */
  }
}

/**
 * Minta izin geolokasi secara eksplisit.
 *
 * Sengaja dipanggil dari tombol, bukan dari effect, supaya prompt izin hanya
 * muncul setelah pengguna benar-benar meminta lokasi.
 */
export function requestBrowserCoords(timeoutMs = 10_000): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Browser Anda tidak mendukung geolokasi.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: Number(position.coords.latitude.toFixed(4)),
          lon: Number(position.coords.longitude.toFixed(4)),
        };
        storeCoords(coords);
        resolve(coords);
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Izin lokasi ditolak. Cuaca akan memakai lokasi tetap dari backend.'
            : error.code === error.TIMEOUT
              ? 'Permintaan lokasi terlalu lama dijawab.'
              : 'Lokasi tidak dapat ditentukan.';
        reject(new Error(message));
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60 * 1000 },
    );
  });
}

export type WeatherState = {
  result: WeatherResult | null;
  loading: boolean;
  /** Koordinat yang sedang dipakai, untuk ditampilkan di Pengaturan. */
  coords: Coords | null;
  refresh: () => void;
};

export function useWeather(): WeatherState {
  const [result, setResult] = useState<WeatherResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [coords, setCoords] = useState<Coords | null>(() => readStoredCoords());
  const [nonce, setNonce] = useState(0);

  // Disimpan di ref agar effect tidak dibuat ulang setiap kali state berubah.
  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const response = await api.weather(coordsRef.current ?? undefined);
        if (cancelled) return;
        setResult(response);
      } catch {
        // Kegagalan jaringan tidak boleh jadi error yang terlihat: cuaca adalah
        // informasi tambahan, jadi dibiarkan null dan coba lagi di poll berikutnya.
        if (!cancelled) setResult(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    timer = setInterval(() => void load(), REFRESH_MS);

    /** Segarkan saat tab kembali aktif: dashboard sering ditinggalkan di latar. */
    function onFocus() {
      void load();
    }
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [nonce]);

  /** Dipanggil setelah koordinat baru disimpan, supaya segera tampil. */
  const refresh = useCallback(() => {
    setCoords(readStoredCoords());
    setNonce((n) => n + 1);
  }, []);

  return { result, loading, coords, refresh };
}
