import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { backup, type DatabaseSync } from 'node:sqlite'
import { checkFile, openDatabase } from './database.ts'

/**
 * Sauvegardes cohérentes de la base locale (D-069) par l'API de sauvegarde de SQLite (copie à
 * chaud, sans arrêter la caisse). Elles sont faites chaque jour, avant une migration, avant une
 * restauration et avant une mise à jour du logiciel ; les plus anciennes sont supprimées au-delà
 * de `keep`. Chaque sauvegarde est vérifiée (`integrity_check`) juste après sa création.
 *
 * Limite assumée : les valeurs sont chiffrées avec la clé de ce compte Windows (DPAPI) ; une
 * sauvegarde ne se restaure que sur ce compte. Pour changer de poste, la sauvegarde chiffrée par
 * mot de passe des opérations en attente (écran Synchronisation, N-06) reste la voie prévue.
 */
export type BackupReason = 'auto' | 'manual' | 'migration' | 'restore' | 'update' | 'recovery'

export interface BackupInfo {
  file: string
  name: string
  reason: BackupReason
  createdAt: string
  bytes: number
}

const PATTERN = /^jbhotel-(\d{8}-\d{6}-\d{3})-([a-z]+)\.sqlite$/

function stamp(date: Date): string {
  const pad = (n: number, size = 2) => String(n).padStart(size, '0')
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-` +
    pad(date.getMilliseconds(), 3)
  )
}

function parseStamp(text: string): Date {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})$/.exec(text)
  if (!m) return new Date(0)
  const [, y, mo, d, h, mi, s, ms] = m.map(Number) as number[]
  return new Date(y!, mo! - 1, d!, h!, mi!, s!, ms!)
}

/** Une sauvegarde est un seul fichier, sans journal WAL à côté (copiable sur clé USB). */
function standalone(file: string): void {
  const db = openDatabase(file, { readOnly: false })
  try {
    db.exec('PRAGMA journal_mode = DELETE')
  } finally {
    db.close()
  }
}

export class BackupService {
  private readonly dir: string
  private readonly keep: number

  constructor(dir: string, keep = 30) {
    this.dir = dir
    this.keep = keep
    mkdirSync(dir, { recursive: true })
  }

  get directory(): string {
    return this.dir
  }

  list(): BackupInfo[] {
    if (!existsSync(this.dir)) return []
    return readdirSync(this.dir)
      .flatMap((name) => {
        const match = PATTERN.exec(name)
        if (!match) return []
        const file = join(this.dir, name)
        return [
          {
            file,
            name,
            reason: match[2] as BackupReason,
            createdAt: parseStamp(match[1]!).toISOString(),
            bytes: statSync(file).size,
          },
        ]
      })
      .sort((a, b) => b.name.localeCompare(a.name))
  }

  latest(): BackupInfo | null {
    return this.list()[0] ?? null
  }

  /** Une sauvegarde automatique par jour au plus. */
  isDue(now = new Date(), everyMs = 24 * 3600_000): boolean {
    const last = this.list().find((item) => item.reason === 'auto' || item.reason === 'manual')
    return !last || now.getTime() - new Date(last.createdAt).getTime() >= everyMs
  }

  async create(db: DatabaseSync, reason: BackupReason, now = new Date()): Promise<BackupInfo> {
    let name = `jbhotel-${stamp(now)}-${reason}.sqlite`
    for (let i = 1; existsSync(join(this.dir, name)); i++) {
      name = `jbhotel-${stamp(new Date(now.getTime() + i))}-${reason}.sqlite`
    }
    const file = join(this.dir, name)
    await backup(db, file)
    standalone(file)
    const report = checkFile(file)
    if (!report.ok) {
      rmSync(file, { force: true })
      throw new Error(`Sauvegarde locale invalide : ${report.messages.join(' ; ')}`)
    }
    this.rotate()
    return {
      file,
      name,
      reason,
      createdAt: now.toISOString(),
      bytes: statSync(file).size,
    }
  }

  /** Garde les `keep` plus récentes (les sauvegardes avant restauration comprises). */
  rotate(): void {
    for (const item of this.list().slice(this.keep)) {
      for (const suffix of ['', '-wal', '-shm']) rmSync(`${item.file}${suffix}`, { force: true })
    }
  }

  /** Sauvegardes valides, de la plus récente à la plus ancienne (reprise après corruption). */
  validOnes(): BackupInfo[] {
    return this.list().filter((item) => {
      const report = checkFile(item.file)
      return report.ok && report.ours
    })
  }

  /** Copie d'une sauvegarde vers un autre dossier choisi par l'utilisateur (clé USB…). */
  exportTo(item: BackupInfo, target: string): void {
    copyFileSync(item.file, target)
  }
}
