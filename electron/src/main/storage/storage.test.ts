import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, beforeEach, describe, test } from 'node:test'
import { openDatabase } from './database.ts'
import { LocalDatabase } from './localDatabase.ts'
import { APPLICATION_ID, DowngradeError, migrate, MIGRATIONS } from './migrations.ts'
import { keySealer, newKey, plainSealer } from './sealer.ts'
import { CACHE_KEY, LocalStore, OUTBOX_KEY, SEQUENCE_KEY } from './store.ts'

const root = mkdtempSync(join(tmpdir(), 'jbh-store-'))
after(() => {
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {
    // Fichier encore ouvert sous Windows : le dossier temporaire sera nettoyé plus tard.
  }
})

let dir: string
let count = 0
beforeEach(() => {
  dir = join(root, String(++count))
})

function operation(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    kind: 'payment.record',
    label: 'Encaissement de 20 000 FCFA — chambre 101',
    method: 'POST',
    path: '/api/v1/reservations/r1/payments',
    body: { amount_fcfa: 20000 },
    createdAt: 1_764_000_000_000 + count,
    userId: 'u-1',
    userName: 'Caissière',
    status: 'pending',
    attempts: 0,
    lastAttemptAt: null,
    error: null,
    provisionalNumber: `LOC-POSTE-${id}`,
    definitiveNumber: null,
    localId: `local-${id}`,
    abandonReason: null,
    ...extra,
  }
}

async function openLocal(sealer = keySealer(newKey(), 'memory')) {
  return LocalDatabase.open({
    file: join(dir, 'jbhotel.sqlite'),
    backupsDir: join(dir, 'sauvegardes'),
    sealer,
  })
}

function rawStore(): LocalStore {
  const db = openDatabase(':memory:')
  migrate(db)
  return new LocalStore(db, keySealer(newKey(), 'memory'))
}

describe('migrations', () => {
  test('applique le schéma une seule fois et signe la base', () => {
    const db = openDatabase(':memory:')
    assert.deepEqual(migrate(db), [1])
    assert.deepEqual(migrate(db), [])
    const id = (db.prepare('PRAGMA application_id').get() as { application_id: number })
      .application_id
    assert.equal(id, APPLICATION_ID)
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')").all() as {
        name: string
      }[]
    ).map((t) => t.name)
    for (const name of ['sync_outbox', 'sync_state', 'local_queries', 'audit_logs', 'sync_conflicts'])
      assert.ok(tables.includes(name), name)
  })

  test('refuse une base créée par une version plus récente', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
      (MIGRATIONS.at(-1)?.version ?? 0) + 1,
      'future',
    )
    assert.throws(() => migrate(db), DowngradeError)
  })
})

