import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import hotelImage from '../../assets/jb-hotel.webp'
import { toUserError } from '../../shared/api/errors'
import { config } from '../../shared/config'
import { TextField } from '../../shared/ui/fields'
import { Icon } from '../../shared/ui/Icon'
import { setPassword } from './api'

type Errors = { password?: string; password_confirmation?: string }

/**
 * Lien de l'invitation reçue par e-mail (6M) : la personne choisit son mot de passe, puis se
 * connecte. Mêmes règles qu'à la création du compte ; le serveur reste seul juge du lien.
 */
export function SetPasswordPage() {
  const [params] = useSearchParams()
  const email = params.get('email') ?? ''
  const token = params.get('token') ?? ''
  const [password, setPasswordValue] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [done, setDone] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => setPassword({ email, token, password, password_confirmation: confirmation }),
    onSuccess: (message) => setDone(message),
    onError: (error) => setErrors(firstErrors(toUserError(error).fieldErrors)),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    const next: Errors = {}
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
      next.password = 'Au moins 10 caractères, avec des lettres et des chiffres.'
    if (confirmation !== password)
      next.password_confirmation = 'Les deux mots de passe ne correspondent pas.'
    setErrors(next)
    if (Object.keys(next).length === 0) mutation.mutate()
  }

  return (
    <main id="contenu" className="auth">
      <section
        className="auth-visual"
        style={{
          backgroundImage: `linear-gradient(0deg, #081e18da 0%, #112b2355 55%, #0c261f70), url(${hotelImage})`,
        }}
      >
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            JB
          </span>
          <span>
            <b>{config.appName}</b>
            <small>BANGUI · HÔTELLERIE</small>
          </span>
        </div>
        <div>
          <p className="eyebrow">Accès du personnel</p>
          <h1>Bienvenue dans l’équipe.</h1>
          <p>Choisissez votre mot de passe pour activer votre compte.</p>
        </div>
      </section>

      <section className="auth-panel">
        <div>
          <h2>Choisir mon mot de passe</h2>
          {!email || !token ? (
            <>
              <p className="notice" role="alert">
                Ce lien est incomplet. Ouvrez de nouveau le lien reçu par e-mail ou demandez à
                l’administrateur de vous renvoyer l’invitation.
              </p>
              <Link className="secondary" to="/connexion">
                <Icon name="login" size={17} />
                Aller à la connexion
              </Link>
            </>
          ) : done ? (
            <>
              <p className="notice" role="status">
                {done}
              </p>
              <Link className="primary" to="/connexion">
                <Icon name="login" size={17} />
                Se connecter
              </Link>
            </>
          ) : (
            <>
              <p className="lead">
                Compte : <strong>{email}</strong>
              </p>
              <form className="auth-form" onSubmit={submit} noValidate>
                <TextField
                  label="Nouveau mot de passe"
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPasswordValue(event.target.value)}
                  hint="Au moins 10 caractères, avec des lettres et des chiffres."
                  error={errors.password}
                  required
                />
                <TextField
                  label="Confirmer le mot de passe"
                  type="password"
                  name="password_confirmation"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  error={errors.password_confirmation}
                  required
                />
                <button type="submit" className="primary" disabled={mutation.isPending}>
                  <Icon
                    name={mutation.isPending ? 'loader' : 'check'}
                    className={mutation.isPending ? 'is-spinning' : undefined}
                  />
                  {mutation.isPending ? 'Enregistrement…' : 'Enregistrer mon mot de passe'}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  )
}

function firstErrors(fieldErrors: Record<string, string[]>): Errors {
  return {
    password: fieldErrors.password?.[0],
    password_confirmation: fieldErrors.password_confirmation?.[0],
  }
}
