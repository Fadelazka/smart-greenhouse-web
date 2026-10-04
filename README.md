# Smart IoT Greenhouse

Dashboard monitoring dan kontrol greenhouse berbasis ESP32, dengan broker MQTT,
backend Node.js, dan antarmuka React.

```
frontend/   React 19 + Vite 7 + Tailwind 4   (port 5173)
backend/    Express + Socket.io + Aedes      (port 3001)
simulator/  Simulasi ESP32 via MQTT          (port 1883)
```

## Menjalankan

```bash
npm install
npm run dev
```

`npm run dev` menjalankan semuanya dalam urutan yang benar: broker MQTT siap
dulu (menunggu port 1883), lalu backend (menunggu `/api/health`), lalu simulator
dan frontend. Semua log digabung dengan prefix warna, dan Ctrl+C menutup
seluruhnya.

Selesai, buka http://localhost:5173

| Akun    | Email                      | Kata sandi |
| ------- | -------------------------- | ---------- |
| Admin   | `admin@greenhouse.local`   | `admin123` |
| Operator| `operator@greenhouse.local`| `operator123` |

### Menjalankan manual (terminal terpisah)

```bash
npm run dev:broker     # terminal 1 - broker MQTT + status di :9001
npm run dev:backend    # terminal 2 - REST + Socket.io
npm run dev:simulator  # terminal 3 - perangkat virtual
npm run dev:frontend   # terminal 4 - dashboard
```

Menghentikan semua yang tertinggal:

```bash
npm run dev:stop
```

## Perintah lain

```bash
npm run typecheck      # backend + simulator + frontend
npm run build          # bundle produksi
npm run db:setup       # buat schema TimescaleDB (perlu SUPABASE_DB_URL)
npm run db:seed        # seed user admin + operator
```

## Konfigurasi

Salin `.env.example` menjadi `.env` di masing-masing workspace lalu sesuaikan.
Nilai default sudah cukup untuk mode development: broker Aedes berjalan lokal dan
database memakai fallback in-memory + `backend/.data/fallback.json`.

Untuk Supabase, isi `SUPABASE_DB_URL` di `backend/.env`, lalu jalankan
`npm run db:setup` dan `npm run db:seed`.

## Topik MQTT

| Topik                     | Arah              | Isi                        |
| ------------------------- | ----------------- | -------------------------- |
| `greenhouse/telemetry`    | ESP32 ke broker   | Sensor + status aktuator   |
| `greenhouse/status`       | ESP32 ke broker   | Online/offline, firmware   |
| `greenhouse/cmd`          | broker ke ESP32   | Perintah aktuator, mode    |
| `greenhouse/config`       | broker ke ESP32   | Threshold + kalibrasi      |

ESP32 mengambil keputusan auto secara mandiri. Backend hanya mengirim threshold
dan mencatat override manual beserta waktu berakhirnya.

## Dokumentasi

`PLANNING.md` berisi rencana lengkap: arsitektur, skema database, design token,
dan pembagian fase.