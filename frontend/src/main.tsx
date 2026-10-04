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