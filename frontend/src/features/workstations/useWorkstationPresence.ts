import { useQuery } from '@tanstack/react-query'
import { announceWorkstation, WORKSTATION_SELF_KEY } from './api'

/** Signal de présence du poste toutes les 30 s, seulement quand l'onglet est visible (D-062). */
const PRESENCE_INTERVAL_MS = 30_000

export function useWorkstationPresence() {
  return useQuery({
    queryKey: WORKSTATION_SELF_KEY,
    queryFn: announceWorkstation,
    refetchInterval: PRESENCE_INTERVAL_MS,
    refetchIntervalInBackground: false,
    staleTime: PRESENCE_INTERVAL_MS - 5_000,
    retry: false,
    meta: { silentError: true },
  })
}