describe('stockage clé → valeur', () => {
  test('lit, écrit et versionne chaque clé', () => {
    const store = rawStore()
    assert.deepEqual(store.read(['a']), { values: {}, versions: { a: 0 } })
    assert.deepEqual(store.commit({ put: { a: { x: 1 } } }), { ok: true })
    assert.deepEqual(store.read(['a']), { values: { a: { x: 1 } }, versions: { a: 1 } })
    store.commit({ remove: ['a'] })
    assert.deepEqual(store.read(['a']), { values: {}, versions: { a: 2 } })
  })

  test('refuse une écriture conditionnelle si la clé a changé entre-temps', () => {
    const store = rawStore()
    store.commit({ put: { a: 1 } })
    const first = store.read(['a'])
    store.commit({ put: { a: 2 } })
    assert.deepEqual(store.commit({ expect: first.versions, put: { a: 3 } }), {
      ok: false,
      conflict: ['a'],
    })
    assert.equal(store.read(['a']).values.a, 2)
  })

  test('transaction : la file, la numérotation et la copie sont écrites ensemble ou pas du tout', () => {
    const store = rawStore()
    store.commit({ put: { [SEQUENCE_KEY]: 4 } })
    assert.throws(() =>
      store.commit({
        put: {
          [OUTBOX_KEY]: [operation('op-1')],
          [SEQUENCE_KEY]: 3, // recul interdit par la base
        },
      }),
    )
    assert.deepEqual(store.read([OUTBOX_KEY, SEQUENCE_KEY]).values, { [SEQUENCE_KEY]: 4 })
  })

  test('la file est rangée en lignes et une opération acceptée reste définitive', () => {
    const local = rawStore()
    const ops = [operation('op-1'), operation('op-22')]
    local.commit({ put: { [OUTBOX_KEY]: ops } })
    assert.deepEqual(local.read([OUTBOX_KEY]).values[OUTBOX_KEY], ops)
    const accepted = [{ ...ops[0], status: 'accepted', definitiveNumber: 'REC-000001' }, ops[1]]
    local.commit({ put: { [OUTBOX_KEY]: accepted } })
    assert.equal(local.info().operations.accepted, 1)
    assert.throws(() =>
      local.commit({ put: { [OUTBOX_KEY]: [{ ...accepted[0], status: 'pending' }, ops[1]] } }),
    )
    assert.deepEqual(local.read([OUTBOX_KEY]).values[OUTBOX_KEY], accepted)
  })

  test('refuse une opération invalide ou en double', () => {
    const store = rawStore()
    assert.throws(() => store.commit({ put: { [OUTBOX_KEY]: [{ id: 'x' }] } }))
    assert.throws(() =>
      store.commit({ put: { [OUTBOX_KEY]: [operation('op-1'), operation('op-1')] } }),
    )
    assert.deepEqual(store.read([OUTBOX_KEY]).values, {})
  })

  test('la copie des données est gardée par écran et rendue à l’identique', () => {
    const store = rawStore()
    const cache = {
      userId: 'u-1',
      savedAt: 123,
      state: {
        mutations: [],
        queries: [
          { queryKey: ['reservations', { page: 1 }], queryHash: '["reservations",{"page":1}]', state: { data: { data: [{ id: 'r1' }] }, dataUpdatedAt: 5 } },
          { queryKey: ['customers'], queryHash: '["customers"]', state: { data: { data: [] }, dataUpdatedAt: 6 } },
        ],
      },
    }
    store.commit({ put: { [CACHE_KEY]: cache } })
    assert.deepEqual(store.read([CACHE_KEY]).values[CACHE_KEY], cache)
    assert.equal(store.info().cachedQueries, 2)
    assert.ok((store.sizes()[CACHE_KEY] ?? 0) > 0)
  })

  test('vider le stockage garde la file et la numérotation', () => {
    const store = rawStore()
    store.commit({
      put: { [OUTBOX_KEY]: [operation('op-1')], [SEQUENCE_KEY]: 1, 'offline-session': { a: 1 } },
    })
    store.clear()
    const { values } = store.read([OUTBOX_KEY, SEQUENCE_KEY, 'offline-session'])
    assert.equal((values[OUTBOX_KEY] as unknown[]).length, 1)
    assert.equal(values[SEQUENCE_KEY], 1)
    assert.equal(values['offline-session'], undefined)
  })

  test('les valeurs sont chiffrées sur le disque', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    const store = new LocalStore(db, keySealer(newKey(), 'memory'))
    store.commit({ put: { [OUTBOX_KEY]: [operation('op-1')], 'offline-session': { name: 'Awa' } } })
    const raw = db.prepare('SELECT payload FROM sync_outbox').get() as { payload: Uint8Array }
    assert.ok(!Buffer.from(raw.payload).toString('latin1').includes('Encaissement'))
    const kv = db.prepare("SELECT value FROM kv WHERE key = 'offline-session'").get() as {
      value: Uint8Array
    }
    assert.ok(!Buffer.from(kv.value).toString('latin1').includes('Awa'))
  })

  test('journal de la file : ajout, changement d’état et retrait sont tracés', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    const store = new LocalStore(db, plainSealer)
    store.commit({ put: { [OUTBOX_KEY]: [operation('op-1')] } })
    store.commit({ put: { [OUTBOX_KEY]: [operation('op-1', { status: 'rejected' })] } })
    store.commit({ put: { [OUTBOX_KEY]: [] } })
    const events = db.prepare('SELECT event, old_status, new_status FROM sync_outbox_journal ORDER BY seq').all()
    assert.deepEqual(
      events.map((e) => ({ ...e })),
      [
        { event: 'queued', old_status: null, new_status: 'pending' },
        { event: 'status', old_status: 'pending', new_status: 'rejected' },
        { event: 'removed', old_status: 'rejected', new_status: null },
      ],
    )
  })

  test('100 opérations enregistrées une par une restent dans l’ordre', () => {
    const store = rawStore()
    for (let i = 0; i < 100; i++) {
      const { values, versions } = store.read([OUTBOX_KEY, SEQUENCE_KEY])
      const ops = (values[OUTBOX_KEY] as unknown[] | undefined) ?? []
      const result = store.commit({
        expect: versions,
        put: {
          [OUTBOX_KEY]: [...ops, operation(`op-${i}`, { provisionalNumber: `LOC-P-${i}` })],
          [SEQUENCE_KEY]: i + 1,
        },
      })
      assert.deepEqual(result, { ok: true })
    }
    const ops = store.read([OUTBOX_KEY]).values[OUTBOX_KEY] as { id: string }[]
    assert.equal(ops.length, 100)
    assert.equal(ops[99]!.id, 'op-99')
  })
})

