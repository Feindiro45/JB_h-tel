import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { toUserError } from '../../shared/api/errors'
import type { CurrentUser } from '../../shared/api/types'
import { config } from '../../shared/config'
import { getConnectivity } from '../../shared/offline/connectivity'
import {
  canVerifyOffline,
  readSession,
  rememberSession,
  verifyOfflinePassword,
} from '../../shared/offline/session'
import { Icon } from '../../shared/ui/Icon'
import { useFocusTrap } from '../../shared/ui/useFocusTrap'
import { initials } from '../../shared/utils/format'
import { confirmPassword } from './api'
import { Padlock, type PadlockPhase } from './Padlock'
import type { Standby } from './useStandby'
import './standby.css'

/** Durées des animations (ms) : le cadenas se referme, tremble, puis éclate avant de disparaître. */
const CLOSING_MS = 950
const ERROR_MS = 650
const OPENING_MS = 1300

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  } catch {
    return false
  }
}

const TIME = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: config.timeZone,
})
const DATE = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: config.timeZone,
})

/**
 * Vérifie le mot de passe : par le serveur s'il répond (autorité, mot de passe changé ailleurs
 * compris), sinon sur le poste avec l'empreinte gardée à la connexion. Rend le refus, ou `null`.
 */
async function verify(password: string, user: CurrentUser): Promise<string | null> {
  if (getConnectivity().online) {
    try {
      await confirmPassword(password)
      // Empreinte du poste mise à jour : le déverrouillage hors ligne suit le mot de passe actuel.
      void rememberSession(user, password)
      return null
    } catch (error) {
      const refusal = toUserError(error)
      if (refusal.status === 422) return 'Mot de passe incorrect.'
      if (refusal.status === 429) return 'Trop d’essais : patientez une minute avant de réessayer.'
      if (!refusal.isNetworkError && refusal.status < 500) return refusal.message
      // Serveur injoignable : vérification sur le poste, comme hors ligne.
    }
  }
  if (await verifyOfflinePassword(password)) return null
  const session = await readSession()
  if (!canVerifyOffline() || !session?.hash) {
    return 'Mot de passe impossible à vérifier sans le serveur : rétablissez la connexion, ou changez d’utilisateur.'
  }
  return 'Mot de passe incorrect.'
}

/**
 * Page de veille (D-074, demande de l'utilisateur) : au-dessus de tout le logiciel, l'heure, le
 * cadenas animé, l'avatar et le nom de l'utilisateur, et le mot de passe pour reprendre. Le travail
 * en cours reste intact derrière ; « Changer d'utilisateur » ferme la session.
 */
export function StandbyScreen({
  standby,
  user,
  onSignOut,
}: {
  standby: Standby
  user: CurrentUser
  onSignOut: () => void
}) {
  if (!standby.locked) return null
  return createPortal(
    <StandbyOverlay key={standby.since} standby={standby} user={user} onSignOut={onSignOut} />,
    document.body,
  )
}

function StandbyOverlay({
  standby,
  user,
  onSignOut,
}: {
  standby: Standby
  user: CurrentUser
  onSignOut: () => void
}) {
  const titleId = useId()
  const statusId = useId()
  const fieldId = useId()
  const errorId = useId()
  const container = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const trapTab = useFocusTrap(container, field)
  const [reduced] = useState(prefersReducedMotion)
  const [phase, setPhase] = useState<PadlockPhase>(reduced ? 'idle' : 'closing')
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [error, setError] = useState<string>()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (phase !== 'closing') return
    const timer = window.setTimeout(() => setPhase('idle'), CLOSING_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  function refuse(message: string) {
    setError(message)
    setPhase('error')
    window.setTimeout(() => setPhase('idle'), reduced ? 0 : ERROR_MS)
    field.current?.select()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (phase === 'checking' || phase === 'opening') return
    if (!password) return refuse('Saisissez votre mot de passe.')
    setError(undefined)
    setPhase('checking')
    const refusal = await verify(password, user)
    if (refusal) return refuse(refusal)
    setPassword('')
    setPhase('opening')
    window.setTimeout(standby.unlock, reduced ? 0 : OPENING_MS)
  }

  const date = DATE.format(now)
  const busy = phase === 'checking' || phase === 'opening'

  return (
    <div className="standby" data-phase={phase} onKeyDown={trapTab}>
      <div className="standby__aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <header className="standby__top">
        <p className="standby__brand">
          <span className="standby__mark" aria-hidden="true">
            JB
          </span>
          {config.appName} · Bambari
        </p>
        <time className="standby__clock" dateTime={new Date(now).toISOString()}>
          {TIME.format(now)}
        </time>
        <p className="standby__date">{date.charAt(0).toUpperCase() + date.slice(1)}</p>
      </header>

      <Padlock phase={phase} />

      <div
        ref={container}
        className="standby__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={statusId}
        data-error={phase === 'error' || undefined}
      >
        <h2 id={titleId} className="sr-only">
          Logiciel en veille
        </h2>
        <div className="standby__user">
          <span className="standby__avatar" aria-hidden="true">
            {initials(user.name)}
          </span>
          <span className="standby__who">
            <strong className="standby__name">{user.name}</strong>
            <span className="standby__role">{user.role_label ?? 'Sans rôle'}</span>
          </span>
        </div>
        <p id={statusId} className="standby__status" role="status">
          <Icon name="lock" size={15} />
          {phase === 'opening'
            ? 'Déverrouillage…'
            : `En veille depuis ${TIME.format(standby.since ?? now)} — saisissez votre mot de passe pour reprendre`}
        </p>
        <form className="standby__form" onSubmit={(event) => void submit(event)} noValidate>
          <label className="sr-only" htmlFor={fieldId}>
            Mot de passe
          </label>
          <div className="standby__field">
            <Icon name="key" size={18} />
            <input
              ref={field}
              id={fieldId}
              type={shown ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Mot de passe"
              value={password}
              disabled={phase === 'opening'}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="standby__eye"
              aria-label={shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              aria-pressed={shown}
              onClick={() => setShown(!shown)}
            >
              <Icon name={shown ? 'eyeOff' : 'eye'} size={18} />
            </button>
          </div>
          {error && (
            <p id={errorId} className="standby__error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="standby__submit" disabled={busy}>
            <Icon
              name={phase === 'checking' ? 'loader' : 'lock'}
              size={18}
              className={phase === 'checking' ? 'is-spinning' : undefined}
            />
            {phase === 'checking' ? 'Vérification…' : 'Déverrouiller'}
          </button>
        </form>
        <p className="standby__hint">
          Mise en veille après {standby.delayMinutes} min sans action. Votre travail reste à
          l’écran.
        </p>
        <button type="button" className="standby__switch" onClick={onSignOut} disabled={busy}>
          <Icon name="logout" size={15} />
          Changer d’utilisateur
        </button>
      </div>
    </div>
  )
}
