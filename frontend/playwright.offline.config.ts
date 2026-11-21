import { defineConfig } from '@playwright/test'

/**
 * Recette du mode hors ligne (lot 2, D-064) sur l'application **construite pour la production**
 * (le service worker n'est actif qu'en production), servie par `vite preview`, avec la base
 * isolée `jb_hotel_e2e`. Lancement : `npm run test:e2e:offline`.
 */
const API = 'http://localhost:8012'
const APP = 'http://localhost:5175'
const OUT = 'node_modules/.e2e-offline-dist'

export default defineConfig({
  testDir: './e2e-offline',
  workers: 1,
  timeout: 150_000,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: APP,
    browserName: 'chromium',
    channel:
      process.env.E2E_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    serviceWorkers: 'allow',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'php artisan serve --host=127.0.0.1 --port=8012',
      cwd: '../backend',
      url: `${API}/api/v1/health`,
      env: {
        APP_ENV: 'local',
        API_RATE_LIMIT_PER_MINUTE: '1000',
        APP_URL: API,
        DB_DATABASE: 'jb_hotel_e2e',
        DB_URL: '',
        FRONTEND_URL: APP,
        SANCTUM_STATEFUL_DOMAINS: 'localhost:5175',
        SESSION_COOKIE: 'jb-hotel-e2e-offline',
        SESSION_SECURE_COOKIE: 'false',
        QUEUE_CONNECTION: 'sync',
        MAIL_MAILER: 'array',
      },
      reuseExistingServer: false,
    },
    {
      command: `npx vite build --outDir ${OUT} --emptyOutDir && npx vite preview --outDir ${OUT} --host localhost --port 5175 --strictPort`,
      url: APP,
      env: { VITE_API_URL: API },
      timeout: 240_000,
      reuseExistingServer: false,
    },
  ],
})
