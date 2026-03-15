import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  expect: {
    timeout: 5000, // Захист від гальмувань системи
  },
  webServer: {
    command: 'node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 120000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true,
    screenshot: 'only-on-failure', // Робить скриншот, якщо тест "впаде"
    trace: 'on-first-retry',      // Допомагає дебажити
  },
  reporter: [['html', { open: 'never' }]], // Генерує HTML звіт
});