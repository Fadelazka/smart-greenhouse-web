# PLANNING — Smart IoT Greenhouse

> **Dokumen perencanaan (FASE PLANNING ONLY — belum ada kode ditulis).**
> Website dashboard monitoring & kontrol untuk greenhouse berbasis ESP32.
> Tanggal: 2026-10-01 · Target: demo skripsi/laboratorium · Deployment: lokal dulu

---

## 0. RINGKASAN KEPUTUSAN (hasil konfirmasi dengan stakeholder)

| Pertanyaan | Keputusan | Alasan |
|---|---|---|
| Sumber data ESP32 | **Simulator MQTT (Node script)** | Broker + kredensial asli belum ada. Simulator meniru payload ESP32; ganti ke hardware = ubah 1 env var. |
| Database | **PostgreSQL + TimescaleDB (Supabase free tier)** | Time-series query jauh lebih kuat untuk grafik history. Tidak butuh Docker. |
| Broker MQTT | **Aedes, embedded di backend** | Zero install. Ganti ke Mosquitto/EMQX Cloud cukup ubah env var. |
| Bahasa UI | **Bahasa Indonesia** | Konsisten dengan dokumen & audiens proyek. Istilah teknis tetap English. |
| Aset 3D & ikon | **100% prosedural / SVG buatan sendiri** | Nol masalah lisensi, nol dependency aset berbayar. |
| Jumlah zona | **Satu greenhouse / satu ESP32** | Fokus ke kualitas demo, bukan multi-tenancy. |
| Auth | **JWT + 2 role (admin / operator)** | Kontrol aktuator tidak boleh terbuka untuk siapa pun. |
| Otak auto-mode | **ESP32 yang memutuskan** | Greenhouse tetap hidup walau server mati. Ini benar secara IoT. |
| Hero visual | **100% prosedural, tema greenhouse** | Video reference hanya dipakai sebagai referensi *irama pacing*, bukan gaya visual. |
| Deployment | **Lokal dulu**, Vercel/Railway menyusul | Fokus bikin jalan & stabil di localhost. |

**Pemisahan tanggung jawab yang penting:** karena **ESP32 yang memutuskan** logika auto-mode, backend **tidak** mengirim perintah berulang. Backend hanya mengirim (a) *set-point*/threshold, (b) *manual override* berumur waktu, (c) *restart*. Semua keputusan "pompa nyala / kipas nyala" terjadi di firmware dan hanya dilaporkan balik lewat telemetry.

---

## 1. ANALISIS KEBUTUHAN

### 1.1 User Persona

| Persona | Peran | Konteks pemakaian | Kebutuhan utama | Kebiasaan teknis |
|---|---|---|---|---|
| **P1 — Petani Hobi (Rina)** | Pemilik rumah, non-teknis | Cek HP 2-3x sehari sambil melihat kebun | Angka besar yang langsung terbaca, status "sehat/tidak", notifikasi kalau ada yang salah | Mobile-first, akan pakai sambil berdiri di kebun |
| **P2 — Operator Lab (Dimas)** | Mahasiswa / operator praktikum | Bomosional 15–30 menit, butuh data untuk laporan | Grafik history 24 jam/7 hari, export CSV, bandingkan dengan threshold | Laptop, monitor besar, export sering |
| **P3 — Teknisi / Admin (Pak Rudi)** | Administrator sistem | Jarang, tapi kritis: kalibrasi & recovery | Kalibrasi offset sensor, restart device, lihat log lengkap, ubah threshold global | Desktop, tidak mempedulikan estetika, cares fungsi benar |

### 1.2 User Journey

**Alur utama — dari buka web sampai kontrol alat:**

```
1. Buka web → Hero Landing (animasi greenhouse hidup)
        ↓ CTA "Masuk ke Dashboard"
2. Halaman Login (JWT)
        ↓
3. Dashboard → kartu sensor langsung terisi nilai real-time
        ↓ user melihat "humTanah 28% - di bawah batas 40%"
4. Klik kartu humTanah → panel geser → buka Detail/Threshold
        ↓
5. Ubah threshold ATAU klik toggle "Mode Manual"
        ↓
6. Klik tombol aktuator (Pompa / Kipas / Lampu)
        ↓ user melihat konfirmasi "Override 60 detik?"
7. Optimistic update → UI berubah instan
        ↓
8. Tunggu telemetry berikutnya (1–3 detik) → konfirmasi visual "terverifikasi"
        ↓
9. Buka Timeline Log → lihat batang tanaman tumbuh, daun per event
        ↓
10. (P2/P3) Export CSV history atau ubah pengaturan
```

**Alur alternatif - P3 kalibrasi:** Settings → Kalibrasi Sensor → masukkan nilai pembanding → backend tulis `greenhouse/cmd` → ESP32 balas offset terpasang.

**Titik lemah yang harus diperkuat:**
- P1 membuka di HP dengan sinyal jelek → harus ada mode read-only/offline yang jelas
- P1 tidak paham "threshold" → label Bahasa Indonesia + preview dampak
- Kontrol aktuator bisa salah diklik → **wajib konfirmasi untuk manual override**

### 1.3 Masalah yang Ingin Diselesaikan

| # | Masalah | Solusi di website ini | Persona |
|---|---|---|---|
| M1 | Petani harus datang fisik untuk cek kondisi tanaman | Nilai sensor real-time + status "sehat/perlu perhatian" di layar depan | P1 |
| M2 | Tidak ada history → tidak bisa analisis pola | Grafik time-series 24 jam / 7 hari, export CSV | P2 |
| M3 | Siram/kipas manual terlambat → tanaman stres | Alert visual + log event saat threshold terlampaui | P1, P2 |
| M4 | Tidak jelas apakah alat nyala atau mati | Panel kontrol dengan status real-time + verifikasi | P1, P3 |
| M5 | Tidak ada jejak audit → tidak tahu apa yang diubah | Timeline Log + aktivitas (siapa, kapan, ubah apa) | P2, P3 |
| M6 | Sensor bisa meleset → keputusan salah | Kalibrasi offset per sensor | P3 |
| M7 | Website dashboard biasa terasa kaku, tidak merepresentasikan greenhouse | UI hidup: animasi organik, visual daun/air/cahaya | semua |

---

## 2. ARSITEKTUR SISTEM

### 2.1 Diagram Alur Data

```
┌─────────────────────────────┐
│  ESP32 (hardware)           │      ← developed
│  atau SIMULATOR (dev)       │         (mqtt-publisher script)
└──────────────┬──────────────┘
               │ MQTT publish (JSON)
               ▼
┌─────────────────────────────────────────────┐
│  BROKER MQTT:  Aedes  (embedded di backend) │
│  port 1883 (TCP)  +  port 9001 (WebSocket) │
│  Topik: greenhouse/#                        │
└──────────────┬──────────────────────────────┘
               │ subscribe
               ▼
┌─────────────────────────────────────────────┐
│  BACKEND  Node.js + Express                  │
│                                             │
│  ┌────────────┐  ┌───────────┐  ┌────────┐ │
│  │ MQTT ingest│→ │ DB writer │  │ Rules  │ │
│  │ (aedes)    │  │ (batch)   │  │ Alert  │ │
│  └────────────┘  └─────┬─────┘  └────┬───┘ │
│                        │              │     │
│  ┌─────────────────────┴──────────────┘     │
│  │  REST /api  (auth, history, export, ctrl)│
│  │  Socket.io  (push live ke frontend)      │
│  └──────────────┬──────────────────────────┘
└─────────────────┼───────────────────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
┌────────────────┐  ┌──────────────────┐
│ Supabase       │  │ FRONTEND         │
│ PostgreSQL +   │  │ React + Vite     │
│ TimescaleDB    │  │ :5173            │
│ (read/write)   │  │                  │
└────────────────┘  └──────────────────┘
```

**Dual-write flow untuk satu tick sensor:**
1. ESP32/simulator publish JSON ke `greenhouse/telemetry`
2. Aedes menerima → backend parse & validasi (Zod)
3. Backend insert ke TimescaleDB hypertable `sensor_readings`
4. Backend cek threshold → jika abnormal, buat `alerts` + `activity_logs`
5. Backend broadcast ke semua client Socket.io (`telemetry:update`)
6. Frontend update kartu sensor **tanpa reload** (zustand store)

### 2.2 Penjelasan Protokol Komunikasi

