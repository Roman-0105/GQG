import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Полевое приложение развивается как PWA офлайн-очередью в Этапе 02
// (см. docs/project-plan.md, раздел 6) — плагин vite-plugin-pwa
// подключается тогда же, чтобы не тянуть service worker раньше, чем
// появится реальная логика синхронизации.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
