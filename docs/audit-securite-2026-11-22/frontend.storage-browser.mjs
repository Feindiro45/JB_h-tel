// Read-only application audit: synthetic data in a fresh, non-persistent browser context.
// Uses the existing Vite development server; all backend requests are blocked.
import assert from 'node:assert/strict'
import { chromium } from '../../frontend/node_modules/@playwright/test/index.mjs'

const browser = await chromium.launch({ channel: 'msedge' })
try {
  const context = await browser.newContext()
  const page = await context.newPage()
  await context.route('http://localhost:8000/**', (route) => route.abort())
  await page.goto('http://localhost:5173')
  const result = await page.evaluate(async () => {
    const outbox = await import('/src/shared/offline/outbox.ts')
    const storage = await import('/src/shared/offline/storage.ts')
    const operation = (id) => ({
      id, kind: 'payment.record', label: 'SYNTHETIC AUDIT DATA', method: 'POST',
      path: '/api/v1/reservations/11111111-1111-4111-8111-111111111111/payments',
      body: { amount_fcfa: 1000, method: 'CASH' }, createdAt: Date.now(),
      userId: 'synthetic-user', userName: 'Audit', status: 'pending', attempts: 0,
      lastAttemptAt: null, error: null, provisionalNumber: null, definitiveNumber: null,
      localId: null, abandonReason: null,
    })
    await outbox.writeOperations([])
    await Promise.all([outbox.enqueueOperation(operation('a')), outbox.enqueueOperation(operation('b'))])
    const operations = await outbox.readOutbox()
    const numbers = await Promise.all([
      outbox.nextProvisionalNumber('AUDIT'), outbox.nextProvisionalNumber('AUDIT'),
    ])
    return {
      durable: (await storage.storageProtection()).durable,
      retainedOperations: operations.length,
      provisionalNumbers: numbers,
    }
  })
  console.log(JSON.stringify(result))
  assert.equal(result.durable, true)
  assert.equal(result.retainedOperations, 2, 'Both concurrent operations must be durable')
  assert.notEqual(result.provisionalNumbers[0], result.provisionalNumbers[1], 'Provisional numbers must be distinct')
  const second = await context.newPage()
  await second.goto('http://localhost:5173')
  const addFromTab = (tab, id) => tab.evaluate(async (operationId) => {
    const outbox = await import('/src/shared/offline/outbox.ts')
    return outbox.enqueueOperation({
      id: operationId, kind: 'payment.record', label: 'SYNTHETIC AUDIT DATA', method: 'POST',
      path: '/api/v1/reservations/11111111-1111-4111-8111-111111111111/payments',
      body: { amount_fcfa: 1000, method: 'CASH' }, createdAt: Date.now(),
      userId: 'synthetic-user', userName: 'Audit', status: 'pending', attempts: 0,
      lastAttemptAt: null, error: null, provisionalNumber: null, definitiveNumber: null,
      localId: null, abandonReason: null,
    }, { station: 'AUDIT', prefix: 'LOC' })
  }, id)
  const saved = await Promise.all([addFromTab(page, 'tab-a'), addFromTab(second, 'tab-b')])
  const count = await page.evaluate(async () => (await (await import('/src/shared/offline/outbox.ts')).readOutbox()).length)
  assert.equal(count, 4)
  assert.notEqual(saved[0].provisionalNumber, saved[1].provisionalNumber)
  console.log(JSON.stringify({ tabs: 2, retainedOperations: count, distinctNumbers: true }))
  await context.close()
} finally {
  await browser.close()
}