| Protokol | Dipakai Untuk | Arah | Port | Kenapa |
|---|---|---|---|---|
| **MQTT** | Telemetry sensor + command aktuator | Dua arah | 1883 (TCP) | Ringan, standar IoT, cocok untuk perangkat terbatas & jaringan tidak stabil. Payload kecil, hemat bandwidth. Retained message + LWT untuk status. |
| **WebSocket (Socket.io)** | Push data live ke browser | Server → Client | 3001 | WebSocket murni tapi Socket.io punya **auto-reconnect**, **fallback HTTP long-poll**, dan **room** — penting karena jaringan WiFi greenhouse sering putus. |
| **REST** | Auth, query history, export CSV, settings | Client ⇄ Server | 3001 | Sederhana, mudah di-cache, mudah dipakai tool lain (curl/Postman) untuk demo. |
| **MQTT over WebSocket** | Opsional, untuk ESP32 yang hanya punya WiFi | Dua arah | 9001 | Port dibiarkan terbuka untuk fleksibilitas nanti. |

**Kenapa bukan WebSocket langsung dari ESP32?** Karena ESP32 yang "sudah jadi" dan protokol yangPrompt sebut adalah MQTT. Menambah Socket.io di firmware = kerjaan besar. MQTT → backend → Socket.io adalah pola **anti-corruption layer** yang standar.

### 2.3 Kontrak Payload MQTT

**`greenhouse/telemetry`** (publish ESP32/simulator setiap 2 detik)
```json
{
  "ts": "2026-10-01T10:26:07.000Z",
  "deviceId": "esp32-greenhouse-01",
  "suhu": 28.4,
  "humUdara": 72.1,
  "humTanah": 38.5,
  "rssi": -58,
  "mode": "auto"
}
```

**`greenhouse/status`** (retained — menandai perangkat online/offline)
```json
{
  "ts": "2026-10-01T10:26:05.000Z",
  "status": "online",
  "firmware": "1.0.0",
  "uptime": 86400
}
```

**`greenhouse/cmd`** (publish backend, subscribe ESP32)
```json
{
  "ts": "2026-10-01T10:26:07.000Z",
  "pump": "off",
  "fan": "auto",
  "light": "on",
  "overrideUntil": "2026-10-01T10:27:07.000Z",
  "issuedBy": "admin"
}
```

**`greenhouse/config`** (publish backend — threshold & kalibrasi)
```json
{
  "suhu":      { "min": 18, "max": 32 },
  "humUdara":  { "min": 50, "max": 85 },
  "humTanah":  { "min": 40, "max": 75 },
  "calibration": { "suhu": -0.5, "humUdara": 1.2, "humTanah": -2.0 }
}
```

**`greenhouse/alerts`** (publish backend, log internal)

**Topik MQTT (lengkap):**

| Topik | Arah | Retained | Keterangan |
|---|---|---|---|
| `greenhouse/telemetry` | ESP32 → everyone | ❌ | Data sensor periodik |
| `greenhouse/status` | ESP32 → everyone | ✅ | Online/offline, dipesan sekali saat boot |
| `greenhouse/cmd` | Backend → ESP32 | ❌ | Perintah aktuator & override |
| `greenhouse/config` | Backend → ESP32 | ✅ | Threshold & kalibrasi, dipesan ulang saat reconnect |

### 2.4 Struktur Folder & File

```
smart-greenhouse-web/
├── PLANNING.md                    ← dokumen ini
├── README.md
├── package.json                   ← root scripts (dev orchestration)
├── .env.example                   ← template semua env var
├── .gitignore
│
├── frontend/                      ← React + Vite  (port 5173)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── public/
│   │   └── favicon.svg
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css              ← design tokens (CSS variables)
│       ├── pages/
│       │   ├── Landing.tsx
│       │   ├── Login.tsx
│       │   ├── Dashboard.tsx
│       │   ├── Visualization3D.tsx
│       │   ├── TimelineLog.tsx
│       │   └── Settings.tsx
│       ├── components/
│       │   ├── layout/            ← Navbar, Footer, PageShell
│       │   ├── sensor/            ← SensorCard, SparkLine, ValueCountUp, StatusBadge
│       │   ├── control/           ← ActuatorToggle, ThresholdSlider, OverrideConfirm
│       │   ├── chart/             ← LiveAreaChart, LeafTooltip, ThresholdBand
│       │   ├── three/             ← GreenhouseScene, PlantMesh, OrbitRig
│       │   ├── fx/                ← FogCanvas, LeafParticles, LightRays, ScrollRoots
│       │   └── ui/                ← hasil shadcn/ui
│       ├── hooks/
│       │   ├── useSocket.ts
│       │   ├── useCountUp.ts
│       │   ├── useReducedMotion.ts
│       │   └── useLiveSensor.ts
│       ├── lib/
│       │   ├── socket.ts
│       │   ├── api.ts             ← fetch wrapper + auth header
│       │   ├── utils.ts           ← cn()
│       │   └── constants.ts
│       ├── store/                 ← Zustand slices
│       │   ├── sensorStore.ts
│       │   ├── controlStore.ts
│       │   └── authStore.ts
│       ├── types/
│       └── types/…                ← shared types (mirror backend)
│
├── backend/                       ← Node + Express  (port 3001)
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   └── src/
│       ├── index.ts               ← entry: HTTP + Socket.io + Aedes
│       ├── config/env.ts          ← validasi env (Zod)
│       ├── db/
│       │   ├── schema.ts          ← Drizzle schema + Timescale hypertable
│       │   ├── client.ts
│       │   └── seed.ts
│       ├── mqtt/
│       │   ├── broker.ts          ← Aedes instance
│       │   └── handlers.ts        ← subscribe + parse + validate
│       ├── realtime/
│       │   └── socket.ts          ← Socket.io setup + broadcast
│       ├── routes/
│       │   ├── auth.routes.ts
│       │   ├── sensor.routes.ts
│       │   ├── control.routes.ts
│       │   ├── logs.routes.ts
│       │   └── settings.routes.ts
│       ├── middleware/
│       │   ├── auth.ts            ← JWT verify
│       │   ├── rbac.ts            ← admin vs operator
│       │   └── validate.ts
│       ├── services/
│       │   ├── telemetry.service.ts
│       │   ├── alert.service.ts
│       │   ├── control.service.ts
│       │   └── export.service.ts  ← CSV
│       └── utils/
│           └── logger.ts
│
├── simulator/                     ← dev only: fake ESP32
│   ├── package.json
│   └── src/
│       └── index.ts               ← publish telemetry periodik + noise realistis
│
└── docs/
    ├── mqtt-contract.md           ← kontrak payload (versi untuk firmware)
    └── screenshots/
```

### 2.5 Environment Variables

**`backend/.env`**

| Variabel | Contoh | Wajib | Keterangan |
|---|---|---|---|
| `NODE_ENV` | `development` | ✅ | Mode runtime |
| `PORT` | `3001` | ✅ | Port HTTP + Socket.io |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | ✅ | Koneksi Supabase |
| `SUPABASE_ANON_KEY` | `eyJhbGci...` | ✅ | Public API key |
| `SUPABASE_SERVICE_KEY` | `eyJhbGci...` | ✅ | Service role key (**server-only**) |
| `JWT_SECRET` | `<64-char random>` | ✅ | Tanda tangan token |
| `JWT_EXPIRES_IN` | `12h` | — | Masa berlaku token |
| `MQTT_BROKER_ENABLED` | `true` | ✅ | Nyalakan Aedes embedded |
| `MQTT_PORT` | `1883` | ✅ | Port MQTT TCP |
| `MQTT_WS_PORT` | `9001` | ✅ | Port MQTT WebSocket |
| `MQTT_USERNAME` | `greenhouse` | — | Kalau broker butuh auth |
| `MQTT_PASSWORD` | `<secret>` | — | Kalau broker butuh auth |
| `CORS_ORIGIN` | `http://localhost:5173` | ✅ | Allowlist origin |
| `ALERT_COOLDOWN_SEC` | `300` | — | Anti-spam alert |

**`frontend/.env`**

| Variabel | Contoh | Keterangan |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3001/api` | Base URL REST |
| `VITE_SOCKET_URL` | `http://localhost:3001` | Socket.io endpoint |
| `VITE_OPENWEATHER_KEY` | `<key>` | Cuaca (opsional, NICE TO HAVE) |
| `VITE_OPENWEATHER_CITY` | `Bandung` | Kota untuk cuaca |

