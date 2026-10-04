import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('telegram');

/**
 * Notifikasi alert ke Telegram (F3.4).
 *
 * Tiga hal yang wajib dijaga di sini:
 *
 * 1. Kunci bot hanya ada di backend. Telegram memberi token yang setara akses
 *    penuh ke bot, jadi tidak boleh pernah masuk bundle frontend.
 * 2. Telegram membalas 429 kalau chat yang sama terlalu cepat dikirimi pesan.
 *    Semua pengiriman masuk antrean dengan jeda minimum antar pesan, bukan
 *    `await fetch` langsung dari pemanggil.
 * 3. Notifikasi tidak boleh memblokir jalur alert utama. Setiap kegagalan
 *    dilaporkan ke log, lalu dilupakan: alert tetap tampil di dashboard walau
 *    Telegram mati.
 */

/** Jeda minimum antar pesan ke chat yang sama, di atas batas aman Telegram. */
const MIN_SEND_INTERVAL_MS = 1100;
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Jeda antar pesan untuk satu jenis alert.
 *
 * `checkThresholds` sudah punya cooldown sendiri, tapi cooldown itu hilang saat
 * backend restart. Jeda di sini menutup celah itu dan tetap mencegah dua
 * sensor yang breach bersamaan tidak membanjiri chat yang sama.
 */
const PER_KIND_COOLDOWN_MS = 10 * 60 * 1000;

export type TelegramSeverity = 'info' | 'warning' | 'critical';

/** Ikon per severity supaya pesan mudah dipindai di chat. */
const SEVERITY_ICON: Record<TelegramSeverity, string> = {
  info: '\u2139',
  warning: '\u26A0',
  critical: '\u{1F6A8}',
};

export type TelegramStatus = {
  /** Bot dan chat id lengkap, dan fitur tidak dimatikan lewat env. */
  enabled: boolean;
  /** Alasan kalau tidak aktif, untuk ditampilkan di halaman Pengaturan. */
  reason: 'no-token' | 'no-chat-id' | 'disabled' | null;
  /** Chat id disembunyikan sebagian supaya tidak terekspos di layar demo. */
  maskedChatId: string | null;
  /** Sisa cooldown per jenis alert, dalam detik. */
  cooldowns: Array<{ kind: string; remainingSec: number }>;
};

export function isTelegramEnabled(): boolean {
  return env.TELEGRAM_ENABLED && env.hasTelegram;
}

/**
 * Samarkan chat id supaya masih bisa dikenali tapi tidak dibaca utuh di demo.
 * Chat id angka tidak rahasia seperti token, tapi tidak ada gunanya ditampilkan
 * lengkap di depan kelas.
 */
function maskChatId(chatId: string): string {
  if (chatId.length <= 4) return '****';
  return `${chatId.slice(0, 2)}${'*'.repeat(Math.max(4, chatId.length - 4))}${chatId.slice(-2)}`;
}

export function telegramStatus(): TelegramStatus {
  const cooldowns = Array.from(lastSentAt.entries())
    .map(([kind, at]) => ({
      kind,
      remainingSec: Math.max(0, Math.ceil((PER_KIND_COOLDOWN_MS - (Date.now() - at)) / 1000)),
    }))
    .filter((entry) => entry.remainingSec > 0);

  if (!env.TELEGRAM_ENABLED) {
    return { enabled: false, reason: 'disabled', maskedChatId: null, cooldowns };
  }
  if (env.TELEGRAM_BOT_TOKEN.trim().length === 0) {
    return { enabled: false, reason: 'no-token', maskedChatId: null, cooldowns };
  }
  if (env.TELEGRAM_CHAT_ID.trim().length === 0) {
    return {
      enabled: false,
      reason: 'no-chat-id',
      maskedChatId: null,
      cooldowns,
    };
  }

  return {
    enabled: true,
    reason: null,
    maskedChatId: maskChatId(env.TELEGRAM_CHAT_ID.trim()),
    cooldowns,
  };
}

class TelegramError extends Error {
  constructor(
    readonly reason: 'unauthorized' | 'chat-not-found' | 'rate-limited' | 'upstream-error',
    message: string,
  ) {
    super(message);
    this.name = 'TelegramError';
  }
}

