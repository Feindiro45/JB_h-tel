import { queryOptions } from '@tanstack/react-query'
import { readOutbox, mergeOperations, type QueuedOperation } from './outbox'
import { storageGet, storageSet } from './storage'
import { validatedOperations } from './operationValidation'

/**
 * Sauvegarde des opérations en attente (D-064, N-06) : export **manuel et chiffré**, à garder sur
 * une clé USB tant que le serveur n'a pas reçu les opérations (poste en panne, volé, navigateur
 * effacé). Le fichier est chiffré en AES-GCM avec une clé tirée du mot de passe (PBKDF2) : sans
 * le mot de passe, il est illisible ; modifié, il est refusé. La restauration ajoute à la file les
 * opérations absentes, avec leur clé d'idempotence d'origine : déjà reçues par le serveur, elles ne
 * sont pas enregistrées deux fois (D-063).
 */
export const BACKUP_FORMAT = 'jb-hotel-sauvegarde'
const BACKUP_VERSION = 1
/** Recommandation OWASP pour PBKDF2-SHA256 : le fichier peut être attaqué hors ligne. */
const ITERATIONS = 600_000
const LAST_BACKUP_KEY = 'last-backup'
/** Rappel quand une opération attend depuis plus d'une heure sans sauvegarde (N-06). */
export const BACKUP_REMINDER_MS = 60 * 60_000
export const MIN_BACKUP_PASSWORD = 8

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  createdAt: string
  station: string | null
  operations: number
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  cipher: { name: 'AES-GCM'; iv: string }
  data: string
}

export interface BackupRecord {
  at: number
  count: number
  /** Opérations contenues : celles qui n'y sont pas déclenchent le rappel. */
  ids: string[]
  fileName: string
}

/** Erreur expliquée en français, rattachée au champ à corriger. */
export class BackupError extends Error {
  readonly field: 'file' | 'password'

  constructor(message: string, field: 'file' | 'password') {
    super(message)
    this.field = field
  }
}

export async function readLastBackup(): Promise<BackupRecord | null> {
  return (await storageGet<BackupRecord>(LAST_BACKUP_KEY)) ?? null
}

export const lastBackupQuery = queryOptions({
  queryKey: ['offline', 'last-backup'] as const,
  queryFn: () => readLastBackup(),
  networkMode: 'always',
  staleTime: 0,
})

/** Opérations à sauvegarder : pas encore reçues par le serveur ni abandonnées. */
export function unsavedOperations(operations: QueuedOperation[]): QueuedOperation[] {
  return operations.filter((o) => o.status === 'pending' || o.status === 'rejected')
}

/** Une opération en attente depuis plus d'une heure n'est dans aucune sauvegarde. */
export function needsBackupReminder(
  operations: QueuedOperation[],
  last: BackupRecord | null | undefined,
  now = Date.now(),
  delay = BACKUP_REMINDER_MS,
): boolean {
  const saved = new Set(last?.ids ?? [])
  return operations.some(
    (o) => o.status === 'pending' && now - o.createdAt >= delay && !saved.has(o.id),
  )
}

function toBase64(bytes: Uint8Array): string {
  let text = ''
  // Par morceaux : un très gros fichier dépasserait la pile d'appels en une seule fois.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(text)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
}

async function keyFor(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** WebCrypto n'existe qu'en HTTPS (ou sur localhost). */
export function canEncrypt(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle?.deriveKey === 'function'
}

function stamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

function stationSlug(station: string | null): string {
  return (
    (station ?? '')
      .normalize('NFD')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 12) || 'POSTE'
  )
}

