import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useConnectivity } from '../../shared/offline/connectivity'
import { outboxQuery } from '../../shared/offline/outbox'
import { Icon } from '../../shared/ui/Icon'
import { formatTime } from '../../shared/utils/format'
import { useBackupReminder } from './useBackupReminder'
import './offline.css'

/** Pastille de la barre du haut : accès réel au serveur (texte + couleur, jamais la couleur seule). */
export function ConnectivityChip() {
  const { online, since } = useConnectivity()
  return (
    <span
      className={`connectivity-chip connectivity-chip--${online ? 'online' : 'offline'}`}
      title={
        online
          ? 'Serveur joignable : les données sont à jour.'
          : `Serveur injoignable depuis ${formatTime(new Date(since))} : consultation des données gardées sur ce poste.`
      }
    >
      <span aria-hidden="true" className="connectivity-chip__dot" />
      {online ? 'En ligne' : 'Hors ligne'}
    </span>
  )
}

/**
 * Bandeau des pages : hors ligne (lot 2), ou opérations faites hors ligne encore en attente
 * d'envoi (lot 4).
 */
export function OfflineBanner() {
  const { online, since } = useConnectivity()
  const outbox = useQuery(outboxQuery)
  const reminder = useBackupReminder()
  const pending = (outbox.data ?? []).filter((o) => o.status === 'pending').length
  if (online && pending === 0) return null
  // Rappel N-06 : une opération attend depuis plus d'une heure sans figurer dans une sauvegarde.
  const backup = reminder && (
    <>
      {' '}
      Des opérations attendent depuis plus d’une heure :{' '}
      <Link to="/synchronisation#sauvegarde">exportez une sauvegarde chiffrée</Link>.
    </>
  )
  return (
    <div className="offline-banner" role="status">
      <Icon name="clock" size={18} />
      {online ? (
        <p>
          <strong>{pending} opération(s) faite(s) hors ligne en attente d’envoi.</strong> Elles
          partent automatiquement ; suivez leur envoi dans Synchronisation.{backup}
        </p>
      ) : (
        <p>
          <strong>Hors ligne depuis {formatTime(new Date(since))}.</strong> Les données affichées
          sont celles gardées sur ce poste ; vos enregistrements sont gardés ici et envoyés au
          retour du réseau
          {pending > 0 ? ` (${pending} en attente)` : ''}.{backup}
        </p>
      )}
      <Link className="text-button" to="/synchronisation">
        <Icon name="refresh" size={16} />
        Synchronisation
      </Link>
    </div>
  )
}
