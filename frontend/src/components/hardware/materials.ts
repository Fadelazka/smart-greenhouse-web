import { useEffect, useMemo } from 'react';
import { Color, MeshPhysicalMaterial, type MeshPhysicalMaterialParameters } from 'three';

/**
 * Definisi material hardware, dipakai kelima model 3D.
 *
 * Kenapa factory, bukan objek singleton
 * ------------------------------------
 * `applyPulse` di `PartFrame` menulis langsung ke `material.emissive` dan
 * `material.emissiveIntensity` setiap frame. Kalau material disimpan sebagai
 * singleton di level modul, instance yang sama dipakai oleh scene utama DAN canvas
 * mini di panel detail, sehingga denyut status di scene utama ikut mengubah
 * tampilan panel detail. Selain itu, disposal di satu canvas bisa merusak
 * material yang masih dipakai canvas lain.
 *
 * Jadi yang dipakai di sini adalah *resep*: parameter yang ditulis sekali di
 * satu tempat, lalu di-instansiate ulang per komponen lewat
 * `useHardwareMaterials()`. Resep tidak pernah bocor, instance tetap milik
 * satu subtree saja.
 *
 * Kenapa `MeshPhysicalMaterial`, bukan `MeshStandardMaterial`
 * --------------------------------------------------------
 * MeshStandardMaterial tidak punya `clearcoat` maupun `transmission`, padahal
 * permukaan PCB berlapis epoxy dan kaca LCD justru ditentukan oleh lapisan
 * bening itu. Biayanya sendiri hampir nol: three.js hanya mengaktifkan define
 * `USE_CLEARCOAT` kalau `clearcoat > 0`, jadi material dengan `clearcoat: 0`
 * tidak menambah branch shader sama sekali.
 *
 * Semua material di sini memakai `envMapIntensity` di atas 1 karena scene
 * sekarang punya environment map dari Lightformer. Tanpa itu, metal emas dan
 * perak akan tetap terlihat gelap seperti dulu.
 */

/** Resep material: parameter yang bisa dibaca tiga.js, tanpa efek samping. */
export type MaterialRecipe = MeshPhysicalMaterialParameters;

/**
 * Resep reusable.
 *
 * Angka roughness dan metalness diambil dari appearance sheet / datasheet:
 * - Emas pada header pin 0.28/1.0, karena berlapis nikel di atas tembaga.
 * - Perak pada shield WROOM 0.35/1.0, galvanis dan sedikit buram.
 * - PCB fiberglass matte 0.62 dengan clearcoat tipis dari lapisan epoxy.
 * - Plastik ABS housing 0.55 tanpa clearcoat, kesannya seperti halus dan kasar.
 * - Kaca LCD 0.05 dengan clearcoat penuh supaya memantulkan cahaya sekitar.
 */
