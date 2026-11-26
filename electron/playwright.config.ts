import { defineConfig } from '@playwright/test'

/**
 * Recette du logiciel Windows (D-069) : l'application Electron construite (`npm run build`) est
 * lancée par Playwright contre l'API Laravel locale, base isolée `jb_hotel_e2e`
 * (`npm run test:e2e` la prépare). Les coupures sont simulées en relançant le logiciel avec une
 * adresse de serveur injoignable : rien d'autre ne change sur le poste.
 */
export const API = 'http://localhost:8013'
export const ORIGIN = 'http://localhost:5176'

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 300_000,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'php artisan serve --host=127.0.0.1 --port=8013',
    cwd: '../backend',
    url: `${API}/api/v1/health`,
    timeout: 120_000,
    env: {
      APP_ENV: 'local',
      API_RATE_LIMIT_PER_MINUTE: '1000',
      APP_URL: API,
      DB_DATABASE: 'jb_hotel_e2e',
      DB_URL: '',
      FRONTEND_URL: ORIGIN,
      SANCTUM_STATEFUL_DOMAINS: 'localhost:5176',
      SESSION_COOKIE: 'jb-hotel-e2e-desktop',
      SESSION_SECURE_COOKIE: 'false',
      QUEUE_CONNECTION: 'sync',
      MAIL_MAILER: 'array',
      SYNC_COMMIT_LAG_SECONDS: '1',
    },
    reuseExistingServer: false,
  },
})
