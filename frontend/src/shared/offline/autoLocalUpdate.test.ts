import { hashKey, QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { DesktopBridge, StoreCommit } from '../desktop/bridge'
import {
  AUTO_LOCAL_UPDATE,
  lastUpdates,
  nextAutoUpdate,
  resetAutoLocalUpdateForTests,
  runAutoLocalUpdate,
} from './autoLocalUpdate'
import { reportUnreachable } from './connectivity'
import { isSyncing } from './localSync'
import { enqueueOperation } from './outbox'
import { pullServerChanges } from './serverChanges'
import { readRuns, type SyncRun } from './syncLog'

const USER = { id: 'u-1', name: 'Awa' }
const HOUR = 3_600_000
const NOW = Date.UTC(2026, 10, 23, 9, 0)

afterEach(() => resetAutoLocalUpdateForTests())

/** Logiciel Windows simulé : la mise à jour automatique n'y est active que là (et PWA installée). */
function desktop() {
  const values = new Map<string, unknown>()
  const versions = new Map<string, number>()
  window.jbDesktop = {
    kind: 'windows',
    apiBase: 'http://localhost:8000',
    storage: {
      read: async (keys: string[]) => ({
        values: Object.fromEntries(
          keys.filter((k) => values.has(k)).map((k) => [k, structuredClone(values.get(k))]),
        ),
        versions: Object.fromEntries(keys.map((k) => [k, versions.get(k) ?? 0])),
      }),
      commit: async (change: StoreCommit) => {
        for (const [key, value] of Object.entries(change.put ?? {})) {
          values.set(key, structuredClone(value))
          versions.set(key, (versions.get(key) ?? 0) + 1)
        }
        for (const key of change.remove ?? []) values.delete(key)
        return { ok: true as const }
      },
      clear: async () => values.clear(),
      sizes: async () => ({}),
    },
    system: { info: async () => ({ databaseBytes: 1, freeBytes: 1 }), onResume: () => () => {} },
  } as unknown as DesktopBridge
}

function run(
  trigger: SyncRun['trigger'],
  startedAt: number,
  extra: Partial<SyncRun> = {},
): SyncRun {
  return {
    id: String(startedAt),
    direction: 'local',
    trigger,
    startedAt,
    finishedAt: startedAt,
    status: 'success',
    datasets: 1,
    records: 1,
    skipped: 0,
    bytes: null,
    failures: [],
    user: 'Awa',
    ...extra,
  }
}

/** Écran déjà ouvert sur le poste (donnée gardée, rechargeable). */
async function keptScreen(
  client: QueryClient,
  key: unknown[],
  load: Mock<() => Promise<unknown>> = vi.fn(async (): Promise<unknown> => ({ data: [] })),
) {
  await client.fetchQuery({ queryKey: key, queryFn: load })
  return load
}

describe('Mise à jour automatique du poste : quand (D-070)', () => {
  it('tout le poste au premier démarrage et toutes les 3 h', () => {
    expect(nextAutoUpdate({ full: null, local: null }, false, NOW)).toBe('full')
    expect(nextAutoUpdate({ full: NOW - 3 * HOUR, local: NOW - 60_000 }, false, NOW)).toBe('full')
  })

  it('les écrans toutes les 15 min, ou 2 min après un changement du serveur', () => {
    const last = { full: NOW - HOUR, local: NOW - 5 * 60_000 }
    expect(nextAutoUpdate(last, false, NOW)).toBeNull()
    expect(nextAutoUpdate(last, true, NOW)).toBe('essentials')
    expect(nextAutoUpdate({ ...last, local: NOW - 60_000 }, true, NOW)).toBeNull()
    expect(
      nextAutoUpdate({ ...last, local: NOW - AUTO_LOCAL_UPDATE.essentialsEveryMs }, false, NOW),
    ).toBe('essentials')
  })

  it('ne compte que les mises à jour du poste réussies (même partielles)', () => {
    const runs = [
      run('auto', NOW - 1000, { status: 'failure' }),
      run('auto', NOW - 2000, { direction: 'online' }),
      run('manual', NOW - 3000, { status: 'partial' }),
      run('auto-full', NOW - 4000),
    ]
    expect(lastUpdates(runs)).toEqual({ full: NOW - 4000, local: NOW - 3000 })
  })
})

describe('Mise à jour automatique du poste : exécution', () => {
  it('inactive dans le navigateur non installé', async () => {
    const client = new QueryClient()
    const load = await keptScreen(client, ['reservations', 'list'])
    expect(await runAutoLocalUpdate(client, USER)).toBeNull()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('sur le logiciel Windows : télécharge tout seul, sans masquer les erreurs des autres écrans', async () => {
    desktop()
    const client = new QueryClient()
    const seen: boolean[] = []
    const load = await keptScreen(
      client,
      ['reservations', 'list'],
      vi.fn(async () => {
        seen.push(isSyncing(hashKey(['reservations', 'list'])), isSyncing(hashKey(['autre'])))
        return { data: [{ id: 'r1' }] }
      }),
    )
    expect(await runAutoLocalUpdate(client, USER)).toBe('full')
    expect(load).toHaveBeenCalledTimes(2)
    expect(seen.slice(-2)).toEqual([true, false])
    const runs = await readRuns()
    expect(runs[0]).toMatchObject({ trigger: 'auto-full', direction: 'local', status: 'success' })
    // Juste après : rien à faire.
    expect(await runAutoLocalUpdate(client, USER)).toBeNull()
  })

  it('les passages réussis ne remplissent pas l’historique', async () => {
    desktop()
    const client = new QueryClient()
    await keptScreen(client, ['reservations', 'list'])
    await runAutoLocalUpdate(client, USER)
    const later = Date.now() + AUTO_LOCAL_UPDATE.essentialsEveryMs + 1000
    expect(await runAutoLocalUpdate(client, USER, { now: later })).toBe('essentials')
    expect(
      await runAutoLocalUpdate(client, USER, {
        now: later + AUTO_LOCAL_UPDATE.essentialsEveryMs + 1000,
      }),
    ).toBe('essentials')
    const auto = (await readRuns()).filter((r) => r.trigger === 'auto')
    expect(auto).toHaveLength(1)
  })

  it('attend l’envoi des opérations faites hors ligne, et ne fait rien sans réseau', async () => {
    desktop()
    const client = new QueryClient()
    const load = await keptScreen(client, ['reservations', 'list'])
    await enqueueOperation({
      id: 'op-1',
      kind: 'payment.record',
      label: 'Encaissement',
      method: 'POST',
      path: '/api/v1/reservations/r1/payments',
      body: {},
      createdAt: Date.now(),
      userId: USER.id,
      userName: USER.name,
      status: 'pending',
      attempts: 0,
      lastAttemptAt: null,
      error: null,
      provisionalNumber: null,
      definitiveNumber: null,
      localId: null,
      abandonReason: null,
    })
    expect(await runAutoLocalUpdate(client, USER)).toBeNull()
    expect(load).toHaveBeenCalledTimes(1)
    reportUnreachable()
    expect(await runAutoLocalUpdate(client, { id: 'u-2', name: 'Grâce' })).toBeNull()
  })

  it('relit tout de suite une fiche changée ailleurs, même écran fermé', async () => {
    desktop()
    const client = new QueryClient()
    await keptScreen(client, ['reservations', 'list'])
    await runAutoLocalUpdate(client, USER)
    const detail = await keptScreen(
      client,
      ['reservations', 'r-42'],
      vi.fn(async () => ({ data: {} })),
    )
    const replies = [
      { data: { protocol: 1, server_time: '', cursor: 'v1.1', poll_seconds: 30 } },
      {
        data: [{ entity: 'payment', id: 'r-42', action: 'updated', occurred_at: '' }],
        meta: { cursor: 'v1.2', has_more: false, protocol: 1 },
      },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(replies.shift()), { status: 200 })),
    )
    await pullServerChanges(client, USER)
    const changes = await pullServerChanges(client, USER)
    expect(changes).toBe(1)
    await runAutoLocalUpdate(client, USER, { changes })
    expect(detail).toHaveBeenCalledTimes(2)
  })
})
