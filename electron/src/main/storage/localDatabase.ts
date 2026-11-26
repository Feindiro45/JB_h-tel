import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { BackupService, type BackupInfo, type BackupReason } from './backups.ts'
import { checkFile, checkIntegrity, openDatabase } from './database.ts'
import { migrate, pendingMigrations, schemaVersion } from './migrations.ts'
import type { Sealer } from './sealer.ts'
import { LocalStore, OUTBOX_KEY, SEQUENCE_KEY } from './store.ts'

/**
 * Base locale du poste : ouverture contrôlée, reprise après corruption, migrations précédées
 * d'une sauvegarde, restauration sans perte des opérations plus récentes (D-069).
 */
export interface LocalDatabaseOptions {
  file: string
  backupsDir: string
  sealer: Sealer
  keepBackups?: number
}

export interface Recovery {
  /** Fichier endommagé mis de côté (jamais supprimé). */
  corruptFile: string
  /** Sauvegarde utilisée, ou `null` : aucune sauvegarde valide, base neuve. */
  restoredFrom: string | null
  messages: string[]
}

interface Operation {
  id: string
  createdAt: number
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function removeSidecars(file: string): void {
  rmSync(`${file}-wal`, { force: true })
  rmSync(`${file}-shm`, { force: true })
}

export class LocalDatabase {
  readonly file: string
  readonly backups: BackupService
  private readonly sealer: Sealer
  private database!: DatabaseSync
  private localStore!: LocalStore
  recovery: Recovery | null = null
  migrated: number[] = []

  private constructor(options: LocalDatabaseOptions) {
    this.file = options.file
    this.sealer = options.sealer
    this.backups = new BackupService(options.backupsDir, options.keepBackups)
  }

  static async open(options: LocalDatabaseOptions): Promise<LocalDatabase> {
    const local = new LocalDatabase(options)
    await local.load()
    return local
  }

  get db(): DatabaseSync {
    return this.database
  }

  get store(): LocalStore {
    return this.localStore
  }

  private async load(): Promise<void> {
    if (existsSync(this.file)) {
      const problem = this.inspect()
      if (problem) this.recover(problem)
    }
    this.database = openDatabase(this.file)
    const pending = pendingMigrations(this.database)
    if (pending.length > 0 && schemaVersion(this.database) > 0) {
      await this.backups.create(this.database, 'migration')
    }
    this.migrated = migrate(this.database)
    this.localStore = new LocalStore(this.database, this.sealer)
    if (this.recovery) this.localStore.audit('base.reprise', this.recovery)
    if (this.migrated.length > 0) this.localStore.audit('base.migration', this.migrated)
  }

  /** Rend la cause d'un problème, ou `null` si la base s'ouvre et se contrôle correctement. */
  private inspect(): string[] | null {
    let db: DatabaseSync | null = null
    try {
      db = openDatabase(this.file)
      const report = checkIntegrity(db)
      if (!report.ours) return ['Ce fichier n’est pas une base JB Hôtel.']
      return report.ok ? null : report.messages
    } catch (error) {
      return [String((error as Error).message ?? error)]
    } finally {
      db?.close()
    }
  }

  private recover(messages: string[]): void {
    const corruptFile = `${this.file}.endommagee-${stamp()}`
    renameSync(this.file, corruptFile)
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(`${this.file}${suffix}`)) {
        renameSync(`${this.file}${suffix}`, `${corruptFile}${suffix}`)
      }
    }
    const candidate = this.backups.validOnes()[0] ?? null
    if (candidate) copyFileSync(candidate.file, this.file)
    this.recovery = { corruptFile, restoredFrom: candidate?.file ?? null, messages }
  }

  backup(reason: BackupReason): Promise<BackupInfo> {
    return this.backups.create(this.database, reason)
  }

  /**
   * Restaure une sauvegarde vérifiée. Les opérations du poste absentes de la sauvegarde (faites
   * après elle) sont gardées, et la numérotation provisoire ne recule jamais.
   */
  async restore(file: string): Promise<{ kept: number }> {
    const report = checkFile(file)
    if (!report.ok || !report.ours) {
      throw new Error(
        `Sauvegarde refusée : ${report.ours ? report.messages.join(' ; ') : 'ce fichier n’est pas une sauvegarde JB Hôtel.'}`,
      )
    }
    const current = this.localStore.read([OUTBOX_KEY, SEQUENCE_KEY]).values
    await this.backups.create(this.database, 'restore')
    this.database.close()
    removeSidecars(this.file)
    copyFileSync(file, this.file)
    this.recovery = null
    await this.load()

    const restored = this.localStore.read([OUTBOX_KEY, SEQUENCE_KEY])
    const ops = (restored.values[OUTBOX_KEY] as Operation[] | undefined) ?? []
    const known = new Set(ops.map((op) => op.id))
    const later = ((current[OUTBOX_KEY] as Operation[] | undefined) ?? []).filter(
      (op) => !known.has(op.id),
    )
    const sequence = Math.max(
      Number(current[SEQUENCE_KEY] ?? 0),
      Number(restored.values[SEQUENCE_KEY] ?? 0),
    )
    const put: Record<string, unknown> = {}
    if (later.length > 0) {
      put[OUTBOX_KEY] = [...ops, ...later].sort((a, b) => a.createdAt - b.createdAt)
    }
    if (sequence > 0) put[SEQUENCE_KEY] = sequence
    if (Object.keys(put).length > 0) this.localStore.commit({ put })
    this.localStore.audit('base.restauree', { file, kept: later.length })
    return { kept: later.length }
  }

  close(): void {
    try {
      this.database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch {
      // Fermeture quand même : WAL reste valide et sera repris à l'ouverture.
    }
    this.database.close()
  }
}
