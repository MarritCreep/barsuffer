import { defineConfig } from '@playwright/test';

/**
 * Браузерные тесты. Используют установленный Microsoft Edge (channel: msedge),
 * чтобы не скачивать отдельный Chromium. В CI можно заменить на chromium.
 */
export default defineConfig({
  testDir: 'e2e',
  use: {
    baseURL: 'http://localhost:4173',
    channel: process.env.CI ? undefined : 'msedge',
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