**`simulator/.env`**

| Variabel | Contoh | Keterangan |
|---|---|---|
| `MQTT_URL` | `mqtt://localhost:1883` | Broker tujuan |
| `SIM_INTERVAL_MS` | `2000` | Interval publish telemetry |
| `SIM_DEVICE_ID` | `esp32-greenhouse-01` | ID perangkat |

---

## 3. TECH STACK FINAL

### 3.1 Frontend

| Layer | Pilihan | Alasan | Alternatif (kenapa tidak) |
|---|---|---|---|
| Framework | **React 19 + Vite** | Dashboard = SPA Interaktif, SSR tidak menambah nilai apa pun. Vite = dev server <50ms, build Rollup cepat. | Next.js: bagus untuk SEO/content marketing, tapi menambah server component, cache layer, dan kompleksitas tanpa manfaat untuk dashboard login-gated. |
| Styling | **Tailwind CSS v4** | Token-first, konsisten dengan design system, hapus file CSS besar. `className` inline = refactor aman. | CSS Modules: butuh file per komponen, lambat untuk sistem desain besar. |
| Komponen dasar | **shadcn/ui** | Kode komponen masuk ke repo (bukan dependency black-box), bisa dimodifikasi ke gaya "glass greenhouse". Berbasis Radix UI = aksesibilitas sudah benar. | MUI: tema defaultnya materialize/erlopa, banyak override. |
| Animasi UI | **Framer Motion** | Declarative, `AnimatePresence` untuk enter/exit, sangat cocok untuk transisi kartu & modal. | CSS murni: cepat tapi state management spring jadi ribet. |
| Animasi scroll/timeline | **GSAP + ScrollTrigger + Flip** | ScrollTrigger punya `scrub`, pinning, dan `matchMedia` — tidak ada padanan di Framer Motion. Flip untuk layout transition. | Framer Motion `useScroll`: cukup untuk parallax sederhana, tapi berat untuk timeline yang panjang. |
| Ilustrasi | **Lottie** | Animasi vektor ringan untuk ikon kipas/kran berputar. | GIF: 5–10x lebih besar, tidak bisa diwarnai, jerky. |
| 3D | **React Three Fiber + drei** | Declarative, integrasi React & Zustand mulus. Greenhouse bisa dibangun dari primitive tanpa file model. | Three.js murni: manual manage lifecycle, mudah memory leak. |
| Grafik | **Recharts** | Ringan, komponen React native, mudah di-style SVG. Cocok untuk area streaming & threshold band. | ApexCharts: sedikit lebih cepat, tapi styling SVG-nya kaku. Chart.js: imperative, tidak enak di React. |
| Partikel | **@tsparticles/react** | Leaf-shaped particles, `canvas` renderer, bundle manageable. |anime.js: tidak punya sistem partikel. |
| Background dinamis | **Canvas 2D custom (bukan Vanta.js)** | **Vanta.js butuh WebGL + vendor key + aset**; bertentangan dengan keputusan "100% prosedural tanpa aset". Efek yang sama (kabut bergerak) bisaachievement 60fps dengan canvas 2D sederhana. | Vanta.js: gorgeous tapi_coords proprietary, WebGL berat, tidak bisa di-style ke palet hijau dengan mudah. |
| State | **Zustand** | Ringan, tanpa boilerplate, selector granular → komponen sensor tidak re-render semua saat 1 nilai berubah. | Redux Toolkit: powerful tapi verbose untuk state yang sesederhana ini. |
| Real-time | **Socket.io-client** (dari backend) | Auto-reconnect + fallback. **MQTT.js langsung dari browser = anti-pattern** (butuh broker publik dan credentials bocor di bundle). | MQTT.js di browser: dipakai HANYA untuk debug/devtools, bukan produksi. |

### 3.2 Backend

| Layer | Pilihan | Alasan | Alternatif |
|---|---|---|---|
| Runtime | **Node.js 24 + Express 5** | Satu bahasa dengan frontend (TypeScript_end-to-end), ecosystem MQTT & Socket.io paling matang. | Fastify: sedikit lebih cepat, tapi ekosistem Socket.io + Express middleware lebih banyak. |
| Broker MQTT | **Aedes 0.5x (embedded)** | **Zero install** — `npm i` saja, langsung jalan di proses Node. Cocok untuk dev & skripsi. Migrasi ke EMQX Cloud/Mosquitto = ubah `MQTT_URL`. | Mosquitto (winget): production-grade tapi perlu install + config + service Windows. HiveMQ/EMQX Cloud: perlu akun, cocok untuk production nanti. |
| Database | **PostgreSQL + TimescaleDB (Supabase)** | Hypertable untuk data sensor (partitioning otomatis per waktu), `time_bucket()` untuk agregasi grafik, tanpa upkeep. Free tier cukup untuk data skripsi. | SQLite: cepat & zero-setup, tapi tidak punya time-series primitives. MongoDB: tidak punya range-query composite seefisien ini. |
| ORM | **Drizzle ORM** | Type-safe penuh, SQL-like (bisa lihat query aslinya), ringan, migrasi jelas. | Prisma: lebih ergonomis tapi engine binary & cold start lambat di serverless. |
| Auth | **JWT + bcrypt + RBAC middleware** | Stateless, mudah di-scale, standard untuk dashboard. 2 role memenuhi kebutuhan. | Session cookie: lebih aman teoretis, tapi butuh shared store. Firebase Auth: menambah dependency & setup RLS. |
| Export | **`json2csv` atau generator manual** | Ekspor riwayat jadi CSV untuk laporan skripsi. | ExcelJS: bisa, tapi 200KB dependency untuk kebutuhan sederhana. |
| Validation | **Zod** | Satu skema untuk validasi env, payload MQTT, dan request body. TypeScript type = free inference. | Joi:verbose, tidak infer types. |
| Deployment | **Railway/Render (backend) + Vercel (frontend)** — NANTI | Backend butuh persistent process (Aedes) → Railway. Frontend static → Vercel. | ~~Sekarang~~: fokus localhost dulu. |

### 3.3 Arsitektur Sesi & Alur Data (ringkas)

```
ESP32/Simulator ──MQTT──▶ Aedes ──▶ Telemetry Handler ──▶ TimescaleDB
                                    │                              │
                                    │                         Alert Service
                                    ▼                              │
                            Socket.io Broadcast ◀──────────────────┘
                                    │
                                    ▼
                            Frontend (zustand) → UI re-render
```

---

## 4. DAFTAR FITUR

### 4.1 MUST HAVE

| ID | Kategori | Fitur | Deskripsi | Input | Output | Dependency |
|---|---|---|---|---|---|---|
| **F1.1** | A | Live Sensor Cards | 4 kartu: suhu (matahari), humUdara (tetes air), humTanah (gundukan), status koneksi (sinyal WiFi) | Data MQTT `telemetry` | Nilai real-time, warna status, sparkline mini | MQTT, TimescaleDB, Socket.io |
| **F1.2** | A | Status Koneksi | Badge online/offline + `lastSeen` + latency | `status` topic + heartbeat | Badge anim + tooltip | MQTT |
| **F1.3** | A | Live Chart | Area chart streaming 3 sensor, 24 jam | Data telemetry (buffer 300 titik) | Grafik berdenyut + tooltip daun | Recharts, zustand |
| **F1.4** | B | Manual Actuator Control | 3 tombol: Pompa, Kipas, Lampu — dengan konfirmasi | Klik tombol + konfirmasi | Publish `greenhouse/cmd` | MQTT, REST |
| **F1.5** | B | Auto/Manual Mode | Toggle global mode | Klik switch | `cmd.mode` | MQTT |
| **F1.6** | B | Threshold Editor | 3 threshold min/max (suhu, humUdara, humTanah) | Slider / input | Publish `greenhouse/config` | MQTT, Drizzle |
| **F1.7** | C | Visual Alert | Glow/border merah saat nilai di luar threshold | Threshold vs telemetry | Card berdenyut + toast | F1.6 |
| **F1.8** | C | Activity Log | List aktivitas: siapa, kapan, apa yang diubah | Insert ke `activity_logs` | List reversed | Drizzle |
| **F1.9** | C | Auth (JWT) | Login dengan email+password, 2 role | Credentials | JWT token + role | Supabase, bcrypt |
| **F1.10** | A | Threshold Band di Grafik | Garis dashed min/max di atas chart | Threshold aktif | Band visual | F1.3 |