export const RECIPES = {
  /** PCB ESP32 DevKit: hitam matte berlapis epoxy. */
  pcbBlack: {
    color: '#1a1a1c',
    roughness: 0.62,
    metalness: 0.14,
    clearcoat: 0.32,
    clearcoatRoughness: 0.42,
    envMapIntensity: 1.1,
  },

  /** PCB relay: merah, mengikuti warna modul relay 2-channel. */
  pcbRed: {
    color: '#8f1d1d',
    roughness: 0.6,
    metalness: 0.12,
    clearcoat: 0.28,
    clearcoatRoughness: 0.45,
    envMapIntensity: 1.05,
  },

  /** PCB hijau untuk modul LCD dan driver relay. */
  pcbGreen: {
    color: '#12572f',
    roughness: 0.6,
    metalness: 0.12,
    clearcoat: 0.28,
    clearcoatRoughness: 0.45,
    envMapIntensity: 1.05,
  },

  /** Emas pada header pin dan kaki heatsink. */
  gold: {
    color: '#d4af37',
    roughness: 0.28,
    metalness: 1,
    envMapIntensity: 1.6,
  },

  /** Perak pada shield WROOM dan port USB. */
  silver: {
    color: '#c7ccd1',
    roughness: 0.35,
    metalness: 1,
    envMapIntensity: 1.45,
  },

  /** Tembaga pada kontak relay dan kaki heatsink DHT22. */
  copper: {
    color: '#c07a3e',
    roughness: 0.42,
    metalness: 0.95,
    envMapIntensity: 1.35,
  },

  /** Housing plastik putih DHT22. */
  plasticWhite: {
    color: '#eceff2',
    roughness: 0.55,
    metalness: 0.02,
    // `clearcoat` tetap 0.18, bukan 0: permukaan plastik ABS memang mengkilau,
    clearcoat: 0.18,
    clearcoatRoughness: 0.6,
    envMapIntensity: 0.95,
  },

  /** Bodi biru potentiometer. */
  plasticBlue: {
    color: '#1e5aa8',
    roughness: 0.44,
    metalness: 0.06,
    clearcoat: 0.4,
    clearcoatRoughness: 0.35,
    envMapIntensity: 1.1,
  },

  /** Relay kubit biru. */
  relayBlue: {
    color: '#1b4f9c',
    roughness: 0.38,
    metalness: 0.08,
    clearcoat: 0.45,
    clearcoatRoughness: 0.3,
    envMapIntensity: 1.15,
  },

  /** Knob hitam knurled. */
  knobBlack: {
    color: '#1b1b1d',
    roughness: 0.72,
    metalness: 0.05,
    envMapIntensity: 0.85,
  },

  /** Terminal sekrup hijau pada relay. */
  terminalGreen: {
    color: '#1f7a4d',
    roughness: 0.5,
    metalness: 0.1,
    clearcoat: 0.2,
    envMapIntensity: 1,
  },

  /** Terminal biru NEXT IN. */
  terminalBlue: {
    color: '#2f6fd0',
    roughness: 0.44,
    metalness: 0.2,
    envMapIntensity: 1.05,
  },

  /** Kaca depan LCD. */
  lcdGlass: {
    color: '#0d1a12',
    roughness: 0.06,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.8,
  },

  /** Silkscreen putih di permukaan PCB. */
  silkscreen: {
    color: '#e8ece9',
    roughness: 0.85,
    metalness: 0,
    envMapIntensity: 0.7,
  },

  /** Rongga gelap: lubang USB, slot DHT22, cekungan soket relay. */
  cavity: {
    color: '#07090c',
    roughness: 0.95,
    metalness: 0,
    envMapIntensity: 0.25,
  },

  /** Karet hitam: feet, selang, gasket. */
  rubber: {
    color: '#15171a',
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.5,
  },
} satisfies Record<string, MaterialRecipe>;

/**
 * Resep material emissive.
 *
 * `emissiveIntensity` sengaja di atas 1.0. Bloom yang terpasang memakai
 * `luminanceThreshold 0.9` terhadap input LINEAR, jadi material dengan
 * emissive 0.85 (seperti layar LCD lama) tidak akan pernah melewati ambang
 * dan bloom-nya tidak kelihatan sama sekali. LED harus benar-benar terang,
 * bukan sekadar "agak bercahaya".
 */
export const LED_RECIPES = {
  /** LED power merah di board ESP32. */
  powerRed: {
    color: '#2a0806',
    emissive: new Color('#ff2b1f'),
    emissiveIntensity: 2.6,
    roughness: 0.3,
    metalness: 0,
    envMapIntensity: 0.6,
  },

  /** LED hijau pada pin 13, penanda aktivitas digital. */
  activityGreen: {
    color: '#04180c',
    emissive: new Color('#33ff7a'),
    emissiveIntensity: 2.2,
    roughness: 0.3,
    metalness: 0,
    envMapIntensity: 0.6,
  },

  /** LED amber untuk status warning. */
  warnAmber: {
    color: '#201404',
    emissive: new Color('#ffb020'),
    emissiveIntensity: 2.4,
    roughness: 0.3,
    metalness: 0,
    envMapIntensity: 0.6,
  },
} satisfies Record<string, MaterialRecipe>;

/**
 * Selembut material yang menyala di dalam housing bening.
 *
 * DHT22 punya LED merah di dalam casing putihnya. Kalau dikasih emissive
 * langsung, housing putih akan ikut menyala dan siluet housing hilang. Yang
 * benar: material dioda dibuat jadi emissive lembut, dan opticanya yang
 * meneruskan cahaya.
 */
