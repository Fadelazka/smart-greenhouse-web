/**
 * Kontrak data bersama antara scene 3D dan sensor store.
 *
 * PENTING soal kejujuran data: perangkat ini hanya punya SATU sensor
 * kelembapan tanah, bukan tiga. Jadi setiap bed menampilkan bacaan tanah yang
 * sama. Nilainya tidak dihias atau dibedakan per bed, karena mengarang angka
 * berbeda per bed akan mengarang sensor yang tidak ada.
 */

export type BedId = 1 | 2 | 3;

export type BedReading = {
  /** Suhu udara, SensorReading dari store. */
  suhu: number | null;
  /** Kelembapan udara, SensorReading dari store. */
  humUdara: number | null;
  /** Kelembapan tanah - satu sensor untuk seluruh bed. */
  humTanah: number | null;
  /** Mode perangkat: auto atau manual. */
  mode: 'auto' | 'manual';
  /** Timestamp tick terakhir. */
  lastSeen: number | null;
};

export type BedCondition = 'ok' | 'warning' | 'critical' | 'unknown';

/**
 * Menentukan kondisi bed dari bacaan sensor.
 *
 * `unknown` dipakai saat belum ada telemetry sama sekali - lebih baik
 * menampilkan "belum ada data" daripadaparedingkan angka nol yang terlihat
 * seperti kondisi tanaman yang benar-benar buruk.
 */
export function bedCondition(
  reading: BedReading,
  thresholds: { humTanah: { min: number; max: number } } | null,
): BedCondition {
  if (reading.humTanah === null) return 'unknown';
  if (!thresholds) return 'ok';

  const { min, max } = thresholds.humTanah;
  const value = reading.humTanah;
  const span = Math.max(1, max - min);

  // Margin kecil di dekat batas: lebih baik diperingatkan sebelum rusak.
  const margin = span * 0.1;
  if (value < min + margin || value > max - margin) return 'warning';
  return 'ok';
}

/** Label kondisi dalam Bahasa Indonesia, selalu ikut ikon (bukan warna saja). */
export const CONDITION_LABEL: Record<BedCondition, string> = {
  ok: 'Optimal',
  warning: 'Mulai kering',
  critical: 'Perlu perhatian',
  unknown: 'Belum ada data',
};

/**
 * Skala ukuran tanaman mengikuti kelembapan tanah.
 *
 * Tanaman yang lebih hijau dan lebih tinggi saat tanah cukup lembap; saat
 * mengering, daun mengecil dan warnaonte switching ke kuning. Ini bukan
 * mengering, daun mengecil dan warnanya beralih ke kuning. Ini bukan
 */
export function plantVigor(reading: BedReading): number {
  if (reading.humTanah === null) return 0.35;
  return Math.min(1, Math.max(0.25, reading.humTanah / 100));
}