### 4.2 SHOULD HAVE

| ID | Kategori | Fitur | Deskripsi | Input | Output | Dependency |
|---|---|---|---|---|---|---|
| **F2.1** | A | History Range Picker | Ganti periode 1 jam / 6 jam / 24 jam / 7 hari | Select | Query `time_bucket()` | TimescaleDB |
| **F2.2** | C | Export CSV | Unduh riwayat sensor sebagai CSV | Button + range | File `.csv` | F2.1 |
| **F2.3** | D | Kalibrasi Sensor | Offset per sensor (suhu −10…+10, kelembapan −20…+20) | Input angka | Publish `config.calibration` | MQTT |
| **F2.4** | D | Restart Device | Kirim perintah restart ke ESP32 | Button + confirm | Publish `cmd.restart` | MQTT |
| **F2.5** | C | Alert Toast + Sound | Notifikasi saat threshold terlampaui | Event alert | Toast + bunyi | F1.7 |
| **F2.6** | A | Loading & Error State | Skeleton saat loading, pesan error jelas | Network state | Skeleton / error card | shadcn/ui |
| **F2.7** | A | Reduced Motion Support | Hormati `prefers-reduced-motion` | Media query | Animasi dimatikan | — |

### 4.3 NICE TO HAVE

| ID | Kategori | Fitur | Deskripsi | Input | Output | Dependency |
|---|---|---|---|---|---|---|
| **F3.1** | — | Visualisasi 3D Greenhouse | Scene 3D greenhouse + tanaman, hover bed → tooltip | Data telemetry | Scene interaktif | R3F |
| **F3.2** | A | Cuaca Real-time | Overlay cuaca lokal di background | OpenWeatherMap API | Ikon + suhu | F3 API key |
| **F3.3** | A | Day/Night Cycle | Background berubah sesuai jam asli | Jam lokal | Gradien berubah | — |
| **F3.4** | C | Notifikasi Telegram | Kirim alert ke Telegram | Webhook | Pesan Telegram | Bot token |
| **F3.5** | — | PWA Offline | Cache app shell, tampilkan data terakhir | Service worker | Installable app | vite-plugin-pwa |
| **F3.6** | A | Multi-Sensor Compare | Bandingkan 2 periode di satu grafik | 2 range | Grafik ganda | F2.1 |

---

## 5. STRUKTUR HALAMAN & NAVIGASI

### Navigasi Utama

```
┌────────────────────────────────────────────────────────┐
│ 🌿 Smart Greenhouse   [Beranda][Dashboard][3D][Log][⚙]  │
└────────────────────────────────────────────────────────┘
        (desktop: horizontal)  (mobile: hamburger → drawer)
```

- **Navbar melayang** (fixed, glass) dengan blur — auto-hide saat scroll down, muncul lagi saat scroll up.
- Indikator halaman aktif: garis bawah animasi tumbuh dari kiri (`scaleX` 0→1).
- Menu responsive: mobile → drawer slide-in dari kanan (Framer Motion).
- Logout di avatar dropdown (k kanan atas).

#### 5.1 Halaman 1 — Landing / Hero

```
┌──────────────────────────────────────────────────┐
│  [Canvas: kabut + tetes kondensasi + berkas cahaya]│
│                                                  │
│              🌿 Smart Greenhouse                 │
│     "Kendalikan rumah hijau Anda                 │
│            dari ujung jari."                     │
│                                                  │
│         [Masuk ke Dashboard →]                   │
│                                                  │
│              ⌄ (akar tanaman)                     │
└──────────────────────────────────────────────────┘
   ░░░ 3 stat strip: "24/7 Monitor" "3 Sensor" "Real-time"
```

**Layout:** full-viewport, konten center-aligned di tengah atas. Latar = canvas greenhouse prosedural (bukan video).
**Hierarki:** Heading (72px) → Subheading (20px) → CTA button → scroll indicator. Kontras tinggi di atas latar gelap.
**Scroll indicator:** SVG akar tanaman yang tumbuh berulang (`strokeDashoffset`).

#### 5.2 Halaman 2 — Dashboard

```
┌────────────────────────────────────────────────────────────┐
│  Status: 🟢 Online · 2s lalu          [Mode: AUTO] [Logout]│
├────────────────────────────────────────────────────────────┤
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                      │
│  │  ☀️   │ │  💧  │ │  ⛰️   │ │  📶  │  ← 4 kartu sensor  │
│  │ 28.4°│ │ 72.1%│ │ 38.5%│ │Online│     (grid 4 kolom)  │
│  │spark │ │spark │ │spark │ │ RSSI │                      │
│  └──────┘ └──────┘ └──────┘ └──────┘                      │
├────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────┐ ┌────────────────────┐  │
│  │                             │ │  PANEL KONTROL     │  │
│  │      LIVE AREA CHART        │ │                    │  │
│  │   (3 sensor, threshold band)│ │  🚿 Pompa   [ON ]  │  │
│  │                             │ │  🌀 Kipas   [AUTO] │  │
│  │                             │ │  💡 Lampu   [OFF]  │  │
│  │  [1j][6j][24j][7h]          │ │                    │  │
│  └─────────────────────────────┘ │  ⚙ Threshold       │  │
│                                 │  📥 Export CSV      │  │
├─────────────────────────────────────────────────────────────┤ │
│  ⚠ Alert banner (jika ada) / ⓘ "Semua normal"            │ │
└────────────────────────────────────────────────────────────┘
```

**Layout:** grid 12 kolom. Kartu sensor full-width baris atas (4 kolom masing-masing). Bawah: grafik 8 kolom + panel kontrol 4 kolom.
**Hierarki:** kartu sensor (data primer, paling besar) → grafik (konteks) → kontrol (aksi, sticky di kanan).
**Responsif:** <1024px → panel kontrol pindah ke bawah grafik, kartu jadi 2×2. <768px → kartu jadi 1 kolom (atau horizontal scroll snap).

#### 5.3 Halaman 3 — Visualisasi 3D

```
┌──────────────────────────────────────────────────┐
│  [3D Greenhouse Scene — orbit kursor]            │
│                                                  │
│        🏠 Greenhouse 3D (procedural)            │
│        Bed 1 · Bed 2 · Bed 3                      │
│                                                  │
├──────────────────────────────────────────────────┤
│  Legenda: 🌡️ 28.4°C  💧 72%  🪴 38%  |  Reset view │
└──────────────────────────────────────────────────┘
```

**Layout:** canvas 3D full-screen, panel legenda mengambang di bawah. Kontrol orbit (drag = putar, scroll = zoom, right-drag = pan).
**Interaksi:** hover bed tanaman → tooltip sensor (posisi mouse). Click bed → highlight + expand detail.
**3D Scene dibangun dari:** Box (rangka greenhouse), Plane (alas tanah), Cylinder (pot), Sphere/InstancedMesh (daun tanaman), semua dari primitive — tanpa file model.

#### 5.4 Halaman 4 — Timeline / Log

```
┌──────────────────────────────────────────────────┐
│  📜 Timeline Aktivitas   [filter: semua|tipe|user]│
│                                                  │
│  │ 🌿● Pompa dinyalakan           10:26  oleh auto │
│  │   │                            [hapus]        │
│  │ 🌿● Suhu melewati batas atas    10:21  ⚠ alert  │
│  │   │                                            │
│  │ 🌿● Kelembaban tanah naik       10:15  oleh Rina│
│  │   │                                            │
│  │ ● (entry berikutnya muncul)                    │
└──────────────────────────────────────────────────┘
```

**Layout:** timeline vertikal di kiri, batang tumbuh ke bawah, entry di kanan batang.
**Konsep:** setiap log entry = satu ruas batang yang memanjang + sehelai daun yang tumbuh di ujungnya.
**Interaksi:** scroll → batang tumbuh progressive. Filter chips di atas. Load more saat scroll ke bawah.

#### 5.5 Halaman 5 — About & Settings

```
┌──────────────────────────────────────────────────┐
│  Pengaturan & Tentang Sistem                    │
├──────────────────────────────────────────────────┤
│  👤 Profil  (nama, email, role badge)           │
├──────────────────────────────────────────────────┤
│  🎯 Kalibrasi Sensor  (3 offset input)  [Simpan] │
├──────────────────────────────────────────────────┤
│  🚀 Perangkat  (status, uptime, [Restart Device])│
├──────────────────────────────────────────────────┤
│  🔑 Keamanan  (ganti password)                  │
├──────────────────────────────────────────────────┤
│  ℹ️ Tentang  (deskripsi proyek, versi firmware)  │
└──────────────────────────────────────────────────┘
```

