#!/usr/bin/env node
/**
 * Startup development terurut.
 *
 * Urutan penting:
 *   1. MQTT broker  -> tunggu sampai port 1883 benar-benar LISTENING
 *   2. Backend      -> tunggu sampai /api/health merespond 200
 *   3. Simulator    -> publish telemetry ke broker
 *   4. Frontend     -> Vite dev server
 *
 * Semua proses di-forward ke STDOUT dengan prefix warna, jadi output mudah
 * dibaca dan Ctrl+C menutup semuanya sekaligus.
 *
 * Jalankan: npm run dev
 */

import { spawn } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RESET = '\x1b[0m';
const DIM = '\x1b[90m';
const YELLOW = '\x1b[33m';

const services = [
  { name: 'broker', color: '\x1b[35m', args: ['run', 'dev:broker'] },
  { name: 'backend', color: '\x1b[32m', args: ['run', 'dev:backend'] },
  { name: 'simulator', color: '\x1b[36m', args: ['run', 'dev:simulator'] },
  { name: 'frontend', color: '\x1b[33m', args: ['run', 'dev:frontend'] },
];

/**
 * Port yang wajib kosong sebelum startup.
 *
 * Ini dicek dulu karena kalau port sudah dipakai proses dari run sebelumnya,
 * service baru akan mati dengan EADDRINUSE - dan handler `exit` di bawah akan
 * mematikan seluruh stack. Gejalanya jadi " berhenti di tengah jalan" tanpa
 * penjelasan, padahal penyebabnya port occupied.
 */
const REQUIRED_PORTS = [
  { port: 1883, label: 'MQTT broker', hint: 'npm run dev:stop' },
  { port: 3001, label: 'backend API', hint: 'npm run dev:stop' },
  { port: 5173, label: 'frontend Vite', hint: 'npm run dev:stop' },
];

const children = [];
let shuttingDown = false;

function header(text) {
  process.stdout.write(`\n${DIM}--- ${text} ---${RESET}\n`);
}

function info(text) {
  process.stdout.write(`${DIM}${text}${RESET}\n`);
}

/** True kalau ada sesuatu yang sudah LISTENING di port tersebut. */
function isPortTaken(port, { host = '127.0.0.1', timeoutMs = 800 } = {}) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (taken) => {
      socket.destroy();
      resolve(taken);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/**
 * Gagal cepat dengan instruksi perbaikan, bukan menunggu 30 detik lalu
 * timeout. Ini yang membuat run pertama terlihat "macet".
 */
async function assertPortsFree() {
  const taken = [];

  for (const { port, label } of REQUIRED_PORTS) {
    if (await isPortTaken(port)) taken.push({ port, label });
  }

  if (taken.length === 0) return;

  const details = taken.map(({ port, label }) => `  - port ${port} (${label})`).join('\n');
  throw new Error(
    `port sudah dipakai, jadi service baru akan gagal start:\n${details}\n\n` +
      `Tutup run sebelumnya, lalu bersihkan dengan: npm run dev:stop`,
  );
}

/** Tunggu sampai sebuah TCP port menerima koneksi. */
function waitForPort(port, { host = '127.0.0.1', timeoutMs = 30_000, label = port } = {}) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (Date.now() > deadline) {
        reject(new Error(`timeout ${timeoutMs / 1000}s menunggu ${label} siap di port ${port}`));
        return;
      }

      const socket = net.connect({ port, host });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        setTimeout(attempt, 400);
      });
    };

    attempt();
  });
}

/** Tunggu sampai endpoint HTTP merespond (bukan connection refused). */
function waitForHttp(url, { timeoutMs = 30_000 } = {}) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (Date.now() > deadline) {
        reject(new Error(`timeout ${timeoutMs / 1000}s menunggu ${url}`));
        return;
      }

      const request = http.get(url, { timeout: 3000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else {
          setTimeout(attempt, 500);
        }
      });

      request.on('error', () => setTimeout(attempt, 500));
      request.on('timeout', () => {
        request.destroy();
        setTimeout(attempt, 500);
      });
    };

    attempt();
  });
}

