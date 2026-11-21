import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query'
import { OFFLINE_SESSION_MAX_MS } from './session'
import { storageDelete, storageGet, storageSet } from './storage'

/**
 * Copie locale des données consultées (lot 2, D-064) : les lectures réussies sont gardées dans
 * IndexedDB et rechargées au démarrage, pour consulter et réimprimer sans réseau. La copie est
 * ignorée au-delà de 12 h et effacée à la déconnexion ou au changement d'utilisateur.
 */
const CACHE_KEY = 'query-cache'
const SAVE_DELAY_MS = 500
/** Écrans d'administration non utiles hors ligne. */
const NOT_KEPT = new Set(['workstations', 'settings', 'audit', 'users', 'mail', 'offline'])

export interface StoredCache {
  userId: string | null
  savedAt: number
  state: DehydratedState
}

function userIdOf(client: QueryClient): string | null {
  const me = client.getQueryData<{ id: string } | null>(['auth', 'me'])
  return me?.id ?? null
}

export function snapshot(client: QueryClient, now = Date.now()): StoredCache {
  return {
    userId: userIdOf(client),
    savedAt: now,
    state: dehydrate(client, {
      shouldDehydrateQuery: (query) =>
        query.state.status === 'success' && !NOT_KEPT.has(String(query.queryKey[0])),
    }),
  }
}

/** Recharge la copie locale encore valide ; rend sa date d'enregistrement, ou `null`. */
export async function restoreQueryCache(
  client: QueryClient,
  now = Date.now(),
): Promise<number | null> {
  const stored = await storageGet<StoredCache>(CACHE_KEY)
  if (!stored) return null
  if (now - stored.savedAt > OFFLINE_SESSION_MAX_MS || !stored.userId) {
    await storageDelete(CACHE_KEY)
    return null
  }
  hydrate(client, stored.state)
  // La copie sert hors ligne : en ligne, chaque donnée restaurée est rechargée dès son affichage
  // (hors ligne, rien ne part et la copie reste affichée).
  void client.invalidateQueries({ refetchType: 'none' })
  return stored.savedAt
}

export function readStoredCache(): Promise<StoredCache | undefined> {
  return storageGet<StoredCache>(CACHE_KEY)
}

/** Lève une erreur si le navigateur refuse d’enregistrer la copie. */
export async function saveQueryCache(client: QueryClient): Promise<StoredCache | null> {
  const data = snapshot(client)
  // Sans utilisateur connecté, rien n'est gardé (écran de connexion, session expirée).
  if (!data.userId) return null
  if (!(await storageSet(CACHE_KEY, data))) {
    throw new Error(
      'Enregistrement impossible sur ce poste : stockage du navigateur plein ou refusé.',
    )
  }
  return data
}

/** Données gardées hors ligne : lectures réussies, hors écrans d’administration. */
export function isKept(queryKey: readonly unknown[]): boolean {
  return !NOT_KEPT.has(String(queryKey[0]))
}

export function clearQueryCache(): Promise<void> {
  return storageDelete(CACHE_KEY)
}

/** Enregistre la copie peu après chaque changement du cache ; rend la fonction d'arrêt. */
export function persistQueryCache(
  client: QueryClient,
  onSaved?: (cache: StoredCache) => void,
  onError?: (error: unknown) => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const save = () => {
    timer = null
    saveQueryCache(client).then(
      (saved) => saved && onSaved?.(saved),
      (error: unknown) => onError?.(error),
    )
  }
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, SAVE_DELAY_MS)
  })
  // Page quittée ou masquée (onglet fermé, poste mis en veille) : la dernière lecture est gardée.
  const flush = () => {
    if (!timer) return
    clearTimeout(timer)
    save()
  }
  const onVisibility = () => document.visibilityState === 'hidden' && flush()
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    if (timer) clearTimeout(timer)
    window.removeEventListener('pagehide', flush)
    document.removeEventListener('visibilitychange', onVisibility)
    unsubscribe()
  }
}
