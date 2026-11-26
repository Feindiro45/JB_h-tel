import { useWorkstationPresence } from './useWorkstationPresence'

/**
 * Ce poste peut-il enregistrer réservations, encaissements, arrivées et départs ? Non s'il est
 * révoqué, ou si le poste principal est imposé (D-062) et que c'en est un autre. Sans réponse du
 * serveur (démarrage, hors ligne), on suppose que oui : le serveur reste l'autorité.
 */
export function useWritesAllowedHere(): boolean {
  const { data } = useWorkstationPresence()
  if (!data) return true
  if (data.revoked) return false
  return !(data.enforce_main_post && data.main && !data.is_main)
}