/**
 * Jalankan perintah npm.
 *
 * `npm_execpath` hanya ada kalau script dipanggil lewat `npm run`. Kalau
 * `node scripts/dev.mjs` dipanggil langsung, path-nya kosong dan spawn
 * akan gagal diam-diam, jadi ada fallback ke executable npm.
 */
function spawnNpm(args, options) {
  const execPath = process.env.npm_execpath;

  if (execPath) {
    return spawn(process.execPath, [execPath, ...args], { ...options, shell: false });
  }

  const isWindows = process.platform === 'win32';
  return spawn(isWindows ? 'npm.cmd' : 'npm', args, { ...options, shell: isWindows });
}

function start({ name, color, args }) {
  header(`start ${name}`);

  const child = spawnNpm(args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  const prefix = `${color}[${name}]${RESET} `;

  const forward = (stream, target) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim().length === 0) continue;
        target.write(`${prefix}${line}\n`);
      }
    });
  };

  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);

  // Spawn gagal (npm tidak ketemu, dll) tidak pernah memicu `exit`, jadi
  // tanpa handler ini kita akan diam-diam menunggu sampai timeout.
  child.on('error', (error) => {
    if (shuttingDown) return;
    process.stderr.write(`${prefix}gagal dijalankan: ${error.message}\n`);
    void shutdown(1);
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;

    process.stdout.write(
      `${prefix}${DIM}berhenti sendiri (code ${code}, signal ${signal ?? '-'})${RESET}\n`,
    );

    // Vite boleh mati tanpa menjatuhkan yang lain, tapi broker/backend/simulator
    // tidak: kalau salah satu mati, data tidak mengalir dan debugging jadi
    // jauh lebih sulit daripada falha besar seketika.
    if (name === 'frontend') return;

    process.stdout.write(
      `${prefix}${YELLOW}service ${name} berhenti sebelum selesai${RESET}\n` +
        `${DIM}Kalau karena "EADDRINUSE" atau "port already in use", jalankan: npm run dev:stop${RESET}\n`,
    );
    void shutdown(code ?? 1);
  });

  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  header('menghentikan semua proses');
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

async function main() {
  process.stdout.write(
    `\n${DIM}Smart IoT Greenhouse - development server${RESET}\n` +
      `${DIM}Urutan: broker -> backend -> simulator -> frontend${RESET}\n`,
  );

  const byName = Object.fromEntries(services.map((s) => [s.name, s]));

  info('memeriksa port yang dibutuhkan...');
  await assertPortsFree();
  info('semua port kosong');

  // 1. Broker
  start(byName.broker);
  info('menunggu broker MQTT siap di port 1883...');
  await waitForPort(1883, { timeoutMs: 30_000, label: 'broker MQTT' });
  process.stdout.write(`${DIM}broker MQTT siap di mqtt://localhost:1883${RESET}\n`);

  // 2. Backend
  start(byName.backend);
  info('menunggu backend merespond di /api/health...');
  await waitForHttp('http://localhost:3001/api/health', { timeoutMs: 40_000 });
  process.stdout.write(`${DIM}backend siap di http://localhost:3001${RESET}\n`);

  // 3. Simulator
  start(byName.simulator);
  process.stdout.write(`${DIM}simulator dijalankan (publish telemetry ke broker)${RESET}\n`);

  // 4. Frontend
  start(byName.frontend);
  info('menunggu frontend Vite siap...');
  await waitForHttp('http://localhost:5173', { timeoutMs: 40_000 });
  process.stdout.write(`${DIM}frontend siap di http://localhost:5173${RESET}\n`);

  process.stdout.write(
    `\n${'\x1b[32m'}Semua service berjalan.${RESET}\n` +
      `${DIM}Login demo: admin@greenhouse.local / admin123${RESET}\n` +
      `${DIM}          operator@greenhouse.local / operator123${RESET}\n` +
      `${DIM}Tekan Ctrl+C untuk menghentikan semuanya.${RESET}\n\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`\n${'\x1b[31m'}Startup gagal:${RESET} ${error.message}\n`);
  void shutdown(1);
});
