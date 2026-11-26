import { createHash } from 'node:crypto'
import type { DatabaseSync, StatementSync } from 'node:sqlite'
import type { Sealer } from './sealer.ts'

/**
 * Stockage local du poste Windows (D-069). Il remplace, sous Electron, le petit stockage
 * clé → valeur IndexedDB de la PWA (`frontend/src/shared/offline/storage.ts`) avec la même
 * interface, mais dans SQLite, sur le disque du poste, hors de portée du nettoyage du navigateur.
 *
 * - `outbox` (file des opérations hors ligne) → table `sync_outbox`, une ligne par opération ;
 * - `provisional-sequence` → `sync_state`, croissante (jamais de numéro LOC réutilisé) ;
 * - `query-cache` (copie des données du serveur) → `local_queries`, une ligne par écran ;
 * - les autres clés (session hors ligne, journal de synchronisation…) → `kv`.
 *
 * Chaque écriture est une transaction SQLite : l'écriture métier, l'entrée de la file et le
 * numéro provisoire sont enregistrés ensemble ou pas du tout. Les lectures rendent la version de
 * chaque clé ; une écriture conditionnelle (`expect`) est refusée si une clé a changé entre-temps
 * (le renderer recommence alors sa lecture).
 */
export const OUTBOX_KEY = 'outbox'
export const SEQUENCE_KEY = 'provisional-sequence'
export const CACHE_KEY = 'query-cache'
/** Jamais effacées par « vider le stockage » : opérations et numérotation provisoire. */
const PROTECTED = new Set([OUTBOX_KEY, SEQUENCE_KEY])
const STATUSES = new Set(['pending', 'accepted', 'rejected', 'abandoned'])
const SPLIT_MARKER = '__jbhSplitCache'

export interface StoreRead {
  values: Record<string, unknown>
  versions: Record<string, number>
}

export interface StoreCommit {
  expect?: Record<string, number>
  put?: Record<string, unknown>
  remove?: string[]
}

export type CommitResult = { ok: true } | { ok: false; conflict: string[] }

export interface StoreInfo {
  operations: { pending: number; accepted: number; rejected: number; abandoned: number }
  cachedQueries: number
  keys: number
  sealed: boolean
}

export class StoreError extends Error {}

export function isValidKey(key: unknown): key is string {
  return typeof key === 'string' && key.length > 0 && key.length <= 200
}

interface OutboxRow {
  id: string
  kind: string
  status: string
  userId: string
  createdAt: number
  attempts?: number
  provisionalNumber?: string | null
  definitiveNumber?: string | null
  localId?: string | null
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function nowIso(): string {
  return new Date().toISOString()
}

function toText(value: unknown): string {
  const text = JSON.stringify(value)
  if (text === undefined) throw new StoreError('Valeur impossible à enregistrer sur ce poste.')
  return text
}

function assertOperation(value: unknown): asserts value is OutboxRow {
  const op = value as Partial<OutboxRow> | null
  if (
    !op ||
    typeof op !== 'object' ||
    typeof op.id !== 'string' ||
    op.id.length === 0 ||
    op.id.length > 100 ||
    typeof op.kind !== 'string' ||
    typeof op.status !== 'string' ||
    !STATUSES.has(op.status) ||
    typeof op.userId !== 'string' ||
    typeof op.createdAt !== 'number' ||
    !Number.isFinite(op.createdAt) ||
    op.createdAt <= 0
  ) {
    throw new StoreError('Opération hors ligne invalide : elle n’a pas été enregistrée.')
  }
}

export class LocalStore {
  private readonly db: DatabaseSync
  private readonly sealer: Sealer
  private readonly statements: Record<string, StatementSync>

  constructor(db: DatabaseSync, sealer: Sealer) {
    this.db = db
    this.sealer = sealer
    const prepare = (sql: string) => db.prepare(sql)
    this.statements = {
      version: prepare('SELECT version, present FROM store_keys WHERE key = ?'),
      bump: prepare(`INSERT INTO store_keys (key, version, present, updated_at) VALUES (?, 1, ?, ?)
        ON CONFLICT (key) DO UPDATE SET version = version + 1, present = excluded.present,
        updated_at = excluded.updated_at`),
      kvGet: prepare('SELECT value, sealed FROM kv WHERE key = ?'),
      kvPut: prepare(`INSERT INTO kv (key, value, sealed) VALUES (?, ?, ?)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value, sealed = excluded.sealed`),
      kvDelete: prepare('DELETE FROM kv WHERE key = ?'),
      outboxAll: prepare('SELECT payload, sealed FROM sync_outbox ORDER BY position'),
      outboxDigests: prepare('SELECT id, digest, position FROM sync_outbox'),
      outboxUpsert: prepare(`INSERT INTO sync_outbox (id, position, kind, status, user_id,
          created_at, attempts, provisional_number, definitive_number, local_id, digest, payload,
          sealed, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET position = excluded.position, kind = excluded.kind,
          status = excluded.status, user_id = excluded.user_id, created_at = excluded.created_at,
          attempts = excluded.attempts, provisional_number = excluded.provisional_number,
          definitive_number = excluded.definitive_number, local_id = excluded.local_id,
          digest = excluded.digest, payload = excluded.payload, sealed = excluded.sealed,
          updated_at = excluded.updated_at`),
      outboxMove: prepare('UPDATE sync_outbox SET position = ? WHERE id = ?'),
      outboxDelete: prepare('DELETE FROM sync_outbox WHERE id = ?'),
      sequenceGet: prepare("SELECT value FROM sync_state WHERE key = 'provisional_sequence'"),
      sequencePut: prepare(`INSERT INTO sync_state (key, value, updated_at)
        VALUES ('provisional_sequence', ?, ?)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`),
      queriesAll: prepare('SELECT payload, sealed FROM local_queries ORDER BY position'),
      queriesClear: prepare('DELETE FROM local_queries'),
      queriesInsert: prepare(`INSERT INTO local_queries
        (position, query_hash, root, data_updated_at, bytes, payload, sealed)
        VALUES (?, ?, ?, ?, ?, ?, ?)`),
      audit: prepare('INSERT INTO audit_logs (action, detail) VALUES (?, ?)'),
    }
  }

