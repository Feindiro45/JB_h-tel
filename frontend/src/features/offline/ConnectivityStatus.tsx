import { Link } from 'react-router'
import { useConnectivity } from '../../shared/offline/connectivity'
import { Icon } from '../../shared/ui/Icon'
import { formatTime } from '../../shared/utils/format'
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

/** Bandeau affiché en haut des pages tant que le serveur est injoignable (lot 2). */
export function OfflineBanner() {
  const { online, since } = useConnectivity()
  if (online) return null
  return (
    <div className="offline-banner" role="status">
      <Icon name="clock" size={18} />
      <p>
        <strong>Hors ligne depuis {formatTime(new Date(since))}.</strong> Vous consultez les données
        gardées sur ce poste ; les enregistrements reprendront au retour du réseau.
      </p>
      <Link className="text-button" to="/synchronisation">
        <Icon name="refresh" size={16} />
        Synchronisation
      </Link>
    </div>
  )
}
