/**
 * Kontrak data scene hardware 3D.
 *
 * SEMUA angka posisi dan warna kabel di file ini diturunkan dari
 * `diagram.json` (Wokwi) dan `sketch.ino` (firmware), bukan dikarang.
 *
 * Konversi Posisi
 * ---------
 * `diagram.json` memakai koordinat piksel kanvas Wokwi (top/left). Titik acuan
 * diambil dari posisi ESP32 (`left: -81.56`, `top: -28.8`) lalu setiap
 * komponen dihitung sebagai selisih terhadapnya, lalu dikali 1/80 agar muat
 * di dalam scene R3F. Arah `top` di Wokwi ke bawah, jadi nilai top yang lebih
 * besar berarti lebih dekat ke kamera (sumbu Z positif).
 *
 * Hasilnya persis mengikuti gambar: DHT22 kiri-atas, potentiometer kanan-atas,
 * relay kanan-bawah, LCD kiri-bawah, ESP32 di tengah.
 *
 * Pin
 * ---
 * DHT22 tercatat sebagai `dht1:SDA` di `diagram.json`, tapi itu hanya label
 * Wokwi. DHT22 adalah protokol satu-kawat (single-wire): VCC, GND, dan DATA.
 * Tidak ada I2C di DHT22 sama sekali. Jadi label di sini memakai DATA.
 */

import type { HardwareComponentId, HardwareStatus } from '@/types';

/** Satu pin yang terhubung antara komponen dan ESP32. */
export type HardwarePin = {
  /** Nama pin pada komponen, misal "DATA". */
  label: string;
  /** Pin ESP32 tujuan, misal "GPIO 15". */
  espPin: string;
  /** Keterangan tambahan opsional, misal "input-only". */
  note?: string;
};

export type HardwarePartMeta = {
  id: HardwareComponentId;
  /** Nama lengkap untuk panel detail. */
  name: string;
  /** Nama pendek untuk label kecil di atas model. */
  shortName: string;
  /** Fungsi dalam Bahasa Indonesia. */
  description: string;
  /** Posisi pusat komponen di scene, sudah diskalakan dari diagram.json. */
  position: [number, number, number];
  /** Ukuran dasar [lebar X, tinggi Y, dalam Z] dalam unit scene. */
  size: [number, number, number];
  pins: HardwarePin[];
};

/** Warna kabel, diambil dari field ketiga tiap entri `connections`. */
export const WIRE_COLOR = {
  gnd: '#4b5563',
  vcc: '#ef4444',
  sig: '#facc15',
  data: '#22d3ee',
  in: '#84cc16',
  sda: '#e879f9',
  scl: '#f8fafc',
} as const;

/**
 * Catatan soal "hitam".
 *
 * `diagram.json` menulis GND sebagai "black". Pure black di atas background
 * gelap scene (`#0F1F1A`) praktis tidak terlihat, jadi dipakai abu-abu gelap
 * yang tetap terbaca sebagai kabel hitam. Ini penyimpangan yang disengaja.
 */
export const WIRE_COLOR_NOTE =
  'GND digambar abu-abu gelap, bukan hitam pekat, karena hitam tidak terlihat di atas background gelap.';

