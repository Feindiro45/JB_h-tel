import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/errors'
import { reportReachable, reportUnreachable } from './connectivity'
import { runOrQueue } from './offlineWrite'
import { readOutbox } from './outbox'
import { sendPendingOperations } from './outboxSync'
import { setQueryClientRef } from './queryClientRef'
import { readRuns } from './syncLog'

const USER = { id: 'u-1', name: 'Grâce', permissions: [] }

function client(): QueryClient {
  const c = new QueryClient()
  c.setQueryData(['auth', 'me'], USER)
  c.setQueryData(['workstation', 'self'], { name: 'Caisse 01' })
  setQueryClientRef(c)
  return c
}

function write(send: () => Promise<string>) {
  return runOrQueue({
    kind: 'payment.record',
    label: 'Encaissement de 20 000 FCFA — chambre 101',
    path: '/api/v1/reservations/r-1/payments',
    body: { amount_fcfa: 20000, method: 'CASH' },
    numbered: true,
    send,
    provisional: (operation) => `provisoire ${operation.provisionalNumber}`,
  })
}

let fetchMock: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchMock = vi.spyOn(globalThis, 'fetch')
})
afterEach(() => setQueryClientRef(null))

describe('Écritures hors ligne (lot 4)', () => {
  it('envoie directement quand le serveur répond, sans rien garder', async () => {
    client()
    expect(await write(async () => 'enregistré')).toBe('enregistré')
    expect(await readOutbox()).toEqual([])
  })

  it('garde l’opération hors ligne avec un numéro provisoire et sa clé', async () => {
    client()
    reportUnreachable()
    const send = vi.fn(async () => 'jamais')

    expect(await write(send)).toBe('provisoire LOC-CAISSE01-000001')
    expect(await write(send)).toBe('provisoire LOC-CAISSE01-000002')
    expect(send).not.toHaveBeenCalled()
    const [first] = await readOutbox()
    expect(first).toMatchObject({
      status: 'pending',
      userId: 'u-1',
      path: '/api/v1/reservations/r-1/payments',
      provisionalNumber: 'LOC-CAISSE01-000001',
    })
    expect(first!.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('garde l’opération si le réseau tombe pendant l’envoi, avec la même clé', async () => {
    client()
    let usedKey = ''
    await runOrQueue({
      kind: 'payment.record',
      label: 'Encaissement',
      path: '/x',
      body: {},
      send: async (key) => {
        usedKey = key
        throw new ApiError(0, 'Réseau', 'Connexion impossible.', {}, null, [])
      },
      provisional: () => 'provisoire',
    })
    expect((await readOutbox())[0]!.id).toBe(usedKey)
  })

  it('laisse un refus du serveur s’afficher, sans le garder', async () => {
    client()
    await expect(
      write(async () => {
        throw new ApiError(409, 'Conflit', 'Chambre occupée.')
      }),
    ).rejects.toThrow('Chambre occupée.')
    expect(await readOutbox()).toEqual([])
  })
})

describe('Mettre à jour en ligne', () => {
  it('rejoue avec la clé, garde le numéro définitif et ignore les opérations d’un autre utilisateur', async () => {
    const c = client()
    reportUnreachable()
    await write(async () => 'x')
    c.setQueryData(['auth', 'me'], { id: 'u-2', name: 'Awa', permissions: [] })
    await write(async () => 'x')
    c.setQueryData(['auth', 'me'], USER)
    const [mine] = await readOutbox()

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { receipt_number: 'REC-2026-000042' } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    reportReachable()
    const run = await sendPendingOperations(c, 'manual', USER)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe(mine!.id)
    expect(run).toMatchObject({ direction: 'online', status: 'success', records: 1 })
    const operations = await readOutbox()
    expect(operations[0]).toMatchObject({ status: 'accepted', definitiveNumber: 'REC-2026-000042' })
    expect(operations[1]).toMatchObject({ status: 'pending', userId: 'u-2' })
    expect((await readRuns())[0]?.direction).toBe('online')
  })

  it('garde un refus avec sa cause et s’arrête proprement sur une coupure', async () => {
    const c = client()
    reportUnreachable()
    await write(async () => 'x')
    await write(async () => 'x')

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ title: 'Trop-perçu', message: 'Le montant dépasse le solde.' }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    reportReachable()
    const run = await sendPendingOperations(c, 'manual', USER)

    const [first, second] = await readOutbox()
    expect(first).toMatchObject({
      status: 'rejected',
      error: { title: 'Trop-perçu', message: 'Le montant dépasse le solde.' },
    })
    expect(second).toMatchObject({ status: 'pending', attempts: 1 })
    expect(run?.status).toBe('failure')
    expect(run?.failures.map((f) => f.cause)).toEqual([
      'Le montant dépasse le solde.',
      'Connexion impossible. Vérifiez votre connexion et réessayez.',
    ])
  })
})
