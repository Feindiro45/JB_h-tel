import { useEffect, useState } from 'react'
import { useConnectivity } from '../../shared/offline/connectivity'
import { readSession, sessionMissing, type OfflineSession } from '../../shared/offline/session'

/**
 * Hors ligne sans session gardée sur le poste (D-064, N-05 révisée) : le mot de passe ne peut pas
 * être vérifié, le poste attend le réseau. Aucune limite de durée sans réseau. La mise en veille
 * après inactivité, en ligne comme hors ligne, est la page de veille (D-074, `features/standby`).
 */
export function useOfflineLock() {
  const { online } = useConnectivity()
  const [session, setSession] = useState<OfflineSession | undefined | null>(null)

  useEffect(() => {
    if (online) return
    let active = true
    void readSession().then((value) => active && setSession(value))
    return () => {
      active = false
    }
  }, [online])

  return { expired: !online && session !== null && sessionMissing(session) }
}
