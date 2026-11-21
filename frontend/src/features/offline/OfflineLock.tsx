import { useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { checkConnectivity } from '../../shared/offline/connectivity'
import { canVerifyOffline, verifyOfflinePassword } from '../../shared/offline/session'
import { TextField } from '../../shared/ui/fields'
import { Icon } from '../../shared/ui/Icon'
import { useFocusTrap } from '../../shared/ui/useFocusTrap'
import './offline.css'
import { useOfflineLock } from './useOfflineLock'

/** Écran de verrouillage hors ligne : non refermable, focus piégé, saisie conservée en cas d'erreur. */
export function OfflineLock({ onSignOut }: { onSignOut: () => void }) {
  const { expired, locked, userName, unlock } = useOfflineLock()
  if (!expired && !locked) return null
  return createPortal(
    <LockDialog expired={expired} userName={userName} onUnlock={unlock} onSignOut={onSignOut} />,
    document.body,
  )
}

function LockDialog({
  expired,
  userName,
  onUnlock,
  onSignOut,
}: {
  expired: boolean
  userName: string | null
  onUnlock: () => void
  onSignOut: () => void
}) {
  const titleId = useId()
  const container = useRef<HTMLDivElement>(null)
  const trapTab = useFocusTrap(container)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [checking, setChecking] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!password) return setError('Saisissez votre mot de passe.')
    setChecking(true)
    const valid = await verifyOfflinePassword(password)
    setChecking(false)
    if (!valid) {
      return setError(
        canVerifyOffline()
          ? 'Mot de passe incorrect.'
          : 'Déverrouillage impossible sans connexion sécurisée (HTTPS) : reconnectez-vous au retour du réseau.',
      )
    }
    onUnlock()
  }

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
        {expired ? (
          <>
            <h2 id={titleId}>Session hors ligne expirée</h2>
            <p>
              Plus de 12 h sans connexion au serveur : par sécurité, les données gardées sur ce
              poste ne sont plus affichées. Reconnectez-vous dès que le réseau revient.
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
          </>
        ) : (
          <form onSubmit={(event) => void submit(event)} noValidate>
            <h2 id={titleId}>Session verrouillée</h2>
            <p>
              Hors ligne et sans activité depuis 15 minutes. Saisissez le mot de passe
              {userName ? ` de ${userName}` : ''} pour continuer.
            </p>
            <div className="fields">
              <TextField
                className="full"
                label="Mot de passe"
                type="password"
                autoComplete="current-password"
                value={password}
                error={error}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="toolbar">
              <button type="submit" className="primary" disabled={checking}>
                <Icon name="key" size={17} />
                {checking ? 'Vérification…' : 'Déverrouiller'}
              </button>
              <button type="button" className="secondary" onClick={onSignOut}>
                <Icon name="logout" size={17} />
                Se déconnecter
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
