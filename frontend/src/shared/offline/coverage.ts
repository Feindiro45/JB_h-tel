import type { QueryClient } from '@tanstack/react-query'
import { getConnectivity } from './connectivity'
import { offlineCoverages } from './essentials'
import { storageGet, storageSet } from './storage'

/**
 * Données sur ce poste comparées au serveur : éléments distincts (par identifiant) gardés dans la
 * copie, face au total de chaque liste côté serveur. Hors ligne, le dernier relevé du serveur est
 * affiché avec sa date.
 */
const TOTALS_KEY = 'coverage-totals'

export interface ServerTotals {
  at: number
  /** Total par famille (libellé) ; absent si la lecture a échoué. */
  totals: Record<string, number>
  /** `false` : dernier relevé gardé, le serveur n'est pas joignable. */
  live: boolean
}

export interface CoverageRow {
  label: string
  local: number
  server: number | null
}

function idsOf(data: unknown): string[] {
  const items = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)
      ? (data as { data: unknown[] }).data
      : data && typeof data === 'object'
        ? [data]
        : []
  return items.flatMap((item) => {
    const id = (item as { id?: unknown } | null)?.id
    return typeof id === 'string' ? [id] : []
  })
}

/** Éléments distincts de chaque famille gardés dans le cache (donc dans la copie du poste). */
export function countLocal(client: QueryClient, match: (key: readonly unknown[]) => boolean) {
  const ids = new Set<string>()
  for (const query of client.getQueryCache().getAll()) {
    if (query.state.status !== 'success' || !match(query.queryKey)) continue
    for (const id of idsOf(query.state.data)) ids.add(id)
  }
  return ids.size
}

/** En ligne : relève les totaux du serveur et les garde ; hors ligne : le dernier relevé. */
export async function readServerTotals(
  permissions: readonly string[],
): Promise<ServerTotals | null> {
  if (!getConnectivity().online) {
    const stored = await storageGet<ServerTotals>(TOTALS_KEY)
    return stored ? { ...stored, live: false } : null
  }
  const items = offlineCoverages(permissions)
  const results = await Promise.allSettled(items.map((item) => item.serverTotal()))
  const totals: Record<string, number> = {}
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') totals[items[index]!.label] = result.value
  })
  const measured: ServerTotals = { at: Date.now(), totals, live: true }
  if (Object.keys(totals).length > 0) await storageSet(TOTALS_KEY, measured)
  return measured
}

export function coverageRows(
  client: QueryClient,
  permissions: readonly string[],
  server: ServerTotals | null,
): CoverageRow[] {
  return offlineCoverages(permissions).map((item) => {
    const total = server?.totals[item.label]
    const local = countLocal(client, item.match)
    return {
      label: item.label,
      // Un élément supprimé côté serveur peut encore figurer dans la copie : plafonné au total.
      local: total === undefined ? local : Math.min(local, total),
      server: total ?? null,
    }
  })
}
