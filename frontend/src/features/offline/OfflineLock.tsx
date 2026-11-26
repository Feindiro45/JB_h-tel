import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { checkConnectivity } from '../../shared/offline/connectivity'
import { Icon } from '../../shared/ui/Icon'
import { useFocusTrap } from '../../shared/ui/useFocusTrap'
import './offline.css'
import { useOfflineLock } from './useOfflineLock'

/**
 * Hors ligne sans session gardée sur le poste : non refermable, focus piégé. La mise en veille
 * après inactivité est la page de veille (D-074).
 */
export function OfflineLock({ onSignOut }: { onSignOut: () => void }) {
  const { expired } = useOfflineLock()
  if (!expired) return null
  return createPortal(<MissingSessionDialog onSignOut={onSignOut} />, document.body)
}

function MissingSessionDialog({ onSignOut }: { onSignOut: () => void }) {
  const titleId = useId()
  const container = useRef<HTMLDivElement>(null)
  const trapTab = useFocusTrap(container)

  return (
    <div className="offline-lock" onKeyDown={trapTab}>
      <div
        ref={container}
        className="offline-lock__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <span className="offline-lock__icon" aria-hidden="true">
          <Icon name="key" size={28} />
        </span>
        <h2 id={titleId}>Session hors ligne indisponible</h2>
        <p>
          Aucune session n’est gardée sur ce poste : sans le serveur, votre mot de passe ne peut pas
          être vérifié. Reconnectez-vous dès que le réseau revient ; une fois connecté en ligne, ce
          poste fonctionne ensuite sans réseau aussi longtemps que nécessaire.
        </p>
        <div className="toolbar">
          <button type="button" className="primary" onClick={() => void checkConnectivity()}>
            <Icon name="refresh" size={17} />
            Réessayer la connexion
          </button>
          <button type="button" className="secondary" onClick={onSignOut}>
            <Icon name="logout" size={17} />
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  )
}
