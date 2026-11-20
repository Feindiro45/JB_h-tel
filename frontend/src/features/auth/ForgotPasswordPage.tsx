import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { toUserError } from '../../shared/api/errors'
import { TextField } from '../../shared/ui/fields'
import { Icon } from '../../shared/ui/Icon'
import { requestPasswordReset } from './api'
import { AuthBadge, AuthLayout } from './AuthLayout'

/**
 * Mot de passe oublié (D-059) : le serveur vérifie le compte avant d'envoyer le lien (demande de
 * l'utilisateur) ; le lien reçu par e-mail est valable 60 minutes et ne sert qu'une fois.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [sent, setSent] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: () => requestPasswordReset(email.trim()),
    onSuccess: setSent,
    // Compte introuvable, désactivé ou sans adresse joignable : la fenêtre d'erreur l'explique,
    // et le message reste sous le champ.
    onError: (failure) => setError(toUserError(failure).message),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Saisissez l’adresse e-mail de votre compte.')
      return
    }
    setError(undefined)
    mutation.mutate()
  }

  return (
    <AuthLayout
      title="Mot de passe oublié"
      lead={
        sent
          ? undefined
          : 'Indiquez l’adresse e-mail de votre compte. Vous recevrez un lien pour choisir un nouveau mot de passe.'
      }
    >
      {sent ? (
        <div className="auth-state" role="status">
          <AuthBadge icon="mail" />
          <p>{sent}</p>
          <p>
            Pensez à regarder dans les courriers indésirables. Sans e-mail, contactez
            l’administrateur.
          </p>
          <Link className="primary auth-primary" to="/connexion">
            <Icon name="login" size={17} />
            Retour à la connexion
          </Link>
        </div>
      ) : (
        <>
          <form className="auth-form" onSubmit={submit} noValidate>
            <TextField
              label="Adresse e-mail"
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={error}
              required
            />
            <button type="submit" className="primary" disabled={mutation.isPending}>
              <Icon
                name={mutation.isPending ? 'loader' : 'mail'}
                className={mutation.isPending ? 'is-spinning' : undefined}
              />
              {mutation.isPending ? 'Envoi…' : 'Envoyer le lien'}
            </button>
          </form>
          <Link className="auth-link auth-back" to="/connexion">
            <Icon name="back" size={16} />
            Retour à la connexion
          </Link>
        </>
      )}
    </AuthLayout>
  )
}
