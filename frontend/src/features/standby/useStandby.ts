import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { offlineRules } from '../../shared/offline/rules'
import { readLastActivity, recordActivity } from '../../shared/offline/session'
import { flagStandby, isStandbyFlagged, STANDBY_KEY, standbySince } from '../../shared/standby'

const CHECK_EVERY_MS = 10_000
const ACTIVITY_THROTTLE_MS = 5_000
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const

export interface Standby {
  locked: boolean
  /** Heure de mise en veille (ms). */
  since: number | null
  /** Délai de mise en veille réglé dans Paramètres (minutes). */
  delayMinutes: number
  lock: () => void
  unlock: () => void
}

/**
 * Mise en veille (D-074, demande de l'utilisateur) : sans clic, frappe ni toucher pendant le délai
 * réglé dans Paramètres (`security.idle_lock_minutes`, reçu avec les règles du poste et gardé
 * hors ligne), le logiciel se met en veille, en ligne comme hors ligne. La veille survit au
 * rechargement et s'étend aux autres onglets ; seul le mot de passe la lève.
 */
export function useStandby(): Standby {
  const client = useQueryClient()
  const delayMinutes = offlineRules(client).lock_after_minutes
  const [since, setSince] = useState<number | null>(() => {
    if (isStandbyFlagged()) return standbySince() ?? Date.now()
    // Logiciel rouvert après une longue absence : il s'ouvre en veille.
    const idle = Date.now() - readLastActivity()
    if (idle <= offlineRules(client).lock_after_minutes * 60_000) return null
    const at = Date.now()
    flagStandby(at)
    return at
  })
  const locked = since !== null

  useEffect(() => {
    if (locked) return
    let last = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - last < ACTIVITY_THROTTLE_MS) return
      last = now
      recordActivity(now)
    }
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true })
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity)
    }
  }, [locked])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (isStandbyFlagged()) return setSince((current) => current ?? standbySince() ?? Date.now())
      const delay = offlineRules(client).lock_after_minutes * 60_000
      if (Date.now() - readLastActivity() > delay) {
        const at = Date.now()
        flagStandby(at)
        setSince(at)
      }
    }, CHECK_EVERY_MS)
    // Mise en veille ou réveil depuis un autre onglet.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STANDBY_KEY) return
      setSince(event.newValue === null ? null : Number(event.newValue) || Date.now())
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('storage', onStorage)
    }
  }, [client])

  const lock = useCallback(() => {
    const at = Date.now()
    flagStandby(at)
    setSince(at)
  }, [])
  const unlock = useCallback(() => {
    recordActivity()
    flagStandby(null)
    setSince(null)
  }, [])

  return { locked, since, delayMinutes, lock, unlock }
}
