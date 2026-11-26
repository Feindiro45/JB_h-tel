import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { outboxQuery, type QueuedOperation } from '../../shared/offline/outbox'
import { offlineRules, reminderDelayLabel } from '../../shared/offline/rules'
import { Badge } from '../../shared/ui/Badge'
import { Icon } from '../../shared/ui/Icon'
import { Panel } from '../../shared/ui/layout'
import { formatDateTime, formatFcfa } from '../../shared/utils/format'
import { useBackupReminder } from './useBackupReminder'
import './offline.css'

const SHOWN = 5

/** Montant encaissé hors ligne, pas encore compté par le serveur. */
function pendingCash(operations: QueuedOperation[]): number {
  return operations
    .filter((o) => o.status === 'pending' && o.kind === 'payment.record')
    .reduce((sum, o) => sum + ((o.body as { amount_fcfa?: number } | null)?.amount_fcfa ?? 0), 0)
}

/**
 * Tableau de bord (lot 4, 4.8) : les opérations faites hors ligne restent signalées « en attente
 * d'envoi » tant que le serveur ne les a pas confirmées, et les refus restent à examiner. Les
 * indicateurs du jour viennent du serveur : ils ne les comptent qu'après l'envoi.
 */
export function PendingOperationsPanel() {
  const outbox = useQuery(outboxQuery)
  const reminder = useBackupReminder()
  const client = useQueryClient()
  const waiting = (outbox.data ?? [])
    .filter((o) => o.status === 'pending' || o.status === 'rejected')
    .sort((a, b) => a.createdAt - b.createdAt)
  if (waiting.length === 0) return null

  const pending = waiting.filter((o) => o.status === 'pending').length
  const rejected = waiting.length - pending
  const cash = pendingCash(waiting)

  return (
    <Panel
      title="Opérations faites hors ligne"
      subtitle="Signalées ici tant que le serveur ne les a pas confirmées."
      action={
        <Link className="text-button" to="/synchronisation">
          <Icon name="refresh" size={17} />
          Ouvrir la synchronisation →
        </Link>
      }
    >
      <div className="panel-body pending-operations">
        <div className="outbox-summary">
          {pending > 0 && <Badge tone="amber" label={`${pending} en attente d’envoi`} />}
          {rejected > 0 && <Badge tone="red" label={`${rejected} refusée(s) à examiner`} />}
          {cash > 0 && (
            <span>
              {formatFcfa(cash)} encaissés hors ligne, pas encore comptés dans les indicateurs.
            </span>
          )}
        </div>
        {reminder && (
          <p className="notice" role="alert">
            Des opérations attendent depuis{' '}
            {reminderDelayLabel(offlineRules(client).backup_reminder_minutes)} sans sauvegarde :{' '}
            <Link to="/synchronisation#sauvegarde">exportez une sauvegarde chiffrée</Link>.
          </p>
        )}
        <ul className="pending-operations__list">
          {waiting.slice(0, SHOWN).map((o) => (
            <li key={o.id}>
              <span>
                <strong>{o.label}</strong>
                <small>
                  {formatDateTime(new Date(o.createdAt))} · {o.userName}
                  {o.provisionalNumber ? ` · reçu ${o.provisionalNumber}` : ''}
                </small>
                {o.status === 'rejected' && o.error && <small>Cause : {o.error.message}</small>}
              </span>
              <Badge
                tone={o.status === 'pending' ? 'amber' : 'red'}
                label={o.status === 'pending' ? 'En attente d’envoi' : 'Refusée'}
              />
            </li>
          ))}
        </ul>
        {waiting.length > SHOWN && (
          <p className="hint">… et {waiting.length - SHOWN} autre(s) dans Synchronisation.</p>
        )}
      </div>
    </Panel>
  )
}