export const HARDWARE_PARTS: Record<HardwareComponentId, HardwarePartMeta> = {
  esp32: {
    id: 'esp32',
    name: 'ESP32 DevKit C V4',
    shortName: 'ESP32',
    description:
      'Board utama. Menjalankan firmware AgriShield v1.0: membaca sensor, menampilkan ke LCD, lalu mengendalikan relay. Menggabungkan Wi-Fi dan Bluetooth dalam satu chip ESP32-WROOM-32D.',
    position: [0, 0, 0],
    size: [2.4, 0.16, 1.3],
    pins: [
      { label: '3V3', espPin: '3V3' },
      { label: 'GND', espPin: 'GND' },
      { label: 'GPIO 15', espPin: 'GPIO 15', note: 'input, DHT22 DATA' },
      { label: 'GPIO 34', espPin: 'GPIO 34', note: 'input-only, ADC1_CH6' },
      { label: 'GPIO 2', espPin: 'GPIO 2', note: 'output, relay active-LOW' },
      { label: 'GPIO 21', espPin: 'GPIO 21', note: 'I2C SDA, LCD' },
      { label: 'GPIO 22', espPin: 'GPIO 22', note: 'I2C SCL, LCD' },
    ],
  },

  dht22: {
    id: 'dht22',
    name: 'DHT22',
    shortName: 'DHT22',
    description:
      'Sensor suhu dan kelembapan udara dengan protokol satu-kawat. Firmware memanggil isnan() pada hasil bacaan; kalau NaN, firmware mencetak "Gagal baca DHT22!" lalu melewati satu siklus. Sinyalnya jangkauan sekitar 1 m, jadi harus dekat dengan udara yang diukur.',
    position: [-1.81, 0, -0.24],
    size: [0.62, 0.5, 0.42],
    pins: [
      { label: 'VCC', espPin: '3V3' },
      { label: 'GND', espPin: 'GND' },
      { label: 'DATA', espPin: 'GPIO 15', note: 'satu-kawat, bukan SDA' },
    ],
  },

  potentiometer: {
    id: 'potentiometer',
    name: 'Potensiometer (Simulasi Tanah)',
    shortName: 'Pot 0-100%',
    description:
      'Berperan sebagai sensor kelembapan tanah simulasi. Firmware membaca analogRead lalu memetakan 0-4095 menjadi 0-100 persen. GPIO 34 termasuk ADC1 dan hanya bisa jadi input, jadi knob tidak pernah bisa jadi output.',
    position: [2.22, 0, -0.5],
    size: [0.58, 0.62, 0.58],
    pins: [
      { label: 'VCC', espPin: '3V3' },
      { label: 'GND', espPin: 'GND' },
      { label: 'SIG', espPin: 'GPIO 34', note: 'input-only, ADC1_CH6' },
    ],
  },

  relay: {
    id: 'relay',
    name: 'Relay Module 2-Channel',
    shortName: 'Relay Pompa',
    description:
      'Modul relay 2-channel active-LOW: pin LOW menyalakan, HIGH mematikan. Firmware menyalakan pompa saat kelembapan di bawah 30 persen dan mematikannya di atas 70 persen. Di antara 30 sampai 70 persen status sebelumnya dipertahankan, jadi ada histeresis dan tidak berkedip tiap tick.',
    position: [2.1, 0, 1.32],
    size: [1.05, 0.42, 0.78],
    pins: [
      { label: 'VCC', espPin: '3V3' },
      { label: 'GND', espPin: 'GND' },
      { label: 'IN', espPin: 'GPIO 2', note: 'active-LOW' },
    ],
  },

  lcd: {
    id: 'lcd',
    name: 'LCD 1602 I2C',
    shortName: 'LCD 16x2',
    description:
      'LCD 16x2 karakter di alamat I2C 0x27 dengan modul backpack di belakangnya. Baris pertama menampilkan kelembapan tanah dan suhu, baris kedua menampilkan status pompa. Saat menyala pertama kali layar menunjukkan "AgriShield v1.0" selama 2 detik lalu dibersihkan.',
    position: [-0.83, 0, 2.96],
    size: [1.55, 0.62, 0.36],
    pins: [
      { label: 'VCC', espPin: '3V3' },
      { label: 'GND', espPin: 'GND' },
      { label: 'SDA', espPin: 'GPIO 21', note: 'I2C data' },
      { label: 'SCL', espPin: 'GPIO 22', note: 'I2C clock' },
    ],
  },
};

/**
 * Titel anchor tiap pin, dalam koordinat lokal komponen.
 *
 * Anchor dipakai untuk menyambungkan ujung kabel ke titik yang benar pada
 * permukaan board, bukan asal menaruh di pusat komponen.
 */
export const PIN_ANCHOR: Record<string, [number, number, number]> = {
  // ESP32: header ada di dua TEPI PANJANG (sisi -Z dan +Z), bukan di ujung
  // pendek. Port USB berada di ujung -X, modul WROOM di ujung +X.
  'esp32:3V3': [-0.75, 0.09, -0.65],
  'esp32:GND': [-0.3, 0.09, -0.65],
  'esp32:GPIO 15': [0.1, 0.09, -0.65],
  'esp32:GPIO 34': [0.5, 0.09, -0.65],
  'esp32:GPIO 2': [0.9, 0.09, -0.65],
  'esp32:GPIO 21': [0.6, 0.09, 0.65],
  'esp32:GPIO 22': [0.95, 0.09, 0.65],

  // DHT22: tiga pin di sisi bawah, menghadap ESP32 (sisi +X).
  'dht22:VCC': [0.31, 0.06, 0.12],
  'dht22:GND': [0.31, 0.06, -0.02],
  'dht22:DATA': [0.31, 0.06, -0.16],

  // Potensiometer: tiga pin di sisi bawah, menghadap ESP32 (sisi -X).
  'potentiometer:VCC': [-0.29, 0.06, 0.14],
  'potentiometer:GND': [-0.29, 0.06, 0],
  'potentiometer:SIG': [-0.29, 0.06, -0.14],

  // Relay: pin di sisi kiri board, menghadap ESP32.
  'relay:VCC': [-0.52, 0.06, -0.22],
  'relay:GND': [-0.52, 0.06, -0.08],
  'relay:IN': [-0.52, 0.06, 0.06],

  // LCD: empat pin di sisi belakang, menghadap ESP32 (sisi -Z).
  'lcd:VCC': [-0.42, 0.06, -0.18],
  'lcd:GND': [-0.42, 0.06, -0.06],
  'lcd:SDA': [-0.42, 0.06, 0.06],
  'lcd:SCL': [-0.42, 0.06, 0.18],
};

