import type { DatabaseSync } from 'node:sqlite'

/**
 * Migrations de la base locale SQLite du poste Windows (D-069). Chaque migration est appliquée
 * une seule fois, dans sa propre transaction, et notée dans `schema_migrations`. Une base créée
 * par une version plus récente du logiciel est refusée (pas de retour arrière silencieux).
 *
 * Le modèle local ne recopie pas les tables métier MySQL : le serveur reste l'autorité, et le
 * poste garde (1) la file des opérations hors ligne, (2) la copie des données du serveur telles
 * que l'API les présente, par écran, (3) l'état de synchronisation, le journal local et les
 * impressions. Voir docs/SQLITE_SCHEMA_AND_MIGRATIONS.md.
 */
export interface Migration {
  version: number
  name: string
  up: string
}

/** « JBHO » : signe les fichiers de base et de sauvegarde de JB Hôtel. */
export const APPLICATION_ID = 0x4a42484f

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'stockage_local_initial',
    up: `
      CREATE TABLE store_keys (
        key TEXT PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 200),
        version INTEGER NOT NULL CHECK (version >= 0),
        present INTEGER NOT NULL CHECK (present IN (0, 1)),
        updated_at TEXT NOT NULL
      ) WITHOUT ROWID;

      CREATE TABLE kv (
        key TEXT PRIMARY KEY REFERENCES store_keys (key) ON DELETE CASCADE,
        value BLOB NOT NULL,
        sealed INTEGER NOT NULL CHECK (sealed IN (0, 1))
      ) WITHOUT ROWID;

      CREATE TABLE sync_outbox (
        id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 100),
        position INTEGER NOT NULL CHECK (position >= 0),
        kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 60),
        status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'abandoned')),
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL CHECK (created_at > 0),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        provisional_number TEXT UNIQUE,
        definitive_number TEXT,
        local_id TEXT,
        digest TEXT NOT NULL,
        payload BLOB NOT NULL,
        sealed INTEGER NOT NULL CHECK (sealed IN (0, 1)),
        updated_at TEXT NOT NULL
      );
      CREATE INDEX sync_outbox_status ON sync_outbox (status, created_at);

      CREATE TABLE sync_outbox_journal (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_id TEXT NOT NULL,
        event TEXT NOT NULL CHECK (event IN ('queued', 'status', 'removed')),
        old_status TEXT,
        new_status TEXT,
        at TEXT NOT NULL DEFAULT ${NOW}
      );
      CREATE TRIGGER sync_outbox_queued AFTER INSERT ON sync_outbox BEGIN
        INSERT INTO sync_outbox_journal (operation_id, event, new_status)
        VALUES (NEW.id, 'queued', NEW.status);
      END;
      CREATE TRIGGER sync_outbox_status_changed AFTER UPDATE OF status ON sync_outbox
      WHEN OLD.status <> NEW.status BEGIN
        INSERT INTO sync_outbox_journal (operation_id, event, old_status, new_status)
        VALUES (NEW.id, 'status', OLD.status, NEW.status);
      END;
      CREATE TRIGGER sync_outbox_removed AFTER DELETE ON sync_outbox BEGIN
        INSERT INTO sync_outbox_journal (operation_id, event, old_status)
        VALUES (OLD.id, 'removed', OLD.status);
      END;
      -- Une opération acceptée par le serveur est définitive : elle ne repart jamais.
      CREATE TRIGGER sync_outbox_accepted_final BEFORE UPDATE OF status ON sync_outbox
      WHEN OLD.status = 'accepted' AND NEW.status <> 'accepted' BEGIN
        SELECT RAISE(ABORT, 'operation_acceptee_definitive');
      END;
      CREATE TRIGGER sync_outbox_journal_immutable BEFORE UPDATE ON sync_outbox_journal BEGIN
        SELECT RAISE(ABORT, 'journal_immuable');
      END;

      -- Conflits : opérations refusées par le serveur, gardées avec leur cause (D-064).
      CREATE VIEW sync_conflicts AS
        SELECT id, kind, user_id, created_at, attempts, updated_at
        FROM sync_outbox WHERE status = 'rejected';

      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) WITHOUT ROWID;
      -- Les numéros provisoires LOC-… ne sont jamais réutilisés (N-03).
      CREATE TRIGGER sync_sequence_monotonic BEFORE UPDATE ON sync_state
      WHEN NEW.key = 'provisional_sequence'
        AND CAST(NEW.value AS INTEGER) < CAST(OLD.value AS INTEGER) BEGIN
        SELECT RAISE(ABORT, 'sequence_provisoire_decroissante');
      END;

      CREATE TABLE local_queries (
        position INTEGER PRIMARY KEY,
        query_hash TEXT NOT NULL UNIQUE,
        root TEXT NOT NULL,
        data_updated_at INTEGER,
        bytes INTEGER NOT NULL CHECK (bytes >= 0),
        payload BLOB NOT NULL,
        sealed INTEGER NOT NULL CHECK (sealed IN (0, 1))
      );
      CREATE INDEX local_queries_root ON local_queries (root);

      CREATE TABLE audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL DEFAULT ${NOW},
        action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 80),
        detail TEXT
      );
      CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs BEGIN
        SELECT RAISE(ABORT, 'journal_immuable');
      END;
      CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs BEGIN
        SELECT RAISE(ABORT, 'journal_immuable');
      END;

      CREATE TABLE print_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL DEFAULT ${NOW},
        document TEXT NOT NULL CHECK (length(document) BETWEEN 1 AND 120),
        printer TEXT,
        width_mm INTEGER NOT NULL CHECK (width_mm IN (58, 80)),
        reprint INTEGER NOT NULL CHECK (reprint IN (0, 1)),
        status TEXT NOT NULL CHECK (status IN ('printed', 'failed', 'cancelled')),
        error TEXT
      );
      CREATE INDEX print_jobs_document ON print_jobs (document);
    `,
  },
]

export class DowngradeError extends Error {
  readonly found: number

  constructor(found: number) {
    super(
      `La base locale a été créée par une version plus récente de JB Hôtel (schéma ${found}). Installez la dernière version du logiciel.`,
    )
    this.found = found
  }
}

export function schemaVersion(db: DatabaseSync): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT ${NOW}
  )`)
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as
    | { version: number | null }
    | undefined
  return row?.version ?? 0
}

export function pendingMigrations(db: DatabaseSync): Migration[] {
  const current = schemaVersion(db)
  const latest = MIGRATIONS.at(-1)?.version ?? 0
  if (current > latest) throw new DowngradeError(current)
  return MIGRATIONS.filter((migration) => migration.version > current)
}

/** Applique les migrations manquantes ; rend les versions appliquées. */
export function migrate(db: DatabaseSync): number[] {
  const applied: number[] = []
  for (const migration of pendingMigrations(db)) {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(migration.up)
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
        migration.version,
        migration.name,
      )
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    applied.push(migration.version)
  }
  db.exec(`PRAGMA application_id = ${APPLICATION_ID}`)
  return applied
}
