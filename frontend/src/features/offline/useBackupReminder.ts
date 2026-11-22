import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { lastBackupQuery, needsBackupReminder } from '../../shared/offline/backup'
import { outboxQuery } from '../../shared/offline/outbox'

/** Heure courante, rafraîchie chaque minute : le rappel apparaît sans recharger la page. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

/**
 * Rappel de sauvegarde (N-06) : une opération attend l'envoi depuis plus d'une heure et ne figure
 * dans aucune sauvegarde exportée.
 */
export function useBackupReminder(): boolean {
  const now = useMinuteClock()
  const outbox = useQuery(outboxQuery)
  const last = useQuery(lastBackupQuery)
  return needsBackupReminder(outbox.data ?? [], last.data, now)
}