  read(keys: string[]): StoreRead {
    const values: Record<string, unknown> = {}
    const versions: Record<string, number> = {}
    for (const key of new Set(keys)) {
      if (!isValidKey(key)) throw new StoreError('Clé de stockage invalide.')
      const row = this.versionRow(key)
      versions[key] = row?.version ?? 0
      if (row?.present) values[key] = this.load(key)
    }
    return { values, versions }
  }

  commit(change: StoreCommit): CommitResult {
    const put = change.put ?? {}
    const remove = change.remove ?? []
    for (const key of [...Object.keys(change.expect ?? {}), ...Object.keys(put), ...remove]) {
      if (!isValidKey(key)) throw new StoreError('Clé de stockage invalide.')
    }
    return this.transaction(() => {
      const conflict = Object.entries(change.expect ?? {})
        .filter(([key, version]) => (this.versionRow(key)?.version ?? 0) !== version)
        .map(([key]) => key)
      if (conflict.length > 0) return { ok: false, conflict }
      for (const [key, value] of Object.entries(put)) {
        if (value === undefined) this.erase(key)
        else this.save(key, value)
      }
      for (const key of remove) this.erase(key)
      return { ok: true }
    })
  }

  /** Efface la copie locale et les réglages, jamais la file des opérations ni la numérotation. */
  clear(): void {
    this.transaction(() => {
      const keys = this.db.prepare('SELECT key FROM store_keys WHERE present = 1').all() as {
        key: string
      }[]
      for (const { key } of keys) if (!PROTECTED.has(key)) this.erase(key)
      this.audit('stockage.vide', null)
    })
  }

  /** Taille (octets) de chaque donnée gardée, pour la répartition du stockage. */
  sizes(): Record<string, number> {
    const sizes: Record<string, number> = {}
    const kv = this.db.prepare('SELECT key, length(value) AS bytes FROM kv').all() as {
      key: string
      bytes: number
    }[]
    for (const row of kv) sizes[row.key] = row.bytes
    const outbox = this.db
      .prepare('SELECT COUNT(*) AS n, COALESCE(SUM(length(payload)), 0) AS bytes FROM sync_outbox')
      .get() as { n: number; bytes: number }
    if (outbox.n > 0) sizes[OUTBOX_KEY] = outbox.bytes
    const queries = this.db
      .prepare('SELECT COUNT(*) AS n, COALESCE(SUM(length(payload)), 0) AS bytes FROM local_queries')
      .get() as { n: number; bytes: number }
    if (queries.n > 0) sizes[CACHE_KEY] = (sizes[CACHE_KEY] ?? 0) + queries.bytes
    return sizes
  }

  info(): StoreInfo {
    const operations = { pending: 0, accepted: 0, rejected: 0, abandoned: 0 }
    const rows = this.db
      .prepare('SELECT status, COUNT(*) AS n FROM sync_outbox GROUP BY status')
      .all() as { status: keyof typeof operations; n: number }[]
    for (const row of rows) operations[row.status] = row.n
    const count = (sql: string) => (this.db.prepare(sql).get() as { n: number }).n
    return {
      operations,
      cachedQueries: count('SELECT COUNT(*) AS n FROM local_queries'),
      keys: count('SELECT COUNT(*) AS n FROM store_keys WHERE present = 1'),
      sealed: this.sealer.sealed,
    }
  }

