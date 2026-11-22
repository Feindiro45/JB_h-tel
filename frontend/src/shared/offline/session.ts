import { storageDelete, storageGet, storageSet } from './storage'

/**
 * Session hors ligne (D-064, N-05 révisée le 22/11/2026) : la dernière session confirmée par le
 * serveur reste utilisable **sans limite de durée** (l'hôtel peut rester un mois sans Internet) ;
 * après 15 min d'inactivité hors ligne, l'écran se verrouille. Le mot de passe est vérifié localement par une empreinte PBKDF2 (jamais stocké en
 * clair), calculée à la connexion.
 */
export const LOCK_AFTER_MS = 15 * 60_000

const SESSION_KEY = 'offline-session'
const ACTIVITY_KEY = 'jb-hotel.last-activity'
const ITERATIONS = 150_000

export interface OfflineSession {
  userId: string
  name: string
  /** Dernière confirmation de la session par le serveur (ms). */
  lastOnlineAt: number
  salt: string | null
  hash: string | null
  iterations: number
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
}

/** Sans HTTPS, WebCrypto est absent : la session hors ligne ne pourra pas être déverrouillée. */
export function canVerifyOffline(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle?.deriveBits === 'function'
}

/** À la connexion réussie : mémorise l'empreinte du mot de passe pour le déverrouillage. */
export async function rememberSession(
  user: { id: string; name: string },
  password: string,
): Promise<void> {
  let salt: string | null = null
  let hash: string | null = null
  if (canVerifyOffline()) {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    salt = toBase64(bytes)
    hash = toBase64(await derive(password, bytes, ITERATIONS))
  }
  await storageSet(SESSION_KEY, {
    userId: user.id,
    name: user.name,
    lastOnlineAt: Date.now(),
    salt,
    hash,
    iterations: ITERATIONS,
  } satisfies OfflineSession)
}

export function readSession(): Promise<OfflineSession | undefined> {
  return storageGet<OfflineSession>(SESSION_KEY)
}

/** Le serveur vient de confirmer la session : date gardée pour l'affichage (« dernière connexion »). */
export async function confirmSessionOnline(user: { id: string; name: string }): Promise<void> {
  const session = await readSession()
  if (session && session.userId === user.id) {
    await storageSet(SESSION_KEY, { ...session, name: user.name, lastOnlineAt: Date.now() })
  } else if (!session) {
    // Session ouverte avant cette version : pas d'empreinte, verrou non déverrouillable hors ligne.
    await storageSet(SESSION_KEY, {
      userId: user.id,
      name: user.name,
      lastOnlineAt: Date.now(),
      salt: null,
      hash: null,
      iterations: ITERATIONS,
    } satisfies OfflineSession)
  }
}

export async function verifyOfflinePassword(password: string): Promise<boolean> {
  const session = await readSession()
  if (!session?.salt || !session.hash || !canVerifyOffline()) return false
  const candidate = toBase64(await derive(password, fromBase64(session.salt), session.iterations))
  // Comparaison sans court-circuit sur le contenu.
  let difference = candidate.length ^ session.hash.length
  for (let i = 0; i < Math.min(candidate.length, session.hash.length); i++)
    difference |= candidate.charCodeAt(i) ^ session.hash.charCodeAt(i)
  return difference === 0
}

/**
 * Aucune session gardée sur ce poste (connexion antérieure au mode hors ligne, données du
 * navigateur effacées) : le mot de passe ne peut pas être vérifié sans le serveur.
 */
export function sessionMissing(session: OfflineSession | undefined): boolean {
  return !session
}

export function forgetSession(): Promise<void> {
  return storageDelete(SESSION_KEY)
}

/** Dernière activité (clavier, souris, toucher), gardée dans le navigateur pour survivre au rechargement. */
export function readLastActivity(): number {
  try {
    const value = Number(localStorage.getItem(ACTIVITY_KEY))
    return Number.isFinite(value) && value > 0 ? value : Date.now()
  } catch {
    return Date.now()
  }
}

export function recordActivity(now = Date.now()): void {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(now))
  } catch {
    // Stockage refusé : le verrou se base sur l'activité de la page en cours.
  }
}
