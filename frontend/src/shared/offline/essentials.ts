import type { FetchQueryOptions } from '@tanstack/react-query'

/**
 * Données essentielles au travail sans réseau (lot 2) : « Mettre à jour en local » les télécharge
 * même si leur écran n'a pas encore été ouvert sur ce poste. Chaque feature déclare les siennes
 * (avec la permission serveur requise) ; ce registre ne dépend d'aucune feature.
 */
type AnyFetchOptions = FetchQueryOptions<unknown, Error, unknown, readonly unknown[]>

interface Essential {
  permission: string
  options: () => AnyFetchOptions
}

const essentials: Essential[] = []

export function registerOfflineEssential<T, K extends readonly unknown[]>(
  permission: string,
  options: () => FetchQueryOptions<T, Error, T, K>,
): void {
  essentials.push({ permission, options: options as unknown as () => AnyFetchOptions })
}

/** Essentiels permis à l'utilisateur (permissions de son dernier `/auth/me`). */
export function offlineEssentials(permissions: readonly string[]): AnyFetchOptions[] {
  return essentials.filter((e) => permissions.includes(e.permission)).map((e) => e.options())
}