  audit(action: string, detail: unknown): void {
    this.statements.audit!.run(action, detail === null ? null : toText(detail))
  }

  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = work()
      if ((result as CommitResult | undefined)?.ok === false) this.db.exec('ROLLBACK')
      else this.db.exec('COMMIT')
      return result
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK')
      throw error
    }
  }

  private versionRow(key: string): { version: number; present: number } | undefined {
    return this.statements.version!.get(key) as { version: number; present: number } | undefined
  }

  private bump(key: string, present: boolean): void {
    this.statements.bump!.run(key, present ? 1 : 0, nowIso())
  }

  private load(key: string): unknown {
    if (key === OUTBOX_KEY) {
      const rows = this.statements.outboxAll!.all() as { payload: Uint8Array; sealed: number }[]
      return rows.map((row) => JSON.parse(this.sealer.open(row.payload, row.sealed === 1)))
    }
    if (key === SEQUENCE_KEY) {
      const row = this.statements.sequenceGet!.get() as { value: string } | undefined
      return row ? Number(row.value) : undefined
    }
    const row = this.statements.kvGet!.get(key) as
      | { value: Uint8Array; sealed: number }
      | undefined
    if (!row) return undefined
    const value = JSON.parse(this.sealer.open(row.value, row.sealed === 1)) as Record<
      string,
      unknown
    >
    if (key === CACHE_KEY && value && value[SPLIT_MARKER] === true) {
      const queries = (
        this.statements.queriesAll!.all() as { payload: Uint8Array; sealed: number }[]
      ).map((q) => JSON.parse(this.sealer.open(q.payload, q.sealed === 1)) as unknown)
      const meta = value.meta as Record<string, unknown>
      const state = value.state as Record<string, unknown>
      return { ...meta, state: { ...state, queries } }
    }
    return value
  }

  private save(key: string, value: unknown): void {
    this.bump(key, true)
    if (key === OUTBOX_KEY) return this.saveOutbox(value)
    if (key === SEQUENCE_KEY) {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new StoreError('Numérotation provisoire invalide.')
      }
      this.statements.sequencePut!.run(String(value), nowIso())
      return
    }
    const cache = value as { state?: { queries?: unknown } } | null
    if (key === CACHE_KEY && cache && Array.isArray(cache.state?.queries)) {
      return this.saveCache(cache as { state: { queries: unknown[] } })
    }
    this.putKv(key, toText(value))
  }

  private putKv(key: string, text: string): void {
    this.statements.kvPut!.run(key, this.sealer.seal(text), this.sealer.sealed ? 1 : 0)
  }

  private saveOutbox(value: unknown): void {
    if (!Array.isArray(value)) throw new StoreError('File des opérations invalide.')
    const known = new Map(
      (this.statements.outboxDigests!.all() as { id: string; digest: string; position: number }[]).map(
        (row) => [row.id, row],
      ),
    )
    const seen = new Set<string>()
    const now = nowIso()
    value.forEach((operation: unknown, position) => {
      assertOperation(operation)
      if (seen.has(operation.id)) throw new StoreError('Opération en double dans la file.')
      seen.add(operation.id)
      const text = toText(operation)
      const digest = sha256(text)
      const previous = known.get(operation.id)
      if (previous && previous.digest === digest) {
        if (previous.position !== position) this.statements.outboxMove!.run(position, operation.id)
        return
      }
      this.statements.outboxUpsert!.run(
        operation.id,
        position,
        operation.kind,
        operation.status,
        operation.userId,
        Math.trunc(operation.createdAt),
        Math.max(0, Math.trunc(operation.attempts ?? 0)),
        operation.provisionalNumber ?? null,
        operation.definitiveNumber ?? null,
        operation.localId ?? null,
        digest,
        this.sealer.seal(text),
        this.sealer.sealed ? 1 : 0,
        now,
      )
    })
    for (const id of known.keys()) if (!seen.has(id)) this.statements.outboxDelete!.run(id)
  }

  private saveCache(cache: { state: { queries: unknown[] } }): void {
    const { state, ...meta } = cache as { state: Record<string, unknown> } & Record<string, unknown>
    const { queries, ...rest } = state as { queries: unknown[] } & Record<string, unknown>
    this.putKv(CACHE_KEY, toText({ [SPLIT_MARKER]: true, meta, state: rest }))
    this.statements.queriesClear!.run()
    const hashes = new Set<string>()
    queries.forEach((query, position) => {
      const q = query as {
        queryKey?: unknown[]
        queryHash?: unknown
        state?: { dataUpdatedAt?: unknown }
      }
      let hash = typeof q.queryHash === 'string' ? q.queryHash : `#${position}`
      if (hashes.has(hash)) hash = `${hash}#${position}`
      hashes.add(hash)
      const text = toText(query)
      const updated = q.state?.dataUpdatedAt
      this.statements.queriesInsert!.run(
        position,
        hash,
        String(Array.isArray(q.queryKey) ? (q.queryKey[0] ?? '') : ''),
        typeof updated === 'number' && Number.isFinite(updated) ? Math.trunc(updated) : null,
        Buffer.byteLength(text),
        this.sealer.seal(text),
        this.sealer.sealed ? 1 : 0,
      )
    })
  }

  private erase(key: string): void {
    if (key === SEQUENCE_KEY) {
      throw new StoreError('La numérotation provisoire ne peut pas être effacée.')
    }
    this.bump(key, false)
    if (key === OUTBOX_KEY) {
      for (const row of this.statements.outboxDigests!.all() as { id: string }[]) {
        this.statements.outboxDelete!.run(row.id)
      }
      return
    }
    if (key === CACHE_KEY) this.statements.queriesClear!.run()
    this.statements.kvDelete!.run(key)
  }
}
