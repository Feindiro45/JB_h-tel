import { describe, expect, it, vi } from 'vitest'
import {
  enqueueOperation,
  readOutbox,
  updateOperation,
  type QueuedOperation,
} from '../offline/outbox'
import {
  requestPersistentStorage,
  storageClear,
  storageDelete,
  storageGet,
  storageMutate,
  storageProtection,
  storageSet,
} from '../offline/storage'
import type { DesktopBridge, StoreCommit } from './bridge'
import { isDesktop } from './bridge'

/**
 * Logiciel Windows (D-069) : le stockage hors ligne passe par la base SQLite du processus
 * principal. Ici, un pont simulé avec versions par clé, comme `electron/src/main/storage/store.ts`.
 */
function fakeBridge() {
  const values = new Map<string, unknown>()
  const versions = new Map<string, number>()
  let interfere: (() => void) | null = null
  const commit = vi.fn(async (change: StoreCommit) => {
    interfere?.()
    interfere = null
    const conflict = Object.entries(change.expect ?? {})
      .filter(([key, version]) => (versions.get(key) ?? 0) !== version)
      .map(([key]) => key)
    if (conflict.length) return { ok: false as const, conflict }
    for (const [key, value] of Object.entries(change.put ?? {})) {
      values.set(key, structuredClone(value))
      versions.set(key, (versions.get(key) ?? 0) + 1)
    }
    for (const key of change.remove ?? []) {
      values.delete(key)
      versions.set(key, (versions.get(key) ?? 0) + 1)
    }
    return { ok: true as const }
  })
  const bridge = {
    kind: 'windows',
    apiBase: 'app://jbhotel/server',
    storage: {
      read: async (keys: string[]) => ({
        values: Object.fromEntries(
          keys.filter((k) => values.has(k)).map((k) => [k, structuredClone(values.get(k))]),
        ),
        versions: Object.fromEntries(keys.map((k) => [k, versions.get(k) ?? 0])),
      }),
      commit,
      clear: vi.fn(async () => {
        for (const key of [...values.keys()]) if (key !== 'outbox') values.delete(key)
      }),
      sizes: async () => ({}),
    },
    system: {
      info: async () => ({ databaseBytes: 4096, freeBytes: 10_000 }),
      onResume: () => () => undefined,
    },
  } as unknown as DesktopBridge
  window.jbDesktop = bridge
  return {
    values,
    commit,
    bridge,
    /** Simule une autre écriture juste avant la prochaine validation. */
    interfereOnce(change: () => void) {
      interfere = change
    },
    bump(key: string, value: unknown) {
      values.set(key, value)
      versions.set(key, (versions.get(key) ?? 0) + 1)
    },
  }
}

function operation(id: string): QueuedOperation {
  return {
    id,
    kind: 'payment.record',
    label: 'Encaissement',
    method: 'POST',
    path: '/api/v1/reservations/r1/payments',
    body: { amount_fcfa: 20000 },
    createdAt: Date.now(),
    userId: 'u-1',
    userName: 'Awa',
    status: 'pending',
    attempts: 0,
    lastAttemptAt: null,
    error: null,
    provisionalNumber: null,
    definitiveNumber: null,
    localId: null,
    abandonReason: null,
  }
}

describe('Stockage du poste Windows (SQLite, D-069)', () => {
  it('est choisi dès que le pont du logiciel est présent', async () => {
    expect(isDesktop()).toBe(false)
    const fake = fakeBridge()
    expect(isDesktop()).toBe(true)
    expect(await storageSet('a', { x: 1 })).toBe(true)
    expect(fake.values.get('a')).toEqual({ x: 1 })
    expect(await storageGet('a')).toEqual({ x: 1 })
    await storageDelete('a')
    expect(await storageGet('a')).toBeUndefined()
    expect(await requestPersistentStorage()).toBe(true)
    expect(await storageProtection()).toMatchObject({ durable: true, persisted: true, usage: 4096 })
  })

  it('opération et numéro provisoire écrits ensemble ; refaits si une autre écriture passe avant', async () => {
    const fake = fakeBridge()
    fake.interfereOnce(() => fake.bump('provisional-sequence', 7))
    const saved = await enqueueOperation(operation('op-1'), { station: 'Poste 1', prefix: 'LOC' })
    expect(saved.provisionalNumber).toBe('LOC-POSTE1-000008')
    expect(fake.commit).toHaveBeenCalledTimes(2)
    expect(fake.values.get('provisional-sequence')).toBe(8)
    expect((await readOutbox()).map((op) => op.id)).toEqual(['op-1'])
    await updateOperation('op-1', { status: 'accepted', definitiveNumber: 'REC-000001' })
    expect((await readOutbox())[0]).toMatchObject({
      status: 'accepted',
      definitiveNumber: 'REC-000001',
    })
  })

  it('une erreur métier dans le calcul n’écrit rien', async () => {
    const fake = fakeBridge()
    await expect(
      storageMutate(['outbox'], () => {
        throw new Error('refus')
      }),
    ).rejects.toThrow('refus')
    expect(fake.commit).not.toHaveBeenCalled()
  })

  it('base inaccessible : message de stockage indisponible, sans perte silencieuse', async () => {
    const fake = fakeBridge()
    fake.commit.mockRejectedValueOnce(new Error('disque plein'))
    await expect(enqueueOperation(operation('op-2'))).rejects.toThrow(
      /stockage durable indisponible/,
    )
    expect(await storageSet('b', 1)).toBe(true)
  })

  it('vider le stockage passe par le poste (qui garde la file des opérations)', async () => {
    const fake = fakeBridge()
    await enqueueOperation(operation('op-3'))
    await storageClear()
    expect(fake.bridge.storage.clear).toHaveBeenCalled()
    expect((await readOutbox()).length).toBe(1)
  })
})