**Layout:** accordion card, satu section per groupings, collapsible. Hanya `admin` yang melihat & bisa memakai Kalibrasi + Restart.

#### 5.6 Transisi Antar Halaman

- Route change → Framer Motion `AnimatePresence`: halaman lama fade+scale 0.98 keluar (200ms), halaman baru fade+slide 12px masuk (300ms).
- Konten halaman stagger-in: setiap section `y: 12 → 0`, stagger 0.06s.

---

## 6. DESIGN SYSTEM

### 6.1 Palet Warna

**Dasar — "Greenhouse Malam"** (background gelap kehijauan, aksen hijau daun, detail tanah/air/matahari):

| Peran | Nama | HEX | Dipakai untuk |
|---|---|---|---|
| Background | Deep Forest | `#0F1F1A` | Background global (halaman) |
| Background alt | Night Canopy | `#0B1512` | Latar terdalam, footer |
| Surface / Card | Leaf Slate | `#1B2A22` | Glass card, panel |
| Surface raised | Moss Surface | `#23342A` | Card hover, input field |
| Primary | Canopy Green | `#22C55E` | Aksen utama, CTA, "healthy" |
| Primary hover | Deep Fern | `#16A34A` | Hover state |
| **Coklat tanah** | **Soil Brown** | **`#92400E`** | Baseline grafik, aksen tanah, card humTanah |
| Coklat muda | Loam Light | `#B45309` | Varian coklat untuk gradient |
| **Biru air** | **Water Blue** | **`#0EA5E9`** | Aksen air, card humidity, link |
| **Kuning matahari** | **Sunlight Yellow** | **`#FACC15`** | Aksen cahaya, card suhu, glow |
| Violet (opsional) | Bloom Violet | `#8B5CF6` | Aksen keempat (indeks grafik) |
| Foreground | Leaf White | `#F0FDF4` | Teks utama |
| Muted FG | Sage Grey | `#94A3B8` | Teks sekunder |
| Border | Glass Border | `rgba(240,253,244,0.12)` | Border card/garis |
| Destructive | Alert Red | `#EF4444` | Error, nilai kritis |
| Warning | Caution Amber | `#F59E0B` | Nilai mendekati batas |
| Success | Fresh Green | `#22C55E` | Nilai normal |

**Aturan kontras:**
- Teks utama `#F0FDF4` pada `#0F1F1A` → rasio kontras **~16:1** (jauh di atas WCAG AA 4.5:1).
- `#94A3B8` pada `#0F1F1A` → **~6.5:1** (lolos AA untuk teks normal).
- Warna aksen (`#22C55E`, `#FACC15`, `#0EA5E9`) **tidak pernah** dipakai sebagai warna teks kecil di atas background gelap tanpaFCCheck; untuk status dipakai sebagai **border/background glow + ikon + label**, bukan teks Alone.
- **Warna tidak pernah satu-satunya penanda status** — selalu/icon + label teks ("Normal" / "Terlalu Kering" / "Terlalu Basah").

**Glassmorphism (khas):** `background: rgba(27,42,34,0.6)` + `backdrop-filter: blur(16px)` + `border: 1px solid rgba(240,253,244,0.12)` + shadow dalam lembut.

### 6.2 Tipografi

| Peran | Font | Fallback | Weight | Usage |
|---|---|---|---|---|
| **Heading** | **Outfit** | `'Segoe UI', system-ui, sans-serif` | 600, 700 | H1–H4, angka besar, CTA. Outfit punya geometri bulat & ramah — cocok untuk nuansa "hidup", bukan corporate kaku. |
| **Body** | **Inter** | `'Segoe UI', system-ui, sans-serif` | 400, 500 | Paragraf, label, teks UI |
| **Mono** | **JetBrains Mono** | `Consolas, 'Courier New', monospace` | 400, 500 | ID perangkat, payload JSON, timestamp, angka sensor presisi |

**Fluid type scale** (dengan `clamp()`):

| Token | Ukuran | Usage |
|---|---|---|
| `display` | `clamp(40px, 8vw, 72px)` | Hero H1 |
| `h1` | `clamp(28px, 4vw, 40px)` | Halaman title |
| `h2` | `24px` | Section title |
| `h3` | `18px` | Card title |
| `body` | `15px` | Teks normal |
| `small` | `13px` | Label, caption |
| `value` | `clamp(28px, 3vw, 40px)` | Angka sensor (tabular-nums) |

Semua font dimuat via `@fontsource/outfit`, `@fontsource/inter`, `@fontsource/jetbrains-mono` → **tidak ada request ke Google Fonts saat runtime** (privacy + kecepatan offline).

### 6.3 Spacing & Grid

**Spacing scale (4px base):** `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96` px → Tailwind: `p-1` (4) … `p-24` (96).

**Layout grid:**
- Desktop (≥1280px): 12 kolom, container max-width `1440px`, gutter `24px`.
- Tablet (768–1279px): 8 kolom, gutter `20px`.
- Mobile (<768px): 4 kolom, gutter `16px`, padding tepi `20px`.
- **Breakpoint**: Tailwind default (`sm 640, md 768, lg 1024, xl 1280, 2xl 1536`).

**Rhythm:** jarak antar section 48–64px. Jarak antar kartu dalam satu grup 16–20px.

### 6.4 Komponen UI Reusable

| Komponen | Base | Varian/custom greenhouse |
|---|---|---|
| **Button** | shadcn Button | `variant: glass` (default), `accent` (primary), `danger`; `size: sm/md/lg`; ripple effect saat klik |
| **Card** | shadcn Card | `variant: glass` — blur 16px, border tipis, hover lift 2px |
| **Slider** | shadcn Slider | Track warna hijau, thumb berbentuk tunas kecil, nilai tampil di atas |
| **Switch** | shadcn Switch | Track hijau saat aktif, animasi spring |
| **Toggle Group** | shadcn ToggleGroup | Segmented control untuk range chart (1j/6j/24j/7h) |
| **Modal/Dialog** | shadcn Dialog | Overlay blur, scale-in 0.95→1 |
| **Tooltip** | shadcn Tooltip | Kustom: bentuk **daun** untuk chart, bentuk **drop** untuk sensor |
| **Badge** | Custom | Status: online/offline, role, mode |
| **Skeleton** | shadcn Skeleton | `animate-pulse` untuk loading state |
| **Toast** | shadcn Sonner | Success/error/info, auto-dismiss 4s |
| **SensorCard** | Custom | Berisi shape (sun/drop/mound/wifi), angka, sparkline, glow abnormal |
| **ActuatorToggle** | Custom | Ikon mekanis (kran/kincir/lampu) + switch + status |

### 6.5 Icon Set

**`lucide-react`** — konsistensi stroke `1.75px`, size tokens `16/20/24/32`.

| Kebutuhan | Ikon Lucide |
|---|---|
| Suhu | `Thermometer` |
| Humidity | `Droplet`, `Droplets` |
| Tanah | `Mountain`, `Sprout` |
| Koneksi | `Wifi`, `WifiOff` |
| Pompa | `Waves`, `Droplet` (dengan custom faucet SVG) |
| Kipas | `Fan` |
| Lampu | `Lightbulb` |
| Nav | `LayoutDashboard`, `Box`, `ScrollText`, `Settings`, `Leaf` |
| Aksi | `Download`, `RefreshCw`, `Power`, `Save`, `LogOut` |
| Status | `CheckCircle2`, `AlertTriangle`, `XCircle`, `Info` |

Ikon **tidak pernah** pakai emoji sebagai struktur. Ikon dekoratif (di samping teks yang sudah menjelaskan) diberi `aria-hidden="true"`.

---

## 7. KONSEP ANIMASI & INTERAKSI

> Prinsip: **maksimal 1–2 elemen beranimasi utama per viewport.** Semua animasi menghormati `prefers-reduced-motion`. Semua durasi memakai **token bersama**, bukan angka acak per elemen.

### 7.1 Motion Tokens