/** Satu kabel penghubung antara pin komponen ke pin ESP32. */
export type HardwareWire = {
  /**
   * Komponen asal dan pin di komponen itu.
   *
   * Kedua ujung kabel ditulis lengkap, tidak ada asumsi bahwa satu ujung
   * selalu ESP32. Bentuk yang lebih ringkas pernah dipakai di sini, tapi
   * menyiratkan arah dan menyebabkan pin salah resolve.
   */
  from: HardwareComponentId;
  fromPin: string;
  fromLabel: string;
  to: HardwareComponentId;
  toPin: string;
  toLabel: string;
  color: string;
};

/**
 * Tiga belas kabel yang cocok dengan `connections` di `diagram.json`:
 * 4 GND + 4 VCC + 5 sinyal.
 *
 * Dua entri lain di diagram.json (esp:TX dan esp:RX) tidak dihitung karena
 * menghubungkan ESP32 ke serial monitor, bukan antar komponen di scene.
 *
 * Semua kabel ditulis dari komponen peripherals ke ESP32 supaya urutannya
 * mudah diperiksa terhadap daftar di `diagram.json`.
 */
export const HARDWARE_WIRES: HardwareWire[] = [
  // GND
  { from: 'dht22', fromPin: 'GND', fromLabel: 'GND', to: 'esp32', toPin: 'GND', toLabel: 'GND', color: WIRE_COLOR.gnd },
  { from: 'potentiometer', fromPin: 'GND', fromLabel: 'GND', to: 'esp32', toPin: 'GND', toLabel: 'GND', color: WIRE_COLOR.gnd },
  { from: 'relay', fromPin: 'GND', fromLabel: 'GND', to: 'esp32', toPin: 'GND', toLabel: 'GND', color: WIRE_COLOR.gnd },
  { from: 'lcd', fromPin: 'GND', fromLabel: 'GND', to: 'esp32', toPin: 'GND', toLabel: 'GND', color: WIRE_COLOR.gnd },
  // VCC
  { from: 'dht22', fromPin: 'VCC', fromLabel: 'VCC', to: 'esp32', toPin: '3V3', toLabel: '3V3', color: WIRE_COLOR.vcc },
  { from: 'potentiometer', fromPin: 'VCC', fromLabel: 'VCC', to: 'esp32', toPin: '3V3', toLabel: '3V3', color: WIRE_COLOR.vcc },
  { from: 'relay', fromPin: 'VCC', fromLabel: 'VCC', to: 'esp32', toPin: '3V3', toLabel: '3V3', color: WIRE_COLOR.vcc },
  { from: 'lcd', fromPin: 'VCC', fromLabel: 'VCC', to: 'esp32', toPin: '3V3', toLabel: '3V3', color: WIRE_COLOR.vcc },
  // Sinyal
  { from: 'dht22', fromPin: 'DATA', fromLabel: 'DATA', to: 'esp32', toPin: 'GPIO 15', toLabel: 'GPIO 15', color: WIRE_COLOR.data },
  { from: 'potentiometer', fromPin: 'SIG', fromLabel: 'SIG', to: 'esp32', toPin: 'GPIO 34', toLabel: 'GPIO 34', color: WIRE_COLOR.sig },
  { from: 'relay', fromPin: 'IN', fromLabel: 'IN', to: 'esp32', toPin: 'GPIO 2', toLabel: 'GPIO 2', color: WIRE_COLOR.in },
  { from: 'lcd', fromPin: 'SDA', fromLabel: 'SDA', to: 'esp32', toPin: 'GPIO 21', toLabel: 'GPIO 21', color: WIRE_COLOR.sda },
  { from: 'lcd', fromPin: 'SCL', fromLabel: 'SCL', to: 'esp32', toPin: 'GPIO 22', toLabel: 'GPIO 22', color: WIRE_COLOR.scl },
];

/** Label status dalam Bahasa Indonesia, selalu dipakai bersama ikon. */
export const STATUS_LABEL: Record<HardwareStatus, string> = {
  normal: 'Normal',
  warning: 'Peringatan',
  error: 'Error',
};

/** Warna status sesuai permintaan: hijau, kuning, merah. */
export const STATUS_COLOR: Record<HardwareStatus, string> = {
  normal: '#22c55e',
  warning: '#eab308',
  error: '#ef4444',
};

/**
 * Target orbit default.
 *
 * ESP32 ada di titik (0,0,0), tapi bila keempat komponen lain ikut dihitung,
 * titik beratnya bergeser ke sekitar (0.34, 0, 0.71). Orbit diarahkan ke sana
 * supaya komposisinya terasa di tengah tanpa memindahkan posisi yang sudah
 * diturunkan dari diagram.json.
 */
export const HARDWARE_ORBIT_TARGET: [number, number, number] = [0.34, 0.15, 0.71];