async function callSendMessage(text: string): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN.trim();

  // Token bisa mengandung karakter yang perlu di-encode, dan sebagian library
  // HTTP menolak URL dengan karakter itu kalau tidak di-escape.
  const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID.trim(),
        text,
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    if (response.status === 401) {
      throw new TelegramError('unauthorized', 'Token bot ditolak Telegram.');
    }

    // 400 dengan keterangan "chat not found" muncul kalau chat id salah, jadi
    // dibedakan dari error lain supaya petunjuknya tepat.
    if (response.status === 400) {
      const body = (await response.json().catch(() => null)) as { description?: string } | null;
      if (body?.description?.includes('chat not found')) {
        throw new TelegramError('chat-not-found', 'Chat id tidak dikenali oleh bot.');
      }
      throw new TelegramError('upstream-error', body?.description ?? 'Permintaan ditolak Telegram.');
    }

    if (response.status === 429) {
      throw new TelegramError('rate-limited', 'Telegram meminta pengiriman ditunda.');
    }

    if (!response.ok) {
      throw new TelegramError('upstream-error', `Telegram membalas ${response.status}.`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Antrean pengiriman sederhana.
 *
 * `chain` disimpan sebagai promise yang selalu selesai, termasuk saat gagal, supaya
 * satu pesan yang error tidak boleh membekukan semua pesan setelahnya.
 */
let chain: Promise<void> = Promise.resolve();
const lastSentAt = new Map<string, number>();
let lastSendAt = 0;

function enqueue(task: () => Promise<void>): Promise<void> {
  const next = chain.then(async () => {
    const waitMs = MIN_SEND_INTERVAL_MS - (Date.now() - lastSendAt);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    await task();
    lastSendAt = Date.now();
  });

  // Jangan pernah biarkan rantai menolak: error dicatat di dalam task.
  chain = next.catch(() => undefined);
  return next;
}

/**
 * Kirim satu pesan alert ke Telegram.
 *
 * `kind` dipakai sebagai kunci cooldown, jadi `suhu` yang breach berulang
 * tidak mengirim pesan identik setiap beberapa detik. Mengembalikan `false`
 * kalau pesan sengaja dilewati, `true` kalau benar-benar terkirim.
 */
export async function sendTelegramAlert(
  kind: string,
  severity: TelegramSeverity,
  lines: string[],
): Promise<boolean> {
  if (!isTelegramEnabled()) return false;

  const last = lastSentAt.get(kind) ?? 0;
  if (Date.now() - last < PER_KIND_COOLDOWN_MS) return false;

  lastSentAt.set(kind, Date.now());

  const icon = SEVERITY_ICON[severity];
  const text = [`${icon} Greenhouse · ${severity.toUpperCase()}`, '', ...lines].join('\n');

  try {
    await enqueue(() => callSendMessage(text));
    log.info(`Alert "${kind}" terkirim ke Telegram`);
    return true;
  } catch (error) {
    if (error instanceof TelegramError) {
      log.warn(`Telegram gagal (${error.reason}): ${error.message}`);
    } else {
      log.warn('Telegram gagal', error instanceof Error ? error.message : error);
    }
    return false;
  }
}

/**
 * Pesan uji coba, dipanggil tombol "Kirim pesan uji" di halaman Pengaturan.
 *
 * Tidak lewat cooldown per jenis supaya pengguna bisa memverifikasi token
 * kapan saja, tapi tetap lewat antrean supaya tidak menyalahi rate limit.
 */
export async function sendTelegramTest(): Promise<{ ok: boolean; message: string }> {
  if (!env.TELEGRAM_ENABLED) {
    return { ok: false, message: 'Notifikasi Telegram dimatikan lewat TELEGRAM_ENABLED=false.' };
  }
  if (env.TELEGRAM_BOT_TOKEN.trim().length === 0) {
    return { ok: false, message: 'TELEGRAM_BOT_TOKEN belum diisi di backend/.env.' };
  }
  if (env.TELEGRAM_CHAT_ID.trim().length === 0) {
    return { ok: false, message: 'TELEGRAM_CHAT_ID belum diisi di backend/.env.' };
  }

  const text = [
    '\u2705 Greenhouse · koneksi berhasil',
    '',
    'Notifikasi alert aktif. Pesan ini dikirim dari tombol uji di halaman Pengaturan.',
    new Date().toLocaleString('id-ID'),
  ].join('\n');

  try {
    await enqueue(() => callSendMessage(text));
    return { ok: true, message: 'Pesan uji berhasil dikirim. Periksa chat Telegram Anda.' };
  } catch (error) {
    if (error instanceof TelegramError) {
      const hint =
        error.reason === 'unauthorized'
          ? ' Token bot ditolak Telegram, periksa kembali nilainya.'
          : error.reason === 'chat-not-found'
            ? ' Chat id salah. Chat harus sudah pernah mengirim pesan ke bot.'
            : '';
      return { ok: false, message: `Gagal mengirim: ${error.message}.${hint}` };
    }
    return { ok: false, message: 'Gagal mengirim karena masalah jaringan.' };
  }
}
