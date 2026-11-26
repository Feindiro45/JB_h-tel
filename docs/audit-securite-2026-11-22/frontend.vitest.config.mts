import { fileURLToPath } from 'node:url'
import { defineConfig } from '../../frontend/node_modules/vitest/dist/config.js'

export default defineConfig({
  root: fileURLToPath(new URL('../../frontend', import.meta.url)),
  resolve: {
    alias: {
      vitest: fileURLToPath(new URL('../../frontend/node_modules/vitest/dist/index.js', import.meta.url)),
      '@tanstack/react-query': fileURLToPath(new URL('../../frontend/node_modules/@tanstack/react-query/build/modern/index.js', import.meta.url)),
    },
  },
  test: {
    include: ['../docs/audit-securite-2026-11-22/frontend.probes.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    maxWorkers: 1,
    testTimeout: 15000,
  },
})
