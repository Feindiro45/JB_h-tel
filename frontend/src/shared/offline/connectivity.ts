import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { config } from '../config'

/**
 * Accès réel au serveur (et non le seul signal `online` du navigateur, souvent vrai sans
 * Internet). Toute réponse de l'API prouve l'accès ; une erreur réseau le retire. Hors ligne,
 * `GET /health` est vérifié toutes les 15 s. TanStack Query suit cet état : sans accès, les
 * lectures se mettent en pause et gardent les données déjà chargées.
 */
export interface ConnectivityState {
  online: boolean
  /** Instant du dernier changement d'état (ms). */
  since: number
}

const PING_INTERVAL_MS = 15_000

// « Hors ligne » annoncé par le navigateur est fiable ; « en ligne » ne l’est pas (vérifié).
let state: ConnectivityState = {
  online: typeof navigator === 'undefined' || navigator.onLine !== false,
  since: Date.now(),
}
const listeners = new Set<() => void>()
let pingTimer: ReturnType<typeof setInterval> | null = null

function emit(next: ConnectivityState) {
  state = next
  onlineManager.setOnline(next.online)
  for (const listener of listeners) listener()
}

export function reportReachable(): void {
  if (state.online) return
  stopPing()
  emit({ online: true, since: Date.now() })
}

export function reportUnreachable(): void {
  if (!state.online) return
  emit({ online: false, since: Date.now() })
  startPing()
}

/** Vérifie l'accès au serveur (bouton « Réessayer », retour du signal `online`). */
export async function checkConnectivity(): Promise<boolean> {
  try {
    const response = await fetch(`${config.apiUrl}/api/v1/health`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    })
    // Une réponse, même en erreur, prouve que le serveur est joignable.
    reportReachable()
    return response.status < 500 || response.status === 503
  } catch {
    reportUnreachable()
    return false
  }
}

function startPing() {
  if (pingTimer !== null || typeof window === 'undefined') return
  pingTimer = setInterval(() => void checkConnectivity(), PING_INTERVAL_MS)
}

function stopPing() {
  if (pingTimer === null) return
  clearInterval(pingTimer)
  pingTimer = null
}

// TanStack Query suit seulement l’accès vérifié au serveur, pas le signal brut du navigateur.
onlineManager.setEventListener(() => () => {})
onlineManager.setOnline(state.online)

if (typeof window !== 'undefined') {
  if (!state.online) startPing()
  window.addEventListener('offline', () => reportUnreachable())
  window.addEventListener('online', () => void checkConnectivity())
}

export function getConnectivity(): ConnectivityState {
  return state
}

export function subscribeConnectivity(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useConnectivity(): ConnectivityState {
  return useSyncExternalStore(subscribeConnectivity, getConnectivity, getConnectivity)
}

/** Tests uniquement : remet l'état « en ligne ». */
export function resetConnectivityForTests(): void {
  stopPing()
  state = { online: true, since: Date.now() }
  onlineManager.setOnline(true)
}
