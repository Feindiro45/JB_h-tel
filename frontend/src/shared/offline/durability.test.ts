import { expect, it, vi } from 'vitest'
import {
  enqueueOperation,
  mergeOperations,
  nextProvisionalNumber,
  readOutbox,
  updateOperation,
  type QueuedOperation,
} from './outbox'
import { storageProtection } from './storage'
import { restoreBackup } from './backup'
import { api } from '../api/client'

const operation = (id: string): QueuedOperation => ({
  id,
  kind: 'payment.record',
  label: 'Test',
  method: 'POST',
  path: '/api/v1/reservations/11111111-1111-4111-8111-111111111111/payments',
  body: { amount_fcfa: 1000, method: 'CASH' },
  createdAt: Date.now(),
  userId: 'user-1',
  userName: 'Test',
  status: 'pending',
  attempts: 0,
  lastAttemptAt: null,
  error: null,
  provisionalNumber: null,
  definitiveNumber: null,
  localId: null,
  abandonReason: null,
})

it('conserve chaque ajout concurrent et alloue des numéros distincts dans la même transaction', async () => {
  const operations = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      enqueueOperation(operation(`op-${index}`), { station: 'CAISSE', prefix: 'LOC' }),
    ),
  )
  expect(await readOutbox()).toHaveLength(20)
  expect(new Set(operations.map((item) => item.provisionalNumber)).size).toBe(20)
  const numbers = await Promise.all([
    nextProvisionalNumber('CAISSE'),
    nextProvisionalNumber('CAISSE'),
  ])
  expect(new Set(numbers).size).toBe(2)
})

it('conserve un ajout concurrent avec un accusé de réception et une restauration', async () => {
  await enqueueOperation(operation('first'))
  await Promise.all([
    enqueueOperation(operation('second')),
    updateOperation('first', { status: 'accepted' }),
    mergeOperations([operation('third'), operation('third')]),
  ])
  const operations = await readOutbox()
  expect(operations).toHaveLength(3)
  expect(operations.find((item) => item.id === 'first')?.status).toBe('accepted')
})

it('refuse de garder un encaissement si IndexedDB est indisponible', async () => {
  vi.stubGlobal('indexedDB', undefined)
  try {
    expect((await storageProtection()).durable).toBe(false)
    await expect(enqueueOperation(operation('volatile'))).rejects.toThrow('stockage durable')
  } finally {
    vi.unstubAllGlobals()
  }
})

it('reprend la numérotation au-delà des documents restaurés', async () => {
  await restoreBackup([{ ...operation('restored'), provisionalNumber: 'LOC-CAISSE-000450' }])
  expect(await nextProvisionalNumber('CAISSE')).toBe('LOC-CAISSE-000451')
})

it('refuse une sauvegarde qui redirige une opération ou change sa méthode', async () => {
  await expect(
    restoreBackup([{ ...operation('unsafe'), path: 'https://audit.invalid/collect' }]),
  ).rejects.toThrow('invalides')
  await expect(restoreBackup([{ ...operation('unsafe'), method: 'PUT' }])).rejects.toThrow(
    'invalides',
  )
  expect(await readOutbox()).toEqual([])
})

it('ne transmet aucun en-tête à une origine externe', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch')
  await expect(api.post('https://audit.invalid/collect', {})).rejects.toThrow('API de l’hôtel')
  expect(fetch).not.toHaveBeenCalled()
})
