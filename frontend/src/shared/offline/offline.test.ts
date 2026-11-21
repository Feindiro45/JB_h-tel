import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/errors'
import { getConnectivity, reportReachable, reportUnreachable } from './connectivity'
import { countRecords, describeLocalCopy, updateLocalCopy } from './localSync'
import { restoreQueryCache, saveQueryCache } from './persistence'
import { apiPrefixFor } from './registerServiceWorker'
import {
  OFFLINE_SESSION_MAX_MS,
  readSession,
  rememberSession,
  sessionExpired,
  verifyOfflinePassword,
} from './session'
import { readRuns } from './syncLog'

const USER = { id: 'u-1', name: 'Grâce' }

function clientWith(data: Record<string, unknown>): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['auth', 'me'], USER)
  for (const [key, value] of Object.entries(data)) client.setQueryData(key.split('/'), value)
  return client
}

afterEach(() => vi.useRealTimers())

describe('Session hors ligne (D-064)', () => {
  it('vérifie le mot de passe par son empreinte, jamais stockée en clair', async () => {
    await rememberSession(USER, 'Secret-2026')
    const session = await readSession()
    expect(JSON.stringify(session)).not.toContain('Secret-2026')
    expect(session?.hash).toBeTruthy()
    expect(await verifyOfflinePassword('Secret-2026')).toBe(true)
    expect(await verifyOfflinePassword('secret-2026')).toBe(false)
  })

  it('expire 12 h après la dernière confirmation du serveur', async () => {
    await rememberSession(USER, 'x')
    const session = await readSession()
    expect(sessionExpired(session, session!.lastOnlineAt + OFFLINE_SESSION_MAX_MS - 1)).toBe(false)
    expect(sessionExpired(session, session!.lastOnlineAt + OFFLINE_SESSION_MAX_MS + 1)).toBe(true)
    expect(sessionExpired(undefined)).toBe(true)
  })
})

describe('Copie locale des données consultées', () => {
  it('restaure les lectures de l’utilisateur, sans les écrans d’administration', async () => {
    const source = clientWith({
      'reservations/list': { data: [{ id: 'r1' }, { id: 'r2' }] },
      'audit/list': { data: [{ id: 'a1' }] },
    })
    await saveQueryCache(source)

    const target = new QueryClient()
    expect(await restoreQueryCache(target)).not.toBeNull()
    expect(target.getQueryData(['reservations', 'list'])).toEqual({
      data: [{ id: 'r1' }, { id: 'r2' }],
    })
    expect(target.getQueryData(['auth', 'me'])).toEqual(USER)
    expect(target.getQueryData(['audit', 'list'])).toBeUndefined()
  })

  it('ignore une copie de plus de 12 h', async () => {
    await saveQueryCache(clientWith({ 'reservations/list': { data: [] } }))
    const target = new QueryClient()
    expect(await restoreQueryCache(target, Date.now() + OFFLINE_SESSION_MAX_MS + 1)).toBeNull()
    expect(target.getQueryData(['reservations', 'list'])).toBeUndefined()
  })

  it('compte les éléments par jeu de données', () => {
    expect(countRecords({ data: [1, 2, 3], meta: {} })).toBe(3)
    expect(countRecords([1, 2])).toBe(2)
    expect(countRecords({ data: { id: 'x' } })).toBe(1)
    expect(countRecords(null)).toBe(0)
    const client = clientWith({
      'reservations/page-1': { data: [1, 2] },
      'reservations/page-2': { data: [3] },
    })
    expect(describeLocalCopy(client)).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Réservations', records: 3 })]),
    )
  })
})

describe('Mettre à jour en local', () => {
  it('journalise une mise à jour partielle avec la cause de chaque échec', async () => {
    const client = clientWith({})
    client.setQueryDefaults(['reservations'], { queryFn: async () => ({ data: [1, 2] }) })
    client.setQueryDefaults(['customers'], {
      queryFn: async () => {
        throw new ApiError(
          403,
          'Accès refusé',
          'Vous n’avez pas le droit de consulter les clients.',
        )
      },
    })
    client.setQueryData(['reservations', 'list'], { data: [1] })
    client.setQueryData(['customers', 'list'], { data: [1] })

    const run = await updateLocalCopy(client, 'manual', 'Grâce')

    expect(run.status).toBe('partial')
    expect(run.direction).toBe('local')
    expect(run.records).toBeGreaterThanOrEqual(2)
    expect(run.failures).toEqual([
      { dataset: 'Clients', cause: 'Vous n’avez pas le droit de consulter les clients.' },
    ])
    expect(run.bytes).toBeGreaterThan(0)
    // La session restaurée sans fonction de chargement est gardée, pas comptée en échec.
    expect(run.skipped).toBe(1)
    expect((await readRuns())[0]).toEqual(run)
  })

  it('consigne un échec explicite quand le serveur est injoignable', async () => {
    reportUnreachable()
    const run = await updateLocalCopy(clientWith({}), 'manual', null)
    expect(run.status).toBe('failure')
    expect(run.failures[0]?.cause).toContain('Connexion impossible')
    reportReachable()
    expect(getConnectivity().online).toBe(true)
  })
})

describe('Service worker', () => {
  it('ne transmet le préfixe de l’API que sur le même domaine', () => {
    expect(apiPrefixFor('https://hotel.cf/backend', 'https://hotel.cf')).toBe('/backend')
    expect(apiPrefixFor('https://api.hotel.cf', 'https://hotel.cf')).toBe('')
    expect(apiPrefixFor('http://localhost:8000', 'http://localhost:5173')).toBe('')
  })
})
