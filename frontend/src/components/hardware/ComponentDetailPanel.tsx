import { AnimatePresence, motion } from 'framer-motion';
import { HARDWARE_PARTS } from './hardwareData';
import { ComponentDetailEmpty } from './ComponentDetailEmpty';
import { ComponentDetailFull } from './ComponentDetailFull';
import type { HardwareVerdict } from './useHardwareStatus';
import type { HardwareComponentId } from '@/types';

/**
 * Panel detail komponen: dispatcher antara default state dan detail lengkap.
 *
 * Panel ini tetap menjadi satu-satunya pintu masuk props untuk scene hardware,
 * sehingga HardwareScene tidak perlu tahu bentuk isi panelnya.
 *
 * Soal transisi: `AnimatePresence` dengan `mode="wait"` dipakai supaya panel
 * lama selesai menghilang dulu sebelum yang baru masuk. Tanpa `wait`, kedua
 * panel akan saling menimpa selama 200 milidetik dan teksnya bertumpuk
 * seperti bug log yang sudah diperbaiki.
 */

/** Durasi transisi, dibuat pendek supaya tidak terasa lambat. */
const FADE = 0.18;

export function ComponentDetailPanel({
  selected,
  verdict,
  still,
  onSelect,
  onClear,
}: {
  selected: HardwareComponentId | null;
  verdict: HardwareVerdict;
  still: boolean;
  onSelect: (id: HardwareComponentId) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card/70 p-6">
      {/*
        Tinggi scroll disamakan dengan panel Log di sebelahnya supaya kedua
        kolom berhenti sejajar di bagian atas dan bawah.

        `min-h-0` itu wajib, bukan kosmetik: flex child-scroll di dalam
        `flex-col` akan menolak ikut menyusut tanpa itu, sehingga panel ini
        pernah memaksa halaman jadi lebih tinggi dari scene 3D.

        Default state sengaja dibuat muat tanpa menggulir: preview 280px +
        heading + grid 2 kolom + instruksi totaled di bawah 34rem. Kelima
        komponen karena itu selalu terlihat tanpa scroll.
      */}
      <div className="max-h-[34rem] min-h-0 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={selected ?? 'empty'}
            initial={still ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={still ? undefined : { opacity: 0, x: -24 }}
            transition={{ duration: FADE, ease: 'easeOut' }}
          >
            {selected === null ? (
              <ComponentDetailEmpty still={still} onSelect={onSelect} />
            ) : (
              <ComponentDetailFull
                component={selected}
                verdict={verdict}
                still={still}
                onClear={onClear}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export { HARDWARE_PARTS };
