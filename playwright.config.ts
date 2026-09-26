import { defineConfig, devices } from '@playwright/test'

// Playwright (25.09.2026, по запросу владельца платформы) — базовая
// защитная сетка перед редизайном: dev-сервер поднимается автоматически
// (webServer), base — с учётом vite.config.ts base:'/GQG/', иначе все
// относительные ссылки/навигация в тестах будут промахиваться мимо
// реального пути приложения.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173/GQG/',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Pixel 7 (Chromium), не iPhone/WebKit — чтобы не тянуть отдельный
    // движок браузера ради одного мобильного профиля; для проверки
    // адаптивной вёрстки достаточно Chromium-эмуляции узкого экрана.
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/GQG/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
