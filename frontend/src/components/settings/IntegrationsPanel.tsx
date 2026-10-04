import { useCallback, useEffect, useState } from 'react';
import { CloudSun, MapPin, Send, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { clearStoredCoords, requestBrowserCoords } from '@/hooks/useWeather';
import { WeatherOverlay } from '@/components/weather/WeatherOverlay';
import type { TelegramStatus } from '@/types';
import { cn } from '@/lib/utils';

/**
 * Panel integrasi untuk halaman Pengaturan: cuaca real-time (F3.2) dan
 * notifikasi Telegram (F3.4).
 *
 * Kedua fitur memakai env vars opsional, jadi panel ini tidak menyembunyikan
 * dirinya saat backend belum dikonfigurasi. Justru sebaliknya: yang tampil
 * adalah status dan cara mengaktifkannya, supaya pengguna tidak bertanya
 * kenapa widget cuaca tidak muncul di header.
 */

const TELEGRAM_HINT: Record<NonNullable<TelegramStatus['reason']>, string> = {
  'no-token': 'Isi TELEGRAM_BOT_TOKEN di backend/.env dengan token dari @BotFather.',
  'no-chat-id':
    'Isi TELEGRAM_CHAT_ID di backend/.env. Chat harus sudah pernah mengirim pesan ke bot.',
  disabled: 'Notifikasi dimatikan lewat TELEGRAM_ENABLED=false di backend/.env.',
};

type Props = {
  /** Hanya admin yang boleh mengirim pesan uji dan mengubah konfigurasi. */
  isAdmin: boolean;
};

export function IntegrationsPanel({ isAdmin }: Props) {
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [usingBrowserLocation, setUsingBrowserLocation] = useState<boolean | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);

  const loadTelegram = useCallback(() => {
    void api
      .telegramStatus()
      .then(setTelegram)
      .catch(() => setTelegram(null));
  }, []);

  useEffect(() => {
    loadTelegram();

    try {
      setUsingBrowserLocation(localStorage.getItem('greenhouse.coords') !== null);
    } catch {
      setUsingBrowserLocation(false);
    }
  }, [loadTelegram]);

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await api.sendTelegramTest());
      loadTelegram();
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Gagal menghubungi backend.',
      });
    } finally {
      setTesting(false);
    }
  }

  async function enableLocation() {
    setLocating(true);
    setGeoMessage(null);
    try {
      const coords = await requestBrowserCoords();
      setUsingBrowserLocation(true);
      setGeoMessage(`Lokasi browser aktif (${coords.lat}, ${coords.lon}).`);
    } catch (err) {
      setUsingBrowserLocation(false);
      setGeoMessage(err instanceof Error ? err.message : 'Gagal mengambil lokasi.');
    } finally {
      setLocating(false);
    }
  }

  function disableLocation() {
    clearStoredCoords();
    setUsingBrowserLocation(false);
    setGeoMessage('Lokasi browser dimatikan. Cuaca memakai GREENHOUSE_LAT/LON dari backend.');
  }

  return (
    <section className="glass flex flex-col gap-5 p-5">
      <div>
        <h2 className="text-[15px] font-medium">Integrasi</h2>
        <p className="mt-1 text-[13px] text-[color:var(--color-fg-muted)]">
          Fitur tambahan yang dikonfigurasi lewat <code>backend/.env</code>. Kunci API tidak
          pernah disimpan di browser.
        </p>
      </div>

      {/* ===== Cuaca real-time (F3.2) ===== */}
      <div className="flex flex-col gap-3 border-t border-[color:var(--color-border)] pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-[14px] font-medium">
            <CloudSun className="size-4 text-[color:var(--color-sun)]" aria-hidden="true" />
            Cuaca real-time
          </h3>

          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px]',
              usingBrowserLocation
                ? 'border-[color:var(--color-success)]/40 text-[color:var(--color-success)]'
                : 'border-[color:var(--color-border)] text-[color:var(--color-fg-subtle)]',
            )}
          >
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full"
              style={{
                backgroundColor: usingBrowserLocation
                  ? 'var(--color-success)'
                  : 'var(--color-fg-subtle)',
              }}
            />
            {usingBrowserLocation === null
              ? 'Memeriksa...'
              : usingBrowserLocation
                ? 'Lokasi browser'
                : 'Lokasi tetap backend'}
          </span>
        </div>

        <WeatherOverlay variant="settings" />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void enableLocation()}
            disabled={!isAdmin || locating || usingBrowserLocation === true}
            className="inline-flex items-center gap-2 rounded-[10px] border border-[color:var(--color-border-strong)] px-3 py-1.5 text-[13px] transition-colors hover:border-[color:var(--color-canopy)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <MapPin className="size-3.5" aria-hidden="true" />
            {locating ? 'Meminta izin...' : 'Gunakan lokasi browser'}
          </button>

          {usingBrowserLocation && (
            <button
              type="button"
              onClick={disableLocation}
              disabled={!isAdmin}
              className="inline-flex items-center gap-2 rounded-[10px] border border-[color:var(--color-border-strong)] px-3 py-1.5 text-[13px] transition-colors hover:border-[color:var(--color-destructive)] hover:text-[color:var(--color-destructive)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Kembali ke lokasi tetap
            </button>
          )}
        </div>

        {geoMessage && (
          <p aria-live="polite" className="text-[12px] text-[color:var(--color-fg-subtle)]">
            {geoMessage}
          </p>
        )}
      </div>

      {/* ===== Notifikasi Telegram (F3.4) ===== */}
      <div className="flex flex-col gap-3 border-t border-[color:var(--color-border)] pt-5">
        <h3 className="text-[14px] font-medium">Notifikasi Telegram</h3>

        {telegram ? (
          telegram.enabled ? (
            <p className="text-[13px] text-[color:var(--color-fg-muted)]">
              Aktif. Alert kritis dan mendekati batas dikirim ke chat{' '}
              <span className="value-tabular font-[family-name:var(--font-mono)]">
                {telegram.maskedChatId}
              </span>
              .
            </p>
          ) : (
            <p className="text-[13px] text-[color:var(--color-fg-muted)]">
              Belum aktif. {telegram.reason ? TELEGRAM_HINT[telegram.reason] : null}
            </p>
          )
        ) : (
          <p className="text-[13px] text-[color:var(--color-fg-subtle)]">
            Status tidak dapat dimuat. Pastikan backend sedang berjalan.
          </p>
        )}

        {telegram?.cooldowns.length ? (
          <p className="text-[12px] text-[color:var(--color-fg-subtle)]">
            Menunggu jeda anti-spam:{' '}
            {telegram.cooldowns
              .map((entry) => `${entry.kind} ${Math.ceil(entry.remainingSec / 60)} menit`)
              .join(', ')}
            .
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void sendTest()}
            disabled={!isAdmin || testing}
            className="inline-flex items-center gap-2 self-start rounded-[10px] border border-[color:var(--color-border-strong)] px-3.5 py-2 text-[13px] transition-colors hover:border-[color:var(--color-canopy)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Send className="size-3.5" aria-hidden="true" />
            {testing ? 'Mengirim...' : 'Kirim pesan uji'}
          </button>

          {testResult && (
            <p
              aria-live="polite"
              className={cn(
                'text-[13px]',
                testResult.ok
                  ? 'text-[color:var(--color-success)]'
                  : 'text-[color:var(--color-warning)]',
              )}
            >
              {testResult.message}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
