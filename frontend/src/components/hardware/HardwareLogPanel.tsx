import { useState } from 'react';
import { HARDWARE_PARTS, STATUS_LABEL } from './hardwareData';
import { MAX_ENTRIES, useHardwareLogStore } from '@/store/hardwareLogStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { HardwareLogEntry, HardwareStatus } from '@/types';

/**
 * Riwayat perubahan status hardware.
 *
 * Tiga keputusan yang perlu diketahui:
 *
 * 1. Log ini lokal di browser, disimpan di Zustand store, bukan diambil dari
 *    backend. Yang dikirim ke backend hanya status `error` lewat
 *    `POST /api/logs/activity` dengan tipe `sensor_error`, supaya halaman Log
 *    di dashboard tidak terisi kejadian ringan. Konsekuensinya, log di sini
 *    hilang saat halaman di-reload, dan `warning` hanya muncul di panel ini.
 *
 * 2. Batasnya 50 entri, dibuang dari yang tertua. Alasannya sama dengan buffer
 *    sparkline: pengguna hanya perlu membaca kejadian terbaru, dan
 *    daftar yang tumbuh tanpa batas akan membuat panel sulit dipindai.
 *
 * 3. Tinggi area daftar dikunci (`LIST_HEIGHT`), bukan `flex-1` dan bukan
 *    `max-h`. Keduanya salah untuk keperluan ini: `flex-1` membuat tinggi
 *    ikut berubah mengikuti isi daftar, dan `max-h` tidak membatasi apa pun
 *    selama pembungkus luarnya bukan flex container. Tinggi tetaplah yang
 *    membuat panel ini tidak pernah menimpa panel di bawahnya.
 *
 *    Versi sebelumnya memakai `max-h-80` pada pembungkus blok biasa, sehingga
 *    `flex-1` di dalam daftar tidak pernah mendapat tinggi yang terikat dan
 *    daftarnya meluber melewati batas itu.
 */

/** Panjang area daftar yang bisa digulir. */
const LIST_HEIGHT = 'h-72';

/** Varian Badge per status tujuan, dipakai bersama oleh badge dan filter. */
const BADGE_VARIANT: Record<HardwareStatus, 'success' | 'warning' | 'destructive'> = {
  normal: 'success',
  warning: 'warning',
  error: 'destructive',
};

const STATUS_LABEL_ID: Record<HardwareStatus, string> = {
  normal: STATUS_LABEL.normal,
  warning: STATUS_LABEL.warning,
  error: STATUS_LABEL.error,
};

/** Pilihan filter. `all` berarti tidak memfilter apa pun. */
type Filter = 'all' | HardwareStatus;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Semua' },
  { value: 'normal', label: STATUS_LABEL.normal },
  { value: 'warning', label: STATUS_LABEL.warning },
  { value: 'error', label: STATUS_LABEL.error },
];

export function HardwareLogPanel() {
  const entries = useHardwareLogStore((s) => s.entries);
  const clear = useHardwareLogStore((s) => s.clear);
  const [filter, setFilter] = useState<Filter>('all');

  const visible = filter === 'all' ? entries : entries.filter((e) => e.to === filter);
  const hiddenCount = entries.length - visible.length;

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card/70">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[13px] font-semibold text-foreground">Log Hardware</h3>
          <span className="font-[family-name:var(--font-mono)] text-[11px] text-fg-subtle">
            {entries.length}/{MAX_ENTRIES}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={clear} disabled={entries.length === 0}>
          Bersihkan
        </Button>
      </div>

      {/*
        Filter memakai `aria-pressed`, bukan radio input tersembunyi.
        Tombol radio asli akan bisa difokus tanpa bisa diaktifkan, yang
        membingungkan pembaca layar.
      */}
      <div
        role="group"
        aria-label="Filter log berdasarkan status tujuan"
        className="flex shrink-0 gap-1 border-b border-border/60 px-4 py-2"
      >
        {FILTERS.map((option) => {
          const isOn = filter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isOn}
              onClick={() => setFilter(option.value)}
              className={cn(
                'rounded-md border px-2 py-0.5 text-[11px] transition-colors',
                isOn
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          );
        })}
        {hiddenCount > 0 && (
          <span className="ml-auto self-center font-[family-name:var(--font-mono)] text-[10px] text-fg-subtle">
            {hiddenCount} disembunyikan
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
          Belum ada perubahan status. Log terisi otomatis saat komponen berpindah dari normal ke
          peringatan atau error.
        </p>
      ) : visible.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
          Tidak ada entri dengan status {STATUS_LABEL_ID[filter as HardwareStatus]}.
        </p>
      ) : (
        <ul className={cn('shrink-0 overflow-y-auto', LIST_HEIGHT)}>
          {visible.map((entry) => (
            <LogRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Satu entri log.
 *
 * Dibagi dua baris dengan peran yang jelas: baris atas untuk identifikasi
 * (komponen, badge status tujuan, waktu), baris bawah untuk penjelasan.
 * Pemisahan ini yang mencegah teks antar-entri saling tindih.
 */
function LogRow({ entry }: { entry: HardwareLogEntry }) {
  const part = HARDWARE_PARTS[entry.component];

  return (
    <li className="border-b border-border/60 px-4 py-2.5 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-medium text-foreground">{part.shortName}</span>
          <Badge variant={BADGE_VARIANT[entry.to]} className="shrink-0 px-1.5 py-0 text-[10px]">
            {STATUS_LABEL_ID[entry.to]}
          </Badge>
          {entry.from !== entry.to && (
            <span className="shrink-0 font-[family-name:var(--font-mono)] text-[10px] text-fg-subtle">
              dari {STATUS_LABEL_ID[entry.from]}
            </span>
          )}
        </div>
        <span className="shrink-0 font-[family-name:var(--font-mono)] text-[11px] text-fg-subtle">
          {formatTime(entry.at)}
        </span>
      </div>

      {/*
        `break-words` wajib: `reason` berisi kalimat dari telemetry yang
        panjangnya tidak terkendali. Tanpa itu, satu kalimat tanpa spasi cukup
        untuk membuat seluruh panel melebar.
      */}
      <p className="mt-1 text-[12px] leading-relaxed break-words text-muted-foreground">
        {entry.reason}
      </p>

      {entry.source === 'simulation' && (
        <span className="mt-1 inline-block font-[family-name:var(--font-mono)] text-[10px] text-warning">
          dari Dev Mode
        </span>
      )}
    </li>
  );
}

/** Jam lokal, format 24 jam tanpa detik agar tidak mendominasi baris. */
function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
