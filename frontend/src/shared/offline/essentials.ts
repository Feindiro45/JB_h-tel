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

/**
 * Téléchargement complet (« Tout télécharger pour le hors ligne », demande de l'utilisateur,
 * 22/11/2026) : au-delà des écrans essentiels, chaque feature déclare comment télécharger ses
 * fiches de détail (réservations en cours, encaissements, reçus, factures, clients), pour que
 * tout s'ouvre hors ligne sans avoir parcouru les écrans un par un.
 */
export interface PreparationContext {
  can: (permission: string) => boolean
  /** Télécharge et garde une donnée ; `undefined` si elle a échoué (cause journalisée). */
  fetch: <T, K extends readonly unknown[]>(
    options: FetchQueryOptions<T, Error, T, K>,
  ) => Promise<T | undefined>
  /** Garde une fiche déjà reçue dans une liste (même forme que la réponse de son écran). */
  seed: (queryKey: readonly unknown[], data: unknown) => void
  /** Partage entre étapes (ex. identifiants des séjours en cours, trouvés par la première). */
  share: (key: string, values: string[]) => void
  shared: (key: string) => string[]
}

export interface OfflinePreparation {
  /** Ordre d'exécution : une étape peut utiliser ce qu'une étape précédente a partagé. */
  order: number
  label: string
  permission: string
  run: (context: PreparationContext) => Promise<void>
}

const preparations: OfflinePreparation[] = []

export function registerOfflinePreparation(preparation: OfflinePreparation): void {
  preparations.push(preparation)
}

export function offlinePreparations(permissions: readonly string[]): OfflinePreparation[] {
  return preparations
    .filter((p) => permissions.includes(p.permission))
    .sort((a, b) => a.order - b.order)
}

/**
 * Comparaison « sur ce poste / en ligne » (demande de l'utilisateur, 22/11/2026) : chaque famille
 * de données déclare son total sur le serveur et les clés de requête où ses éléments sont gardés.
 */
export interface OfflineCoverage {
  order: number
  label: string
  permission: string
  /** Clés de requête dont les éléments (identifiants) sont comptés sur le poste. */
  match: (queryKey: readonly unknown[]) => boolean
  /** Nombre d'éléments sur le serveur. */
  serverTotal: () => Promise<number>
}

const coverages: OfflineCoverage[] = []

export function registerOfflineCoverage(coverage: OfflineCoverage): void {
  coverages.push(coverage)
}

export function offlineCoverages(permissions: readonly string[]): OfflineCoverage[] {
  return coverages
    .filter((c) => permissions.includes(c.permission))
    .sort((a, b) => a.order - b.order)
}
