import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, ScrollText } from 'lucide-react';
import { TimelineEmpty, TimelineFilterChip, TimelineLog } from '@/components/log/TimelineLog';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { SOCKET_EVENTS } from '@/store/sensorStore';
import { ACTIVITY_META, type ActivityRow, type ActivityType } from '@/types';

const PAGE_SIZE = 50;
/** Batas entri yang disimpan di state supaya timeline tidak tumbuh tanpa henti. */
const MAX_ENTRIES = 500;

/**
 * Grup filter yang dibuat dari tipe yang benar-benar muncul di log, bukan
 * daftar hardcoded. Kalau belum ada `restart`, chip-nya tidak ditampilkan -
 * lebih baik daripada menampilkan "(0)" untuk event yang belum pernah terjadi.
 */
const GROUP_ORDER: Array<{ key: string; types: ActivityType[]; label: string }> = [
  { key: 'alert', types: ['alert', 'sensor_error'], label: 'Alert' },
  { key: 'actuator', types: ['actuator_on', 'actuator_off'], label: 'Aktuator' },
  { key: 'config', types: ['threshold_change', 'calibration_change', 'mode_change'], label: 'Konfigurasi' },
  { key: 'device', types: ['restart'], label: 'Perangkat' },
  { key: 'auth', types: ['login'], label: 'Akses' },
];

function groupOf(type: string): string {
  return GROUP_ORDER.find((group) => group.types.includes(type as ActivityType))?.key ?? 'other';
}

export function Log() {
  const [entries, setEntries] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;

    void api
      .activity(PAGE_SIZE)
      .then((result) => {
        if (!cancelled) setEntries(result.entries);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Timeline harus tumbuh saat ada perintah baru dari dashboard atau halaman
  // Pengaturan, jadi listen langsung ke event activity:new. Dedupe per id
  // karena entri yang sama bisa tiba dari refetch dan dari socket.
  useEffect(() => {
    const socket = getSocket();

    const onActivity = (entry: ActivityRow) => {
      setEntries((prev) => {
        if (prev.some((existing) => existing.id === entry.id)) return prev;
        return [entry, ...prev].slice(0, MAX_ENTRIES);
      });
    };

    socket.on(SOCKET_EVENTS.ACTIVITY, onActivity);
    return () => {
      socket.off(SOCKET_EVENTS.ACTIVITY, onActivity);
    };
  }, []);

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      const key = groupOf(entry.type);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return GROUP_ORDER.filter((item) => (counts.get(item.key) ?? 0) > 0).map((item) => ({
      key: item.key,
      label: item.label,
      count: counts.get(item.key) ?? 0,
      color: ACTIVITY_META[item.types[0]]?.color,
    }));
  }, [entries]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return entries.filter((entry) => {
      if (group && groupOf(entry.type) !== group) return false;
      if (!needle) return true;
      return (
        entry.message.toLowerCase().includes(needle) ||
        entry.actor.toLowerCase().includes(needle) ||
        entry.type.toLowerCase().includes(needle)
      );
    });
  }, [entries, group, query]);

  const resetFilters = useCallback(() => {
    setGroup(null);
    setQuery('');
  }, []);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-5">
        <h1 className="font-[family-name:var(--font-display)] text-[clamp(20px,3vw,28px)]">
          Timeline Aktivitas
        </h1>
        <p className="mt-1 text-[14px] text-[color:var(--color-fg-muted)]">
          Setiap perintah dan perubahan yang dikirim ke perangkat tercatat siapa, kapan, dan
          apa yang diubah.
        </p>
      </header>

      {!loading && entries.length > 0 && (
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {groups.map((item) => (
              <TimelineFilterChip
                key={item.key}
                active={group === item.key}
                count={item.count}
                label={item.label}
                color={item.color}
                onClick={() => setGroup((prev) => (prev === item.key ? null : item.key))}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="relative flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[color:var(--color-fg-subtle)]"
                aria-hidden="true"
              />
              <span className="sr-only">Cari aktivitas</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari pesan, pelaku, atau jenis..."
                className="w-full rounded-[10px] border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-deep)] py-2 pr-3 pl-9 text-[13px] outline-none focus:border-[color:var(--color-canopy)]"
              />
            </label>

            {(group || query) && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-[13px] text-[color:var(--color-canopy)] hover:underline"
              >
                Reset filter
              </button>
            )}

            <p aria-live="polite" className="text-[12px] text-[color:var(--color-fg-subtle)]">
              Menampilkan {visible.length} dari {entries.length} entri
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <TimelineLog entries={[]} loading />
      ) : entries.length === 0 ? (
        <TimelineEmpty />
      ) : visible.length === 0 ? (
        <div className="glass grid place-items-center gap-2 px-5 py-12 text-center">
          <ScrollText className="size-8 text-[color:var(--color-fg-subtle)]" aria-hidden="true" />
          <p className="text-[14px] font-medium">Tidak ada entri yang cocok</p>
          <p className="max-w-sm text-[13px] text-[color:var(--color-fg-muted)]">
            Coba kata kunci lain atau reset filter yang aktif.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-1 text-[13px] text-[color:var(--color-canopy)] hover:underline"
          >
            Reset filter
          </button>
        </div>
      ) : (
        <TimelineLog entries={visible} loading={false} />
      )}
    </div>
  );
}