describe('base locale sur disque', () => {
  test('les données survivent à la fermeture et à la réouverture (redémarrage du poste)', async () => {
    const sealer = keySealer(newKey(), 'memory')
    const first = await openLocal(sealer)
    first.store.commit({ put: { [OUTBOX_KEY]: [operation('op-1')], [SEQUENCE_KEY]: 1 } })
    first.close()
    const second = await openLocal(sealer)
    assert.equal((second.store.read([OUTBOX_KEY]).values[OUTBOX_KEY] as unknown[]).length, 1)
    second.close()
  })

  test('sauvegarde vérifiée puis restauration sans perdre les opérations plus récentes', async () => {
    const local = await openLocal()
    local.store.commit({ put: { [OUTBOX_KEY]: [operation('op-1')], [SEQUENCE_KEY]: 1 } })
    const saved = await local.backup('manual')
    assert.ok(existsSync(saved.file))
    local.store.commit({
      put: { [OUTBOX_KEY]: [operation('op-1'), operation('op-2')], [SEQUENCE_KEY]: 2 },
    })
    const { kept } = await local.restore(saved.file)
    assert.equal(kept, 1)
    const values = local.store.read([OUTBOX_KEY, SEQUENCE_KEY]).values
    assert.deepEqual(
      (values[OUTBOX_KEY] as { id: string }[]).map((op) => op.id),
      ['op-1', 'op-2'],
    )
    assert.equal(values[SEQUENCE_KEY], 2)
    assert.ok(local.backups.list().some((item) => item.reason === 'restore'))
    local.close()
  })

  test('base endommagée : mise de côté et reprise depuis la dernière sauvegarde valide', async () => {
    const sealer = keySealer(newKey(), 'memory')
    const local = await openLocal(sealer)
    local.store.commit({ put: { [OUTBOX_KEY]: [operation('op-1')] } })
    await local.backup('auto')
    local.close()
    writeFileSync(join(dir, 'jbhotel.sqlite'), 'ceci n’est pas une base SQLite'.repeat(200))
    const reopened = await openLocal(sealer)
    assert.ok(reopened.recovery?.restoredFrom)
    assert.ok(existsSync(reopened.recovery!.corruptFile))
    assert.equal((reopened.store.read([OUTBOX_KEY]).values[OUTBOX_KEY] as unknown[]).length, 1)
    reopened.close()
  })

  test('refuse de restaurer un fichier qui n’est pas une sauvegarde JB Hôtel', async () => {
    const local = await openLocal()
    const other = join(dir, 'autre.sqlite')
    const db = openDatabase(other)
    db.exec('CREATE TABLE t (a)')
    db.close()
    await assert.rejects(() => local.restore(other), /Sauvegarde refusée/)
    local.close()
  })

  test('rotation : seules les sauvegardes les plus récentes sont gardées', async () => {
    const local = await LocalDatabase.open({
      file: join(dir, 'jbhotel.sqlite'),
      backupsDir: join(dir, 'sauvegardes'),
      sealer: plainSealer,
      keepBackups: 3,
    })
    for (let i = 0; i < 5; i++) await local.backups.create(local.db, 'auto', new Date(2026, 10, 1 + i))
    assert.equal(readdirSync(join(dir, 'sauvegardes')).length, 3)
    assert.equal(local.backups.isDue(new Date(2026, 10, 5, 12)), false)
    assert.equal(local.backups.isDue(new Date(2026, 10, 7)), true)
    local.close()
  })
})