| Token | Nilai | Usage |
|---|---|---|
| `duration-fast` | 150ms | Hover, color change |
| `duration-base` | 250ms | Toggle, tooltip, card hover |
| `duration-slow` | 400ms | Page transition, modal |
| `duration-entrance` | 600ms | Count-up, reveal |
| `ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Masuk |
| `ease-spring` | `spring(stiffness 300, damping 30)` | Toggle, pop |
| `ease-bounce` | `back.out(1.4)` | Daun, badge pop |

### 7.2 Hero / Landing

| Efek | Visual | Library | Implementasi |
|---|---|---|---|
| **Kabut bergerak** | Kabut hijau transparan yang bergeser kontinu | **Canvas 2D + requestAnimationFrame** | 3–5 ellipse semi-transparan digeser horizontal dengan kecepatan berbeda (`sin(t)` untuk divergensi). `ctx.filter = 'blur(40px)'`. Pause saat tab tidak aktif. |
| **Tetes kondensasi** | Tetes air jatuh lambat di kaca, sesekali bergulir | **Canvas 2D** | 20–40 tetes = lingkaran kecil, `y += speed`, reset ke atas; sesekali satu tetes "bergulir" (kecepatan horizontal kecil + wiggle). |
| **Berkas cahaya** | 3–5 berkas cahaya mintuning dari atas, bergerak pelan | **Canvas 2D** | Gradien linear transparan, dirotasiZy `-18°`, dianimasikan `offsetX` sinusoid. `globalCompositeOperation = 'screen'`. |
| **Dedaunan bergoyang** | Daun hijau sungguhan bergoyang di tepi bawah | **CSS + Framer Motion** | 5–7 SVG daun di posisi acak, `rotate: ±6°` via `keyframes`, `transform-origin` di pangkal daun, durasi 4–7s, delay acak. |
| **Parallax scroll** | Saat scroll, layer background bergerak beda kecepatan | **GSAP ScrollTrigger** | 3 layer: latar:yPercent -8 (terlambat), -14, -20 (tercepat) dengan `scrub: 0.5`. Delta kecil supaya tidak bikin pusing. |
| **Scroll indicator akar** | Akar tanaman tumbuh ke bawah berulang | **GSAP + SVG** | SVG path akar, `strokeDasharray` = panjang path, animasi `strokeDashoffset` panjang→0→panjang, `repeat: -1`, `duration 2.4s`. |
| **Text entrance** | Heading muncul naik + fade | **Framer Motion** | Stagger: heading → subheading → CTA → stat strip, `y: 16→0`, `opacity: 0→1`, stagger 0.1s. |
| **Background pulse** | Cahaya hijau berdenyut sangat halus | **CSS keyframes** | Radial gradient overlay, `opacity: 0.4→0.55`, `duration 6s`, alternate infinite. |

**Kenapa Canvas 2D, bukan Vanta.js atau video:** nol aset, nol dependency proprietary, tetap jalan saat offline, palette 100% Customize ke hijau, dan bisa di-`pause()` saat `prefers-reduced-motion`.

### 7.3 Kartu Sensor

| Efek | Visual | Library | Implementasi |
|---|---|---|---|
| **Counting up** | Angka naik dari nilai lama ke nilai baru saat data masuk | **Custom `useCountUp` hook** (requestAnimationFrame + `easeOutExpo`) | `useEffect` saat nilai berubah → `animate(prev, next, 600ms)`. Angka pakai `font-variant-numeric: tabular-nums` supaya tidak jitter. |
| **Shape ilustrasi** | Matahari (suhu) / tetes (humidity) / gundukan (tanah) / wifi (status) | **Custom SVG + Framer Motion** | SVG inline, warna sesuai palet. Bentuk filled dengan opacity rendah sebagai latar. |
| **Sparkline** | Garis tren 40 titik terakhir di bawah angka | **Recharts `Area` mini (h 32px)** | Data buffer zustand, tanpa axis, gradien transparan. |
| **Glow abnormal** | Box shadow berwarna + denyut saat di luar threshold | **Framer Motion `animate` + CSS** | `animate={{ boxShadow: ['0 0 0px #EF4444', '0 0 24px 4px rgba(239,68,68,0.35)', '0 0 0px #EF4444'] }}` dengan `repeat: Infinity, duration: 1.8s`. Warna: merah (kritis) / amber (mendekati batas). |
| **Hover lift** | Kartu naik 2px + shadow menguat | **CSS transition** | `transform: translateY(-2px)`, `boxShadow` lebih dalam, `transition: 200ms`. |
| **Icon pulse saat update** | Ikon berdenyut singkat saat ada data baru | **Framer Motion** | `key={value}` → remount, `scale: [1, 1.15, 1]`, `duration 0.4s`. |
| **Status badge change** | Badge online↔offline pop | **Framer Motion spring** | `scale: 0.8→1`, `spring(stiffness 400, damping 15)`. |

### 7.4 Grafik

| Efek | Visual | Library | Implementasi |
|---|---|---|---|
| **Area streaming** | Area chart yang tumbuh ke kanan | **Recharts `Area`** | Buffer last 300 titik. `isAnimationActive` false untuk streaming (terlalu berat). |
| **Gradasi berdenyut** | Gradient area sedikit "menapas" | **CSS keyframes pada `<stop>`** | `<stop>` opacity 0.35→0.18→0.35, `duration 3s`. Alternatif: `filter: brightness()` pada SVG. |
| **Tooltip daun** | Tooltip berbentuk daun saat hover | **Recharts `Tooltip content` custom** | SVG path daun (bulat meruncing) sebagai background tooltip, isi: label waktu + 3 nilai + status. `pointer-events` none, `z-50`. |
| **Threshold band** | Area translucent di luar batas | **Recharts `ReferenceArea`** | `y1=max, y2=max+10` fill `#FFF3CD` opacity 0.12 (aman) + garis dashed di `max`/`min`. |
| **Anomaly marker** | Titik merah + label saat spike | **Recharts `ReferenceDot`** | Dicek di backend, dikirim sebagai event, ditandai dengan bentuk berbeda (bukan hanya warna). |
| **Crosshair vertikal** | Garis tegak saat hover + label waktu | **Recharts `Tooltip cursor`** | `cursor={{ stroke: '#22C55E', strokeDasharray: '4 4' }}`. |
| **Transisi range** | Ganti 1j→24j → grafik morph | **Framer Motion / CSS** | Overlay fade saat query baru, `key={range}` → remount dengan `opacity 0→1`, `duration 300ms`. |
| **Pause streaming** | Tombol pause untuk user | **State lokal** | Saat paused, tampilkan tombol resume prominent. **Wajib** untuk accessibility (W3C: auto-updating content harus bisa dihentikan). |

### 7.5 Tombol Kontrol (Aktuator)

| Efek | Ikon | Visual | Library | Implementasi |
|---|---|---|---|---|
| **Pompa (kran air)** | Kran custom SVG | Saat ON: air mengalir dari kran | **CSS keyframes + SVG** | Kran: handle berputar 0°→45° saat ON. Air: 3–5 garis/zat path bergerak ke bawah (`strokeDashoffset` atau `translateY`) loop. Warna biru air. |
| **Kipas (kipas angin)** | `Fan` (Lucide) | Blade berputar cepat | **CSS `animation: spin`** | `transform: rotate(360deg)`, `duration 0.9s`, linear infinite saat ON; saat OFF, decelerate ke 0 dalam 0.4s (`transition` + `animation-play-state`). |
| **Lampu grow light** | `Lightbulb` custom | Cahaya menyala,_rsakov glow | **CSS drop-shadow + keyframes** | Bulb `fill` kuning matahari; glow `drop-shadow(0 0 12px #FACC15)` berdenyut opacity saat ON. Cahaya juga menerangi "lantai" di bawah (radial gradient yellow low-opacity). |
| **Sinyal WiFi** | `Wifi` | 3 bar, naik saat koneksi baik | **CSS animation** | Bar opacity + scaleY berurutan delay 0.2s saat online; mati + `WifiOff` saat offline. |
| **Ripple saat klik** | Lingkaran menyebar dari titik klik | **CSS** | `<span class="ripple">` absolutely positioned di titik klik (`offsetX/offsetY`), `scale 0→2.5`, `opacity 0.5→0`, `duration 600ms`. |
| **Konfirmasi override** | Modal sebelum manual control | **Framer Motion + shadcn Dialog** | Dialog: "Aktifkan Pompa selama 60 detik?" → Scale-in, tombol konfirmasi warna danger. |
| **Optimistic update** | Switch langsung berubah sebelum response | **State lokal** | Set state optimistic, heartbeat animation (opacity pulse 3x) sampai telemetry konfirmasi. Kalau gagal → revert + toast error. |
| **Verified tick** | Centang hijau muncul setelah konfirmasi | **Framer Motion** | `scale 0→1.2→1`, `spring`, hilang setelah 1.5s. |