export const LED_SOFT_RECIPES = {
  ledSoftRed: {
    color: '#3a0a08',
    emissive: new Color('#ff3b30'),
    emissiveIntensity: 1.45,
    roughness: 0.55,
    metalness: 0,
    envMapIntensity: 0.5,
  },
} satisfies Record<string, MaterialRecipe>;

/** Nama recipe yang boleh ikut berdenyut mengikuti status komponen. */
export type StatusDrivenMaterial =
  | 'pcbBlack'
  | 'pcbRed'
  | 'pcbGreen'
  | 'plasticWhite'
  | 'plasticBlue'
  | 'relayBlue';

/**
 * Material yang statusnya boleh ikut berdenyut.
 *
 * Hanya badan utama komponen. Pin emas, silkscreen, dan konektor USB sengaja
 * tidak ada di sini: kalau ikut berdenyut, denyut merah akan membuat seluruh
 * komponen berkedip dan informasinya hilang.
 */
export const STATUS_DRIVEN: ReadonlySet<StatusDrivenMaterial> = new Set([
  'pcbBlack',
  'pcbRed',
  'pcbGreen',
  'plasticWhite',
  'plasticBlue',
  'relayBlue',
]);

/** Semua nama recipe yang tersedia. */
export type MaterialKey = keyof typeof RECIPES;
/** Semua nama recipe emissive yang tersedia. */
export type LedKey = keyof typeof LED_RECIPES;

/**
 * Instansiate seluruh material sebagai milik satu subtree.
 *
 * Dipanggil sekali per model lewat `useHardwareMaterials()`, bukan sekali per
 * mesh: membuat material baru untuk tiap mesh akan menggagalkan caching
 * shader three.js dan menaikkan beban GPU.
 */
export type HardwareMaterials = {
  [K in MaterialKey]: MeshPhysicalMaterial;
} & {
  [K in LedKey]: MeshPhysicalMaterial;
} & {
  [K in keyof typeof LED_SOFT_RECIPES]: MeshPhysicalMaterial;
};

/**
 * Instansiate satu resep menjadi material milik subtree pemanggil.
 *
 * `statusDriven` dipasang di sini, bukan lewat atribut JSX, karena
 * `applyPulse` di `PartFrame` membaca penanda dari `material.userData`.
 * Kalau penandanya diletakkan di mesh, traversal tidak akan pernah
 * meneukannya dan komponen tidak akan ikut berdenyut.
 *
 * `side` sengaja tidak diubah: semua material memakai `FrontSide`. Menempelkan
 * `DoubleSide` ke seluruh material akan menggandakan fragment yang di-raster
 * untuk setiap permukaan, dan tidak ada satu pun permukaan di scene ini yang
 * perlu backside. Permukaan datar seperti layar LCD dan jejak silkscreen
 * memakai `PlaneGeometry`/`BoxGeometry` dengan orientasi yang sudah benar.
 */
function instantiate<T extends MaterialRecipe>(recipe: T, statusDriven: boolean): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial(recipe);
  material.userData.statusDriven = statusDriven;
  return material;
}

/**
 * Hook yang membuat satu set material milik subtree, lengkap dengan disposal.
 *
 * Disposal penting karena `MeshPhysicalMaterial` memegang referensi ke shader
 * program. Kalau model dilepas (mis. pengguna pindah halaman) tanpa dispose,
 * program menumpuk di GPU WebGL context dan pemakaian memori naik terus selama sesi.
 */
export function useHardwareMaterials(): HardwareMaterials {
  const materials = useMemo(() => {
    const built = {} as Record<string, MeshPhysicalMaterial>;

    for (const [key, recipe] of Object.entries(RECIPES)) {
      built[key] = instantiate(recipe, STATUS_DRIVEN.has(key as StatusDrivenMaterial));
    }
    for (const [key, recipe] of Object.entries(LED_RECIPES)) {
      // LED tidak ikut denyut status: denyut merah pada PCB sudah cukup
      // sebagai penanda, dan LED ikut denyut akan membuat komponen berkedip dua kali.
      built[key] = instantiate(recipe, false);
    }
    for (const [key, recipe] of Object.entries(LED_SOFT_RECIPES)) {
      built[key] = instantiate(recipe, false);
    }

    return built as HardwareMaterials;
  }, []);

  useEffect(() => {
    const list = Object.values(materials);
    return () => {
      for (const material of list) material.dispose();
    };
  }, [materials]);

  return materials;
}
