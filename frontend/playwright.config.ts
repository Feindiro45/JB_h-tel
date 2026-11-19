import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5174',
    browserName: 'chromium',
    channel:
      process.env.E2E_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'php artisan serve --host=127.0.0.1 --port=8011',
      cwd: '../backend',
      url: 'http://localhost:8011/api/v1/health',
      env: {
        APP_ENV: 'local',
        APP_URL: 'http://localhost:8011',
        DB_DATABASE: 'jb_hotel_e2e',
        DB_URL: '',
        FRONTEND_URL: 'http://localhost:5174',
        SANCTUM_STATEFUL_DOMAINS: 'localhost:5174',
        SESSION_COOKIE: 'jb-hotel-e2e',
        SESSION_SECURE_COOKIE: 'false',
        QUEUE_CONNECTION: 'sync',
        MAIL_MAILER: 'array',
      },
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --host localhost --port 5174',
      url: 'http://localhost:5174',
      env: { VITE_API_URL: 'http://localhost:8011' },
      reuseExistingServer: false,
    },
  ],
})
