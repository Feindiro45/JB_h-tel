import { DatabaseSync } from 'node:sqlite'
import { APPLICATION_ID } from './migrations.ts'

/**
 * Ouverture de la base locale avec les réglages de durabilité exigés pour la caisse (D-069) :
 * - WAL + `synchronous = FULL` : une transaction confirmée survit à une coupure de courant ;
 * - clés étrangères actives, `busy_timeout` pour attendre un verrou plutôt qu'échouer ;
 * - `secure_delete` : une donnée personnelle effacée est réellement écrasée sur le disque.
 */
export function openDatabase(file: string, options: { readOnly?: boolean } = {}): DatabaseSync {
  const db = new DatabaseSync(file, {
    readOnly: options.readOnly ?? false,
    enableForeignKeyConstraints: true,
    timeout: 5000,
  })
  try {
    if (!options.readOnly) {
      db.exec('PRAGMA journal_mode = WAL')
      db.exec('PRAGMA synchronous = FULL')
      db.exec('PRAGMA secure_delete = ON')
    }
    db.exec('PRAGMA foreign_keys = ON')
    db.exec('PRAGMA trusted_schema = OFF')
  } catch (error) {
    db.close()
    throw error
  }
  return db
}

export interface IntegrityReport {
  ok: boolean
  /** Base vide ou signée JB Hôtel ; `false` : autre fichier SQLite. */
  ours: boolean
  messages: string[]
}

/** Contrôle d'intégrité (`quick_check` au démarrage, `integrity_check` des sauvegardes). */
export function checkIntegrity(db: DatabaseSync, full = false): IntegrityReport {
  const pragma = full ? 'integrity_check' : 'quick_check'
  const rows = db.prepare(`PRAGMA ${pragma}`).all() as Record<string, string>[]
  const messages = rows.map((row) => String(Object.values(row)[0]))
  const id = (db.prepare('PRAGMA application_id').get() as { application_id: number })
    .application_id
  return {
    ok: messages.length === 1 && messages[0] === 'ok',
    ours: id === APPLICATION_ID || id === 0,
    messages,
  }
}

/** Vérifie un fichier (sauvegarde) sans le modifier. */
export function checkFile(file: string): IntegrityReport {
  let db: DatabaseSync | null = null
  try {
    db = openDatabase(file, { readOnly: true })
    const report = checkIntegrity(db, true)
    const id = (db.prepare('PRAGMA application_id').get() as { application_id: number })
      .application_id
    return { ...report, ours: id === APPLICATION_ID }
  } catch (error) {
    return { ok: false, ours: false, messages: [String((error as Error).message ?? error)] }
  } finally {
    db?.close()
  }
}
