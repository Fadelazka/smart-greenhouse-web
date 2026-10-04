import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSun,
  Moon,
  Snowflake,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { useWeather } from '@/hooks/useWeather';
import type { WeatherSnapshot } from '@/types';
import { formatTime } from '@/lib/utils';

/**
 * Overlay cuaca untuk header aplikasi (F3.2).
 *
 * `variant="header"` diam-diam tidak merender apa pun kalau cuaca belum
 * terkonfigurasi. Widget yang menampilkan "belum diisi API key" di setiap
 * halaman akan terasa seperti eradicate error, bukan informasi. Penjelasan
 * lengkapnya ada di Pengaturan, yang memakai `variant="settings"`.
 */

type Props = {
  variant?: 'header' | 'settings';
};

/**
 * Kode ikon OpenWeatherMap ke ikon lucide.
 *
 * Dipetakan manual, bukan soaked lewat nama file SVG, supaya tidak ada aset
 * tambahan yang perlu diunduh dan tetap mengikuti warna design system.
 */
function pickIcon(code: string): LucideIcon {
  // Kode OpenWeather selalu dua digit lalu d atau n untuk siang/malam.
  const night = code.endsWith('n');

  switch (code.slice(0, 2)) {
    case '01':
      return night ? Moon : Sun;
    case '02':
      return night ? CloudMoon : CloudSun;
    case '03':
    case '04':
      return Cloud;
    case '09':
    case '10':
      return CloudRain;
    case '11':
      return CloudLightning;
    case '13':
      return Snowflake;
    case '50':
      return CloudFog;
    default:
      return Cloud;
  }
}

/**
 * Ringkasan singkat untuk operasional greenhouse.
 *
 * Cuaca di luar tidak sama dengan kondisi di dalam rumah kaca, jadi yang
 * ditampilkan bukan cuma angka, tapi implikasinya: kelembapan tinggi berarti
 * risiko kondensasi dan jamur, angin lemah berarti panas menumpuk.
 */
function outdoorNote(snapshot: WeatherSnapshot): string {
  const parts: string[] = [];

  if (snapshot.humidity >= 80) parts.push('lembab, waspada kondensasi');
  else if (snapshot.humidity <= 45) parts.push('kering, tambah ventilasi');

  if (snapshot.windSpeed >= 8) parts.push('angin kuat, ventilasi perlu diperiksa');
  else if (snapshot.windSpeed <= 1.5) parts.push('angin minim, panas menumpuk');

  if (snapshot.clouds <= 20) parts.push('cerah, intensitas cahaya tinggi');

  return parts.length > 0 ? parts.join('; ') : 'kondisi netral';
}

export function WeatherOverlay({ variant = 'header' }: Props) {
  const { result, loading } = useWeather();

  if (loading && !result) {
    return variant === 'header' ? null : (
      <div className="skeleton h-[68px] w-full" />
    );
  }

  if (!result) {
    return variant === 'header' ? null : (
      <p className="text-[13px] text-[color:var(--color-fg-subtle)]">
        Data cuaca tidak dapat dimuat. Backend mungkin sedang tidak berjalan.
      </p>
    );
  }

  if (!result.enabled) {
    return variant === 'header' ? null : (
      <div
        className="rounded-[10px] border border-dashed border-[color:var(--color-border-strong)] px-4 py-3"
        role="status"
      >
        <p className="text-[13px] text-[color:var(--color-fg-muted)]">{result.hint}</p>
      </div>
    );
  }

  const { data, stale } = result;
  const Icon = pickIcon(data.icon);

  if (variant === 'settings') {
    return (
      <div>
        <div className="flex items-center gap-4">
          <Icon className="size-10 shrink-0 text-[color:var(--color-sun)]" aria-hidden="true" />
          <div>
            <p className="value-tabular font-[family-name:var(--font-display)] text-[26px] leading-none font-semibold">
              {Math.round(data.temp)}
              <span className="ml-1 text-[15px] font-normal text-[color:var(--color-fg-muted)]">
                C
              </span>
            </p>
            <p className="mt-1 text-[13px] text-[color:var(--color-fg-muted)]">
              {data.description} di {data.place}
            </p>
          </div>
          {stale && (
            <span className="rounded-full bg-[color:var(--color-warning)]/15 px-2 py-0.5 text-[11px] text-[color:var(--color-warning)]">
              data lama
            </span>
          )}
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] sm:grid-cols-4">
          <div>
            <dt className="text-[color:var(--color-fg-subtle)]">Terasa</dt>
            <dd className="value-tabular">{Math.round(data.feelsLike)} C</dd>
          </div>
          <div>
            <dt className="text-[color:var(--color-fg-subtle)]">Kelembapan</dt>
            <dd className="value-tabular">{Math.round(data.humidity)}%</dd>
          </div>
          <div>
            <dt className="text-[color:var(--color-fg-subtle)]">Angin</dt>
            <dd className="value-tabular">{data.windSpeed.toFixed(1)} m/s</dd>
          </div>
          <div>
            <dt className="text-[color:var(--color-fg-subtle)]">Awan</dt>
            <dd className="value-tabular">{Math.round(data.clouds)}%</dd>
          </div>
        </dl>

        <p className="mt-3 text-[12px] text-[color:var(--color-fg-subtle)]">
          {outdoorNote(data)} · Pengamatan {formatTime(data.observedAt)}
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2.5 rounded-[10px] border border-[color:var(--color-border)] bg-[color:var(--color-bg-deep)]/60 px-3 py-1.5"
      title={`${data.description} di ${data.place}. Terasa ${Math.round(data.feelsLike)} C, kelembapan ${Math.round(data.humidity)}%, angin ${data.windSpeed.toFixed(1)} m/s.${stale ? ' Data terakhir yang tersimpan.' : ''}`}
    >
      <Icon className="size-5 shrink-0 text-[color:var(--color-sun)]" aria-hidden="true" />
      <span className="value-tabular text-[15px] font-medium leading-none">
        {Math.round(data.temp)}
        <span className="text-[11px] font-normal text-[color:var(--color-fg-muted)]"> C</span>
      </span>
      <span className="hidden max-w-[9rem] truncate text-[12px] text-[color:var(--color-fg-muted)] sm:block">
        {data.description}
      </span>
      {stale && (
        <span
          className="size-1.5 rounded-full bg-[color:var(--color-warning)]"
          aria-label="Data cuaca terakhir yang tersimpan"
        />
      )}
    </div>
  );
}
