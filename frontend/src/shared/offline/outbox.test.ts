import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reportReachable, reportUnreachable } from './connectivity'
import { localIdFor } from './localRefs'
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function write(path = '/api/v1/reservations/r-1/payments') {
  return runOrQueue<string>({
    kind: 'payment.record',
    label: 'Encaissement de 20 000 FCFA — chambre 101',
    path,
    body: { amount_fcfa: 20000, method: 'CASH' },
    numbered: true,
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
    fetchMock.mockResolvedValueOnce(json({ data: 'enregistré' }, 201))
    expect(await write()).toBe('enregistré')
    expect(await readOutbox()).toEqual([])
  })

  it('garde l’opération hors ligne avec un numéro provisoire et sa clé', async () => {
    client()
    reportUnreachable()

    expect(await write()).toBe('provisoire LOC-CAISSE01-000001')
    expect(await write()).toBe('provisoire LOC-CAISSE01-000002')
    expect(fetchMock).not.toHaveBeenCalled()
    const [first] = await readOutbox()
    expect(first).toMatchObject({
      status: 'pending',
      userId: 'u-1',
      path: '/api/v1/reservations/r-1/payments',
      provisionalNumber: 'LOC-CAISSE01-000001',
      localId: localIdFor(first!.id),
    })
    expect(first!.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('garde l’opération si le réseau tombe pendant l’envoi, avec la même clé', async () => {
    client()
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await write()).toMatch(/^provisoire LOC-/)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const usedKey = (init.headers as Record<string, string>)['Idempotency-Key']
    expect((await readOutbox())[0]!.id).toBe(usedKey)
  })

  it('laisse un refus du serveur s’afficher, sans le garder', async () => {
    client()
    fetchMock.mockResolvedValueOnce(json({ title: 'Conflit', message: 'Chambre occupée.' }, 409))
    await expect(write()).rejects.toThrow('Chambre occupée.')
    expect(await readOutbox()).toEqual([])
  })

  it('refuse tout de suite une écriture que le poste sait impossible, sans la garder', async () => {
    client()
    reportUnreachable()
    await expect(
      runOrQueue({
        kind: 'reservation.create',
        label: 'Réservation',
        path: '/api/v1/reservations',
        body: {},
        validate: () => {
          throw new Error('Chambre déjà prise sur ce poste.')
        },
        provisional: () => 'jamais',
      }),
    ).rejects.toThrow('Chambre déjà prise sur ce poste.')
    expect(await readOutbox()).toEqual([])
  })
})

describe('Mettre à jour en ligne', () => {
  it('rejoue avec la clé, garde le numéro définitif et ignore les opérations d’un autre utilisateur', async () => {
    const c = client()
    reportUnreachable()
    await write()
    c.setQueryData(['auth', 'me'], { id: 'u-2', name: 'Awa', permissions: [] })
    await write()
    c.setQueryData(['auth', 'me'], USER)
    const [mine] = await readOutbox()

    fetchMock.mockResolvedValue(json({ data: { receipt_number: 'REC-2026-000042' } }, 201))
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
    await write()
    await write()

    fetchMock
      .mockResolvedValueOnce(
        json({ title: 'Trop-perçu', message: 'Le montant dépasse le solde.' }, 422),
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

describe('Éléments créés hors ligne (4.5)', () => {
  /** Réservation créée hors ligne, puis encaissement sur cette réservation encore locale. */
  async function bookThenPay(c: QueryClient) {
    reportUnreachable()
    const local = await runOrQueue<string>({
      kind: 'reservation.create',
      label: 'Réservation — chambre 101',
      path: '/api/v1/reservations',
      body: { room_id: 'room-101' },
      provisional: (operation) => operation.localId!,
    })
    await write(`/api/v1/reservations/${local}/payments`)
    reportReachable()
    void c
    return local
  }

  it('envoie l’encaissement avec l’identifiant donné par le serveur à la réservation', async () => {
    const c = client()
    const local = await bookThenPay(c)
    expect(local).toMatch(/^local-[0-9a-f-]{36}$/)
    fetchMock
      .mockResolvedValueOnce(json({ data: { id: 'srv-reservation-1' } }, 201))
      .mockResolvedValueOnce(json({ data: { receipt_number: 'REC-2026-000050' } }, 201))

    const run = await sendPendingOperations(c, 'reconnect', USER)

    expect(run).toMatchObject({ status: 'success', records: 2 })
    expect(String(fetchMock.mock.calls[1]![0])).toContain(
      '/api/v1/reservations/srv-reservation-1/payments',
    )
    const [booking, payment] = await readOutbox()
    expect(booking).toMatchObject({ status: 'accepted', resultId: 'srv-reservation-1' })
    expect(payment).toMatchObject({ status: 'accepted', definitiveNumber: 'REC-2026-000050' })
  })

  it('refuse avec sa cause un encaissement dont la réservation a été refusée', async () => {
    const c = client()
    await bookThenPay(c)
    fetchMock.mockResolvedValueOnce(
      json({ title: 'Chambre indisponible', message: 'La chambre 101 est déjà réservée.' }, 409),
    )

    await sendPendingOperations(c, 'reconnect', USER)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [booking, payment] = await readOutbox()
    expect(booking).toMatchObject({ status: 'rejected' })
    expect(payment).toMatchObject({
      status: 'rejected',
      error: { code: 'dependency_refused', title: 'Opération liée refusée' },
    })
    expect(payment!.error!.message).toContain('Réservation — chambre 101')
  })

  it('met en file, même en ligne, une opération sur un élément encore local', async () => {
    const c = client()
    await bookThenPay(c)
    const pendingBefore = (await readOutbox()).length
    // En ligne, mais la réservation n’est pas encore envoyée : l’encaissement attend son tour.
    const [booking] = await readOutbox()
    await write(`/api/v1/reservations/${booking!.localId}/payments`)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await readOutbox()).toHaveLength(pendingBefore + 1)
    void c
  })
})

describe('Règles hors ligne et journal du serveur (lot 4A)', () => {
  it('signale chaque rejeu au serveur avec l’opération, son libellé et sa date', async () => {
    const c = client()
    reportUnreachable()
    await write()
    reportReachable()
    fetchMock.mockResolvedValueOnce(json({ data: { receipt_number: 'REC-2026-000077' } }, 201))

    await sendPendingOperations(c, 'reconnect', USER)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const header = (init.headers as Record<string, string>)['X-Offline-Replay']!
    const base64 = header.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))
    const meta = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, string>
    expect(meta).toMatchObject({
      kind: 'payment.record',
      label: 'Encaissement de 20 000 FCFA — chambre 101',
    })
    expect(Date.parse(meta.created_at!)).not.toBeNaN()
  })

  it('applique les règles reçues du serveur : opérations permises et préfixe des numéros', async () => {
    const c = client()
    c.setQueryData(['workstation', 'self'], {
      name: 'Caisse 01',
      offline_rules: {
        allowed_operations: ['payment.record'],
        lock_after_minutes: 15,
        backup_reminder_minutes: 60,
        provisional_prefix: 'HL',
      },
    })
    reportUnreachable()

    expect(await write()).toBe('provisoire HL-CAISSE01-000001')
    await expect(
      runOrQueue({
        kind: 'reservation.cancel',
        label: 'Annulation',
        path: '/api/v1/reservations/r-1/cancel',
        body: {},
        provisional: () => 'jamais',
      }),
    ).rejects.toThrow(/« Annulation » n’est pas permis sans Internet sur ce poste/)
    expect((await readOutbox()).map((o) => o.kind)).toEqual(['payment.record'])
  })
})
