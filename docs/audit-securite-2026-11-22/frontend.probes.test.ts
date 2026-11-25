// Temporary, isolated security probes. All network requests are mocked.
import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { restoreBackup } from '../../frontend/src/shared/offline/backup'
import { enqueueOperation, nextProvisionalNumber, readOutbox, writeOperations, type QueuedOperation } from '../../frontend/src/shared/offline/outbox'
import { sendPendingOperations } from '../../frontend/src/shared/offline/outboxSync'
import { saveWorkstationToken } from '../../frontend/src/shared/api/workstationToken'
import { forgetSession } from '../../frontend/src/shared/offline/session'
import { clearQueryCache } from '../../frontend/src/shared/offline/persistence'

const operation = (id: string): QueuedOperation => ({
  id, kind: 'payment.record', label: 'SYNTHETIC AUDIT DATA', method: 'POST',
  path: '/api/v1/reservations/11111111-1111-4111-8111-111111111111/payments',
  body: { amount_fcfa: 1000, method: 'CASH' }, createdAt: Date.now(),
  userId: 'synthetic-user', userName: 'Audit', status: 'pending', attempts: 0,
  lastAttemptAt: null, error: null, provisionalNumber: null, definitiveNumber: null,
  localId: null, abandonReason: null,
})

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

it('refuses restored URLs before forwarding any workstation or CSRF header', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: 'synthetic-result' } }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  saveWorkstationToken('SYNTHETIC-WORKSTATION-TOKEN')
  document.cookie = 'XSRF-TOKEN=SYNTHETIC-CSRF; path=/'
  const item = { ...operation('11111111-1111-4111-8111-111111111112'), path: 'https://audit.invalid/collect' }
  await expect(restoreBackup([item])).rejects.toThrow('invalides')
  const client = new QueryClient()
  await sendPendingOperations(client, 'manual', { id: item.userId, name: 'Audit' })
  expect(fetchMock).not.toHaveBeenCalled()
  client.clear()
})

it('retains both operations when two enqueues overlap', async () => {
  await writeOperations([])
  await Promise.all([enqueueOperation(operation('a')), enqueueOperation(operation('b'))])
  expect(await readOutbox()).toHaveLength(2)
})

it('allocates distinct provisional numbers when allocations overlap', async () => {
  const numbers = await Promise.all([nextProvisionalNumber('AUDIT'), nextProvisionalNumber('AUDIT')])
  expect(numbers[0]).not.toBe(numbers[1])
})

it('confirms logout cleanup retains raw operation bodies', async () => {
  await enqueueOperation(operation('synthetic'))
  await clearQueryCache()
  await forgetSession()
  expect((await readOutbox())[0].body).toEqual({ amount_fcfa: 1000, method: 'CASH' })
})

it('refuses an offline operation without IndexedDB', async () => {
  vi.stubGlobal('indexedDB', undefined)
  vi.resetModules()
  const initialOutbox = await import('../../frontend/src/shared/offline/outbox')
  const initialStorage = await import('../../frontend/src/shared/offline/storage')
  await expect(initialOutbox.enqueueOperation(operation('volatile'))).rejects.toThrow('stockage durable')
  expect((await initialStorage.storageProtection()).durable).toBe(false)
  expect(await initialOutbox.readOutbox()).toHaveLength(0)
  // A new module instance models the loss of in-memory state on page reload.
  vi.resetModules()
  const reloadedOutbox = await import('../../frontend/src/shared/offline/outbox')
  expect(await reloadedOutbox.readOutbox()).toEqual([])
})