/** Chiffre les opérations non envoyées ; rend le fichier à télécharger. */
export async function createBackup(
  password: string,
  station: string | null,
  now = new Date(),
): Promise<{ content: string; fileName: string; record: BackupRecord }> {
  if (!canEncrypt()) {
    throw new BackupError(
      'Chiffrement indisponible : ouvrez l’application en adresse sécurisée (HTTPS).',
      'password',
    )
  }
  if (password.length < MIN_BACKUP_PASSWORD) {
    throw new BackupError(
      `Choisissez un mot de passe d’au moins ${MIN_BACKUP_PASSWORD} caractères.`,
      'password',
    )
  }
  const operations = unsavedOperations(await readOutbox())
  if (operations.length === 0) {
    throw new BackupError('Aucune opération en attente à sauvegarder.', 'file')
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await keyFor(password, salt, ITERATIONS)
  const plain = new TextEncoder().encode(JSON.stringify({ operations }))
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain))
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    station,
    operations: operations.length,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    data: toBase64(encrypted),
  }
  const fileName = `jb-hotel-sauvegarde-${stationSlug(station)}-${stamp(now)}.json`
  const record: BackupRecord = {
    at: now.getTime(),
    count: operations.length,
    ids: operations.map((o) => o.id),
    fileName,
  }
  return { content: JSON.stringify(file), fileName, record }
}

/** À appeler une fois le fichier remis au navigateur : le rappel s'arrête pour ces opérations. */
export async function rememberBackup(record: BackupRecord): Promise<void> {
  await storageSet(LAST_BACKUP_KEY, record)
}

function parseFile(text: string): BackupFile {
  if (text.length > 20 * 1024 * 1024)
    throw new BackupError('Ce fichier dépasse la taille maximale de sauvegarde (20 Mo).', 'file')
  let file: Partial<BackupFile>
  try {
    file = JSON.parse(text) as Partial<BackupFile>
  } catch {
    throw new BackupError('Ce fichier n’est pas une sauvegarde JB Hôtel.', 'file')
  }
  if (
    file?.format !== BACKUP_FORMAT ||
    !file.kdf ||
    !file.cipher ||
    typeof file.data !== 'string' ||
    file.kdf.name !== 'PBKDF2' ||
    file.kdf.hash !== 'SHA-256' ||
    !Number.isInteger(file.kdf.iterations) ||
    file.kdf.iterations < 100000 ||
    file.kdf.iterations > 2000000 ||
    typeof file.kdf.salt !== 'string' ||
    file.kdf.salt.length > 100 ||
    file.cipher.name !== 'AES-GCM' ||
    typeof file.cipher.iv !== 'string' ||
    file.cipher.iv.length > 100
  ) {
    throw new BackupError('Ce fichier n’est pas une sauvegarde JB Hôtel.', 'file')
  }
  if (file.version !== BACKUP_VERSION) {
    throw new BackupError(
      'Version de sauvegarde inconnue : mettez l’application à jour puis réessayez.',
      'file',
    )
  }
  return file as BackupFile
}

/** Déchiffre une sauvegarde ; mot de passe faux ou fichier modifié : refus explicite. */
export async function readBackup(
  text: string,
  password: string,
): Promise<{ file: BackupFile; operations: QueuedOperation[] }> {
  const file = parseFile(text)
  if (!canEncrypt()) {
    throw new BackupError(
      'Chiffrement indisponible : ouvrez l’application en adresse sécurisée (HTTPS).',
      'password',
    )
  }
  let plain: ArrayBuffer
  try {
    const key = await keyFor(password, fromBase64(file.kdf.salt), file.kdf.iterations)
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(file.cipher.iv) },
      key,
      fromBase64(file.data),
    )
  } catch {
    throw new BackupError('Mot de passe incorrect, ou fichier modifié depuis l’export.', 'password')
  }
  try {
    const content = JSON.parse(new TextDecoder().decode(plain)) as { operations?: unknown }
    return { file, operations: validatedOperations(content.operations) }
  } catch {
    throw new BackupError(
      'Cette sauvegarde contient des opérations invalides ou non autorisées.',
      'file',
    )
  }
}

/**
 * Ajoute à la file de ce poste les opérations absentes (même clé = même opération). Elles partent
 * avec la session de leur auteur, comme sur le poste d'origine.
 */
export async function restoreBackup(
  operations: QueuedOperation[],
): Promise<{ added: number; present: number }> {
  let safe: QueuedOperation[]
  try {
    safe = validatedOperations(operations)
  } catch {
    throw new BackupError(
      'Cette sauvegarde contient des opérations invalides ou non autorisées.',
      'file',
    )
  }
  return mergeOperations(
    safe.map((o) => ({ ...o, status: o.status === 'rejected' ? o.status : 'pending' })),
  )
}
