import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reportReachable, reportUnreachable } from './connectivity'
import { coverageRows, countLocal, readServerTotals } from './coverage'
import { registerOfflineCoverage, registerOfflinePreparation } from './essentials'
import { updateLocalCopy, type DownloadProgress } from './localSync'
import { writeOperations, readOutbox, type QueuedOperation } from './outbox'
import { sendPendingOperations } from './outboxSync'
import { createLimiter } from './pacing'
import { readStoredCache } from './persistence'
import { readRuns } from './syncLog'

const USER = { id: 'u-1', name: 'Grâce', permissions: ['test.view'] }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function clientWithUser(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['auth', 'me'], USER)
  return client
}

let fetchMock: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchMock = vi.spyOn(globalThis, 'fetch')
  reportReachable()
})
afterEach(() => vi.useRealTimers())

// Étapes de test, déclarées comme le font les features (permission propre à ces tests).
registerOfflinePreparation({
  order: 1,
  label: 'Séjours de test',
  permission: 'test.view',
  run: async (context) => {
    const list = await context.fetch({
      queryKey: ['test-stays', 'list'],
      queryFn: async () =>
        (await (await fetch('/api/v1/test-stays')).json()) as { data: { id: string }[] },
    })
    for (const stay of list?.data ?? []) context.seed(['test-stays', stay.id], stay)
    context.share(
      'stays',
      (list?.data ?? []).map((stay) => stay.id),
    )
  },
})
registerOfflinePreparation({
  order: 2,
  label: 'Détails de test',
  permission: 'test.view',
  run: async (context) => {
    await Promise.all(
      context.shared('stays').map((id) =>
        context.fetch({
          queryKey: ['test-stays', id, 'payments'],
          queryFn: async () => {
            const response = await fetch(`/api/v1/test-stays/${id}/payments`)
            if (response.status === 429) {
              const { ApiError } = await import('../api/errors')
              throw new ApiError(429, 'Trop de requêtes', 'Patientez.')
            }
            return (await response.json()) as unknown
          },
        }),
      ),
    )
  },
})
registerOfflineCoverage({
  order: 1,
  label: 'Séjours de test',
  permission: 'test.view',
  match: (key) => key[0] === 'test-stays' && key.length === 2,
  serverTotal: async () => 5,
})

describe('Tout télécharger pour le hors ligne', () => {
  it('télécharge les fiches de chaque étape, réessaie après un 429 et garde tout sur le poste', async () => {
    let throttled = false
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/test-stays')) return json({ data: [{ id: 's1' }, { id: 's2' }] })
      if (url.endsWith('/s2/payments') && !throttled) {
        throttled = true
        return json({}, 429)
      }
      if (url.includes('/payments')) return json({ data: [{ id: 'p' }] })
      return json({})
    })
    const client = clientWithUser()
    const steps: DownloadProgress[] = []

    const run = await updateLocalCopy(client, 'full', USER.name, {
      full: true,
      onProgress: (progress) => steps.push(progress),
      retryDelayMs: 0,
    })

    expect(run).toMatchObject({ trigger: 'full', status: 'success', failures: [] })
    // Fiches prises dans la liste, sans requête de plus.
    expect(client.getQueryData(['test-stays', 's1'])).toEqual({ id: 's1' })
    expect(client.getQueryData(['test-stays', 's2', 'payments'])).toEqual({ data: [{ id: 'p' }] })
    expect(throttled).toBe(true)
    expect(steps.map((s) => s.step)).toContain('Détails de test')
    expect(steps.at(-1)).toMatchObject({ step: 'Enregistrement sur le poste', failed: 0 })
    const stored = JSON.stringify((await readStoredCache())?.state.queries.map((q) => q.queryKey))
    expect(stored).toContain('["test-stays","s2","payments"]')
    expect((await readRuns())[0]?.trigger).toBe('full')
  })

  it('n’oublie jamais une donnée sans écran ouvert : la copie survit (gcTime illimité)', async () => {
    const { createQueryClient } = await import('../../app/queryClient')
    const client = createQueryClient(() => undefined)
    expect(client.getDefaultOptions().queries?.gcTime).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('Rythme des échanges en masse', () => {
  it('ne dépasse jamais le nombre de requêtes permis par minute', async () => {
    vi.useFakeTimers()
    const limit = createLimiter(3, 10)
    const started: number[] = []
    const tasks = Array.from({ length: 5 }, () =>
      limit(async () => {
        started.push(Date.now())
      }),
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(started).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(60_100)
    await Promise.all(tasks)
    expect(started).toHaveLength(5)
    expect(started[3]! - started[0]!).toBeGreaterThanOrEqual(60_000)
  })

  it('envoie les opérations en attente malgré un « trop de requêtes » passager', async () => {
    const operation: QueuedOperation = {
      id: '5f0c1d2e-0000-4000-8000-0000000000aa',
      kind: 'payment.record',
      label: 'Encaissement de 5 000 FCFA',
      method: 'POST',
      path: '/api/v1/reservations/r-1/payments',
      body: { amount_fcfa: 5000, method: 'CASH' },
      createdAt: Date.now(),
      userId: USER.id,
      userName: USER.name,
      status: 'pending',
      attempts: 0,
      lastAttemptAt: null,
      error: null,
      provisionalNumber: 'LOC-POSTE-000001',
      definitiveNumber: null,
      localId: 'local-1',
      abandonReason: null,
    }
    await writeOperations([operation])
    fetchMock
      .mockResolvedValueOnce(json({ title: 'Trop de requêtes', message: 'Patientez.' }, 429))
      .mockResolvedValueOnce(json({ data: { receipt_number: 'REC-2026-000010' } }, 201))

    const run = await sendPendingOperations(clientWithUser(), 'reconnect', USER, {
      retryDelayMs: 0,
    })

    expect(run).toMatchObject({ status: 'success', records: 1 })
    expect((await readOutbox())[0]).toMatchObject({
      status: 'accepted',
      definitiveNumber: 'REC-2026-000010',
    })
  })
})

describe('Données sur ce poste et en ligne', () => {
  it('compte les éléments distincts gardés et les compare au total du serveur', async () => {
    const client = clientWithUser()
    client.setQueryData(['test-stays', 'list'], { data: [{ id: 's1' }, { id: 's2' }] })
    client.setQueryData(['test-stays', 's1'], { id: 's1' })
    client.setQueryData(['test-stays', 's3'], { id: 's3' })
    expect(countLocal(client, (key) => key[0] === 'test-stays')).toBe(3)

    const server = await readServerTotals(USER.permissions)
    expect(server).toMatchObject({ live: true, totals: { 'Séjours de test': 5 } })
    expect(coverageRows(client, USER.permissions, server)).toEqual([
      // Liste et fiches (clés à deux éléments) : s1, s2, s3, chacun compté une fois.
      { label: 'Séjours de test', local: 3, server: 5 },
    ])
  })

  it('hors ligne, garde le dernier relevé du serveur avec sa date', async () => {
    await readServerTotals(USER.permissions)
    reportUnreachable()
    const server = await readServerTotals(USER.permissions)
    expect(server).toMatchObject({ live: false, totals: { 'Séjours de test': 5 } })
  })
})