### 7.6 Timeline / Log

| Efek | Visual | Library | Implementasi |
|---|---|---|---|
| **Batang memanjang** | Garis vertikal tumbuh dari atas ke bawah | **GSAP ScrollTrigger** | Setiap ruas batang: `scaleY: 0→1`, `transform-origin: top`, trigger saat masuk viewport, `duration 0.5`, `ease: power2.out`. |
| **Daun tumbuh per entry** | Helai daun muncul di tiap node batang | **SVG + Framer Motion** | Daun SVG `scale: 0→1`, `rotate: -90°→0°`, `back.out(1.4)`, delay 0.15s setelah batang. `stagger 0.06s` untuk entry yang masuk bersamaan. |
| **Warna node per tipe** | Node: hijau (normal), biru (info), kuning (warning), merah (alert) | **CSS token** | Warna dari kategori event. Selalu ada ikon + label teks, tidak hanya warna. |
| **Hover expand** | Entry membesar sedikit, bayangan muncul | **CSS** | `translateX(4px)`, `transition 150ms`. |
| **Filter transition** | Filter mengubah → entry fade in/out | **Framer Motion `AnimatePresence`** | `layout` prop untuk animasi posisi, `opacity` + `scale 0.98`. |
| **Timeline progresif** | Batang tumbuh conforme scroll | **GSAP ScrollTrigger `scrub`** | Section panjang dengan `scrub: true` → batang "men Reveal" seiring scroll. |

### 7.7 Background Global

| Efek | Visual | Library | Implementasi |
|---|---|---|---|
| **Day/Night cycle** | Background berubah sesuai jam asli | **CSS + JS** | Hitung jam lokal → tentukan fase (subuh/pagi/siang/sore/malam) → set CSS variable `--sky-gradient` (5 gradien preset). Transisi `background 3s ease`. |
| **Cuaca real-time** | Overlay mendung/hujan + suhu luar | **OpenWeatherMap API** | Fetch `/weather?lat&lon` → set `--weather-tint` dan ikon. Hujan = partikel air turun halus (canvas, count rendah). Dommbg = overlay abu-abu + partikel lambat. |
| **Parallax 4 layer** | Kedalaman background | **GSAP ScrollTrigger** | Layer: furthest (kabut) → daun jauh → daun dekat → foreground blur. `yPercent` -6, -10, -16, -24. **Maksimal 4 layer** — di atas itu biaya scroll listener tidak sebanding hasilnya. |
| **Global grain/noise** | Tekstur halus biar tidak flat | **CSS SVG noise** | `feTurbulence` overlay, `opacity 0.03`, `position fixed`, `pointer-events none`. |

### 7.8 Micro-interaction

| State | Visual | Implementasi |
|---|---|---|
| **Hover (umum)** | Element brighten/naik 2px | `transition: all var(--duration-fast) var(--ease-out)` |
| **Focus (keyboard)** | Outline jelas 2px hijau + offset | `:focus-visible { outline: 2px solid #22C55E; outline-offset: 2px; }` — WAJIB untuk aksesibilitas |
| **Loading** | Skeleton berdenyut | `<Skeleton className="animate-pulse" />` — sesuaifieldset loading |
| **Error** | Card merah dengan pesan jelas + tombol coba lagi | Border `#EF4444`, `AlertTriangle` icon, pesan Bahasa Indonesia + kode error teknis |
| **Empty** | Ilustrasi daun + pesan + CTA | Untuk log kosong / riwayat belum ada |
| **Offline** | Banner sticky atas: "Koneksi terputus — data terakhir: 10:26" | Socket.io `disconnect` event → banner + disable tombol kontrol |
| **Toast** | Muncul kanan bawah, auto-hide | Sonner, `position: bottom-right`, durasi 4s |
| **Reduced motion** | Semua animasi dimatikan | `matchMedia('(prefers-reduced-motion: reduce)')` → GSAP skip & render final state, Framer Motion `transition: {duration: 0}`, canvas paused, partikel dimatikan |

### 7.9 Strategi Performa Animasi

Aturan yang berlaku di seluruh proyek:

1. **Canvas/GSAP tidak jalan saat tab tidak aktif** — `document.visibilitychange` → pause rAF, resume `ScrollTrigger`.
2. **R3F pakai `frameloop: 'demand'`** — render hanya saat ada interaksi; particle/daun disimulasikan via `useFrame` seminimal mungkin.
3. **`will-change` hanya sementara** — pasang saat animasi dimulai, lepas setelah selesai.
4. **Lazy-load halaman berat** — `Visualization3D` via `React.lazy()` + `Suspense` (bundle Three.js ~600KB tidak boleh di main chunk).
5. **List >100 item di-virtualize** — `react-window` untuk log timeline yang panjang.
6. **Recharts tidak-animate saat streaming** — `isAnimationActive={false}`, animasi hanya saat ganti range.

---

## 8. ROADMAP PENGEMBANGAN

### Fase 1 — Setup Proyek, Struktur Folder, Design System
- **Deliverable:** Monorepo dengan `frontend/`, `backend/`, `simulator/`; design tokens di `index.css`; shadcn/ui terinstall; Aedes jalan; koneksi Supabase teruji (insert 1 baris).
- **Estimasi:** 2 jam
- **Dependency:** Akun Supabase + `DATABASE_URL` siap.
- **Selesai bila:** `npm run dev` menyalakan ketiganya; halaman `/` render dengan token warna benar; tabel `sensor_readings` menerima 1 baris dummy dari script seed; tidak ada error console.

### Fase 2 — Hero Section dengan Animasi
- **Deliverable:** Halaman Landing dengan canvas (kabut + tetes + berkas cahaya), dedaunan bergoyang, parallax 3 layer GSAP, scroll-indicator akar, text entrance berstagger.
- **Estimasi:** 3 jam
- **Dependency:** Fase 1.
- **Selesai bila:** Animasi berjalan 60fps di laptop; scroll parallax mulus; `prefers-reduced-motion` mematikan semua animasi; mobile responsif (375px & 768px).

### Fase 3 — Dashboard Monitoring Statis (Mock Data)
- **Deliverable:** 4 kartu sensor dengan mock data, grafik area dengan data dummy 24 jam, panel kontrol non-fungsional (UI saja), alert banner statis.
- **Estimasi:** 4 jam
- **Dependency:** Fase 1, 2.
- **Selesai bila:** Semua komponen tampil benar dengan mock data; count-up berjalan; grafik menampilkan tooltip daun; layout rapi di 375/768/1440px.

### Fase 4 — Integrasi Real-time (MQTT/WebSocket)
- **Deliverable:** Simulator publish ke Aedes; backend parse → TimescaleDB → Socket.io broadcast; frontend menerima & update live; status online/offline; retention policy.
- **Estimasi:** 4 jam
- **Dependency:** Fase 3.
- **Selesai bila:** Nilai di kartu berubah tiap 2 detik tanpa reload; grafik streaming; matikan simulator → status jadi offline dalam ≤10 detik + banner; data terkonfirmasi masuk Supabase.

### Fase 5 — Panel Kontrol + Threshold
- **Deliverable:** 3 toggle aktuator dengan konfirmasi manual override; mode auto/manual; threshold editor yang publish ke `greenhouse/config`; verifikasi optimistic update.
- **Estimasi:** 3 jam
- **Dependency:** Fase 4.
- **Selesai bila:** Klik pompa → dialog konfirmasi → publish `cmd` → simulator menyalakan → UI terverifikasi dengan centang hijau; threshold tersimpan & berefek di alert; role `operator` **tidak bisa** akses kalibrasi/restart.

### Fase 6 — Timeline Log + Settings
- **Deliverable:** Timeline dengan batang tumbuh + daun per entry; filter & search; log aktivitas dari DB; halaman Settings (profil, kalibrasi, restart device).
- **Estimasi:** 3 jam
- **Dependency:** Fase 4, 5.
- **Selesai bila:** Setiap event log tercatat & tampil dengan warna/ikon/label sesuai tipe; filter berfungsi; kalibrasi publish ke `config`; restart mengirim `cmd.restart`.

