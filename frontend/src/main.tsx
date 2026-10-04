import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/500.css';
import './index.css';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Elemen #root tidak ditemukan');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/*
 * Registrasi service worker (PWA offline).
 *
 * Registration dilewati sepenuhnya di mode dev: service worker akan
 * menyajikan hasil build lama dari cache dan membuat hot reload
 * tampak rusak. Pengguna baru menerima shell terbaru lewat reload biasa.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Kegagalan registrasi tidak boleh mengganggu aplikasi: tanpa SW,
      // aplikasi tetap jalan online seperti biasa.
    });
  });
}