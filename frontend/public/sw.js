/*
 * Service worker Greenhouse - PWA offline (F3.5).
 *
 * Ditulis tangan tanpa Workbox atau dependency lain, sesuai batasan proyek.
 * Strateginya sengaja konservatif: yang di-cache hanya shell aplikasi dan
 * aset build yang namanya sudah ber-hash.
 *
 * Aturan yang tidak boleh dilanggar:
 * 1. TIDAK PERNAH cache request ke /api atau /socket.io. Data sensor milik
 *    pengguna dan dilindungi token. Membocorkannya lewat Cache Storage
 *    berarti data monitor tersimpan di perangkat tanpa kontrol kita.
 * 2. TIDAK cache /media. Video intro berukuran besar dan memakai
 *    Range request yang tidak kompatibel dengan cache penuh.
 * 3. Hanya GET same-origin yang boleh disentuh.
 */

/** Naikkan setiap kali isi shell berubah agar cache lama dibuang. */
const VERSION = 'v1';
const SHELL_CACHE = `greenhouse-shell-${VERSION}`;
const ASSET_CACHE = `greenhouse-assets-${VERSION}`;
const CURRENT_CACHES = new Set([SHELL_CACHE, ASSET_CACHE]);

const SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon.svg',
  '/icons/maskable.svg',
];

/** Prefix yang wajib selalu ke jaringan, tanpa kecuali. */
const NEVER_CACHE = ['/api/', '/socket.io/'];

/** Aset besar yang tidak layak disimpan di Cache Storage. */
const SKIP_PATHS = ['/media/'];

/** Aset build Vite: namanya ber-hash, jadi aman diambil dari cache dulu. */
const HASHED_ASSET = /^\/assets\/.+\.[0-9a-zA-Z_-]{8,}\.(js|css|woff2?|png|jpg|svg|webp)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll bersifat atomik: satu file 404 membatalkan seluruh install dan
      // aplikasi tidak pernah punya service worker aktif. Karena itu tiap file
      // ditambahkan satu per satu agar satu aset yang hilang tidak mematikan
      // offline untuk aset lain.
      await Promise.all(
        SHELL_FILES.map(async (path) => {
          try {
            await cache.add(new Request(path, { cache: 'reload' }));
          } catch {
            // Lewati aset yang tidak tersedia, sisanya tetap dipakai offline.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith('greenhouse-') && !CURRENT_CACHES.has(name)).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** True kalau request ini tidak boleh dilayani dari cache sama sekali. */
function isExcluded(url) {
  return NEVER_CACHE.some((prefix) => url.pathname.startsWith(prefix)) ||
    SKIP_PATHS.some((prefix) => url.pathname.startsWith(prefix));
}

/** True kalau respons ini aman disimpan (tidak error, tidak opaque). */
function isCacheable(response) {
  return response && response.status === 200 && response.type === 'basic';
}

/**
 * Navigasi: coba jaringan dulu supaya user cepat dapat versi terbaru, lalu
 * jatuh ke shell yang tersimpan saat offline. SPA ini punya banyak route di
 * satu index.html, jadi fallback-nya selalu '/index.html', bukan URL asli.
 */
async function handleNavigate(request) {
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    const cached = (await caches.match('/index.html')) || (await caches.match('/'));
    return cached || Response.error();
  }
}

/** Aset ber-hash: sajikan dari cache dulu, jaringan hanya untuk yang belum ada. */
async function handleHashedAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheable(response)) {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

/**
 * Aset lain (font, gambar statis): sajikan dari cache lalu perbarui di
 * belakang. Rollup Vite memberi hash pada filename, jadi aset lama yang
 * menggantung tidak merusak tampilan.
 */
async function handleStaleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (isCacheable(response)) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isExcluded(url)) return;

  // Request ber-token tidak pernah masuk cache: Cache Storage tidak memahami
  // Authorization, jadi aman dari sisi aksesibilitas tapi tetap salah secara semantik.
  if (request.headers.has('authorization')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(request));
    return;
  }

  if (HASHED_ASSET.test(url.pathname)) {
    event.respondWith(handleHashedAsset(request));
    return;
  }

  event.respondWith(handleStaleWhileRevalidate(request));
});

/*
 * Pesan dari halaman: saat ada versi baru, izinkan SW baru langsung aktif
 * supaya pengguna tidak terjebak di versi lama sampai semua tab ditutup.
 */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