### Fase 7 — Visualisasi 3D + Polish Animasi
- **Deliverable:** Scene R3F greenhouse prosedural (rangka + pot + tanaman), orbit controls, hover bed → tooltip sensor; day/night cycle; cuaca (opsional); PWA (opsional); audit performa.
- **Estimasi:** 4 jam
- **Dependency:** Fase 4.
- **Selesai bila:** Scene 3D smooth (target ≥50fps), lazy-loaded, `dispose` benar (tidak memory leak); semua animasi di polish; Lighthouse Performance ≥ 80; tidak ada memory leak setelah 10 menit navigasi.

**Total Estimasi:** **~23 jam kerja inkremental**

---

## 9. RISIKO & MITIGASI

### 9.1 Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| **Koneksi MQTT putus** | Data tidak mengalir, UI basi | (1) Aedes dengan auto-reconnect untuk client; (2) `status` topic **retained** + LWT `offline` message; (3) heartbeat: jika tidak ada telemetry > 10s → tandai offline; (4) Socket.io punya reconnect + backoff sendiri; (5) UI tampilkan `lastSeen` agar pengguna tahu data basi. |
| **Sensor error / nilai NaN** | Kartu menampilkan angka rusak | (1) Validasi Zod di backend - payload tolak kalau di luar rentang fisika; (2) Frontend tampilkan `-` dengan badge "Sensor bermasalah", bukan angka sembarangan; (3) tulis ke `activity_logs` sebagai `sensor_error`; (4) kalibrasi offset untuk koreksi systematic drift. |
| **Latency tinggi** | Kontrol terasa lambat | (1) Buffer telemetry 2 detik (bukan 100ms) — greenhouse tidak butuh Hz tinggi; (2) batch insert ke DB setiap 10 baris atau 5 detik, bukan per pesan; (3) broadcast Socket.io setelah DB write, bukan sebelum (konsistensi > kecepatan). |
| **Beban TimescaleDB** | Query lambat saat data menumpuk | (1) Hypertable dengan chunk interval 1 hari; (2) retention policy auto-drop data > 30 hari; (3) `time_bucket()` untuk agregasi, **jangan** `SELECT *` untuk grafik; (4) index pada `(device_id, time DESC)`. |
| **Supabase free tier limit** | Project di-suspend / connection habis | (1) Connection pool ≤ 10 (batas free tier ~20); (2) `pg` pool dengan `max: 10`, `idleTimeoutMillis: 10000`; (3) satu instance backend saja. |

### 9.2 Risiko UI

| Risiko | Dampak | Mitigasi |
|---|---|---|
| **Animasi terlalu berat → lag** | UX buruk, dropout | (1) Maksimal 1–2 elemen animasi aktif per viewport (prinsip UX, severity High); (2) Canvas 2D bukan WebGL untuk background; (3) R3F `frameloop: 'demand'`; (4) Three.js **lazy-loaded** via `React.lazy` — jangan di main bundle; (5) `will-change` hanya sementara; (6) pause animasi saat `document.hidden`; (7) kurangi jumlah partikel di mobile (adaptive quality). |
| **Motion sickness** | Pengguna tidak nyaman | (1) Hormati `prefers-reduced-motion` di semua layer; (2) parallax delta kecil (6-24%); (3) jangan parallax teks; (4) hindari rotasi 3D yang berlebihan. |
| **Glow/denyut berlebihan** | Alarm kelelahan | (1) Maksimal 1 denyut per 1.8s; (2) abnormal state pakai warna + ikon + label, bukan denyut terus-menerus; (3) shimmer hanya saat loading. |
| **Warna sebagai satu-satunya status** | Tidak aksesibel | (1) Semua status punya ikon + label teks; (2) pola garis berbeda pada grafik (solid/dashed/dotted) untuk seri berbeda, bukan hanya hue; (3) kontras teks ≥ 4.5:1 diverifikasi. |
| **Bundle size membengkak** | Load lambat | (1) Route-based code splitting; (2) import ikon individual (Lucide tree-shakeable); (3) font lokal via `@fontsource`, bukan CDN; (4) Vite `manualChunks` untuk `three`, `charts`, `animation`. |

### 9.3 Risiko Keamanan

| Risiko | Dampak | Mitigasi |
|---|---|---|
| **Endpoint kontrol terbuka** | Siapa pun bisa menyalakan pompa | (1) **Semua route `/api/control/*` wajib JWT valid**; (2) middleware `requireRole('admin')` untuk kalibrasi & restart; (3) `CORS_ORIGIN` allowlist eksplisit — bukan `*`; (4) rate limit pada `/api/auth/login` (expo slow). |
| **Credential bocor** | Akses database | (1) **JANGAN** pernah `VITE_*` untuk Supabase service key — hanya `SUPABASE_*` di backend; (2) `.env` masuk `.gitignore`, commit hanya `.env.example`; (3) Supabase **service role key** hanya di backend, tidak pernah dikirim ke browser; (4) rotasi key kalau pernah bocor. |
| **JWT lemah** | Penyalahgunaan akses | (1) `JWT_SECRET` minimal 64 karakter random (`crypto.randomBytes(48).toString('hex')`); (2) `bcrypt` cost ≥ 12 untuk hash password; (3) expiry 12 jam; (4) simpan token di `localStorage` **atau** httpOnly cookie — pilih satu, konsisten (untuk demo: `localStorage` + catatan risiko XSS). |
| **Password tidak ter-hash** | Kebocoran DB = kebocoran password | (1) `bcrypt.hash(password, 12)` saat seed; (2) tidak pernah log password; (3) kolom `password_hash` di tabel `users`. |
| **MQTT publish tanpa auth** | Orang bisa kirim command palsu | (1) Aedes dikonfigurasi dengan `authenticate` callback — hanya device & backend yang punya credential; (2) topic command hanya boleh publish dari backend. |

### 9.4 Risiko Deployment

| Risiko | Dampak | Mitigasi |
|---|---|---|
| **CORS error** | Frontend tidak bisa panggil backend | (1) `CORS_ORIGIN` eksplisit, bukan `*`; (2) **`withCredentials: true`** di axios/fetch kalau pakai cookie; (3) preflight `OPTIONS` ditangani otomatis oleh middleware `cors`. |
| **Env var salah nama** | App tidak start / crash | (1) Validasi env di startup dengan Zod — **fail fast**, bukan crash belakangan; (2) `.env.example` terdokumentasi jelas; (3) pesan error jelas kalau variabel mana yang kurang. |
| **Port bentrok** | Tidak bisa start | (1) Default port tetap (5173, 3001, 1883); (2) pesan friendly "Port 3001 sudah dipakai, ganti PORT"; (3) `.env` didokumentasikan. |
| **Supabase belum siap** | Data tidak bisa disimpan | (1) Cek koneksi di awal Fase 1; (2) **fallback sementara**: backend pakai in-memory buffer + file JSON, sehingga UI tetap bisa demo tanpa Supabase. |
| **Aedes tidak jalan di serverless** | Production gagal | (1) Aedes butuh persistent process → deploy backend ke **Railway/Render**, bukan Vercel Functions; (2) di Railway, tambahkan volume untuk persistensi bila perlu. |
| **Timezone server ≠ lokal** | Grafik & day/night-cycle geser | (1) Simpan semua timestamp dalam **UTC** (`timestamptz`); (2) konversi ke waktu lokal **hanya di presentation layer**; (3) day/night cycle pakai `Intl.DateTimeFormat()` dengan timezone browser, bukan server. |

---

## 10. CATATAN UNTUK FASE 1 (menunggu approval)

### Hal yang perlu disiapkan sebelum ngoding:
1. **Akun Supabase** — buat project free, salin `URL`, `anon key`, `service_role key` ke `backend/.env`.
2. **Buat tabel Timescale** — script SQL untuk `sensor_readings` (hypertable), `alerts`, `activity_logs`, `users`.
3. **Seed user** — 1 `admin` + 1 `operator` dengan password ter-hash.

### Yang akan saya kerjakan di Fase 1:
- `git init` + `.gitignore` + `README.md`
- Scaffold `frontend/` (Vite + React + TS + Tailwind + shadcn/ui)
- Scaffold `backend/` (Express + TS + Drizzle + Aedes + Socket.io)
- `simulator/` publish script
- Design tokens di `index.css` (palette + typography + motion tokens)
- Script SQL untuk TimescaleDB + seed user
- Pastikan `npm run dev` menyalakan ketiganya dan satu tick telemetry sampai ke UI

---

*Dokumen selesai. Menunggu approval untuk masuk Fase 1.*
