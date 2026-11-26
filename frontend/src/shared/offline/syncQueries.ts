import { queryOptions } from '@tanstack/react-query'
import { readAutoSave, readRuns } from './syncLog'

/** Journal local des synchronisations (jamais gardé dans la copie hors ligne elle-même). */
export const SYNC_LOG_KEY = ['offline', 'sync-log'] as const

export const syncLogQuery = queryOptions({
  queryKey: SYNC_LOG_KEY,
  queryFn: async () => ({ runs: await readRuns(), autoSave: (await readAutoSave()) ?? null }),
  // Lecture locale : jamais mise en pause par l'état du réseau.
  networkMode: 'always',
  staleTime: 0,
})
