import { useEffect, useState } from 'react'
import { getConnectivity, useConnectivity } from '../../shared/offline/connectivity'
import {
  LOCK_AFTER_MS,
  readLastActivity,
  readSession,
  recordActivity,
  sessionMissing,
  type OfflineSession,
} from '../../shared/offline/session'

const CHECK_EVERY_MS = 30_000
const ACTIVITY_THROTTLE_MS = 15_000

/**
 * État du verrou hors ligne (D-064, N-05 révisée) : aucune limite de durée sans réseau ; verrou
 * après 15 min d'inactivité pendant une coupure ; blocage seulement si aucune session n'est gardée
 * sur le poste (le mot de passe ne pourrait pas être vérifié). Le verrou posé reste jusqu'au mot de passe, même si le
 * réseau revient entre-temps.
 */
export function useOfflineLock() {
  const { online } = useConnectivity()
  const [session, setSession] = useState<OfflineSession | undefined | null>(null)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    let last = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - last < ACTIVITY_THROTTLE_MS) return
      last = now
      recordActivity(now)
    }
    // Un chargement en ligne compte comme présence ; un rechargement hors ligne après une longue
    // absence ne doit pas lever le verrou.
    if (getConnectivity().online) recordActivity()
    const events = ['pointerdown', 'keydown', 'touchstart'] as const
    for (const name of events) window.addEventListener(name, onActivity, { passive: true })
    return () => {
      for (const name of events) window.removeEventListener(name, onActivity)
    }
  }, [])

  useEffect(() => {
    if (online) return
    let active = true
    void readSession().then((value) => active && setSession(value))
    const check = () => {
      if (Date.now() - readLastActivity() > LOCK_AFTER_MS) setLocked(true)
    }
    check()
    const timer = setInterval(check, CHECK_EVERY_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [online])

  const expired = !online && session !== null && sessionMissing(session)
  return {
    expired,
    locked: locked && !expired,
    userName: session?.name ?? null,
    unlock: () => {
      recordActivity()
      setLocked(false)
    },
  }
}
