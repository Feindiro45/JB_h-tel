import type { QueryClient } from '@tanstack/react-query'

/**
 * Accès au cache des requêtes en dehors des composants (écritures hors ligne, lot 4) : le
 * fournisseur de l'application l'enregistre au démarrage.
 */
let current: QueryClient | null = null

export function setQueryClientRef(client: QueryClient | null): void {
  current = client
}

export function getQueryClientRef(): QueryClient | null {
  return current
}
