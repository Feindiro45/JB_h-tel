import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toUserError } from '../../shared/api/errors'
import { TextField } from '../../shared/ui/fields'
import { Icon } from '../../shared/ui/Icon'
import { setPassword } from './api'
import { AuthBadge, AuthLayout } from './AuthLayout'

type Errors = { password?: string; password_confirmation?: string }

/**
 * Lien reçu par e-mail (D-054, D-059) : invitation d'un nouveau compte (72 h) ou « mot de passe
 * oublié » (`motif=oubli`, 60 min). Mêmes règles qu'à la création du compte, vérifiées en direct ;
 * le serveur reste seul juge du lien.
 */
export function SetPasswordPage() {
  const [params] = useSearchParams()
  const email = params.get('email') ?? ''
  const token = params.get('token') ?? ''
  const reset = params.get('motif') === 'oubli'
  const [password, setPasswordValue] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [done, setDone] = useState<string | null>(null)

  const rules = [
    { label: 'Au moins 10 caractères', ok: password.length >= 10 },
    { label: 'Des lettres', ok: /[A-Za-z]/.test(password) },
    { label: 'Des chiffres', ok: /\d/.test(password) },
    { label: 'Saisies identiques', ok: password !== '' && confirmation === password },
  ]

  const mutation = useMutation({
    mutationFn: () =>
      setPassword({
        email,
        token,
        password,
        password_confirmation: confirmation,
        ...(reset ? { purpose: 'reset' as const } : {}),
      }),
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

  const title = done
    ? 'Mot de passe enregistré'
    : reset
      ? 'Nouveau mot de passe'
      : 'Choisir mon mot de passe'

  return (
    <AuthLayout
      title={title}
      lead={
        done || !email || !token
          ? undefined
          : reset
            ? 'Choisissez un nouveau mot de passe pour votre compte.'
            : 'Bienvenue dans l’équipe : choisissez votre mot de passe pour activer votre compte.'
      }
    >
      {!email || !token ? (
        <div className="auth-state">
          <p className="notice" role="alert">
            Ce lien est incomplet. Ouvrez de nouveau le lien reçu par e-mail
            {reset
              ? ' ou refaites une demande.'
              : ' ou demandez à l’administrateur de vous renvoyer l’invitation.'}
          </p>
          <Link className="primary auth-primary" to={reset ? '/mot-de-passe-oublie' : '/connexion'}>
            <Icon name={reset ? 'mail' : 'login'} size={17} />
            {reset ? 'Refaire une demande' : 'Aller à la connexion'}
          </Link>
        </div>
      ) : done ? (
        <div className="auth-state" role="status">
          <AuthBadge icon="check" />
          <p>{done}</p>
          <Link className="primary auth-primary" to="/connexion">
            <Icon name="login" size={17} />
            Se connecter
          </Link>
        </div>
      ) : (
        <>
          <p className="auth-account">
            <Icon name="mail" size={15} />
            <span>
              Compte : <strong>{email}</strong>
            </span>
          </p>
          <form className="auth-form" onSubmit={submit} noValidate>
            <TextField
              label="Nouveau mot de passe"
              type="password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPasswordValue(event.target.value)}
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
            <ul className="password-rules" aria-label="Règles du mot de passe">
              {rules.map((rule) => (
                <li key={rule.label} data-ok={rule.ok}>
                  <Icon name={rule.ok ? 'check' : 'close'} size={14} />
                  {rule.label}
                  <span className="sr-only">{rule.ok ? ' : respecté' : ' : à compléter'}</span>
                </li>
              ))}
            </ul>
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
    </AuthLayout>
  )
}

function firstErrors(fieldErrors: Record<string, string[]>): Errors {
  return {
    password: fieldErrors.password?.[0],
    password_confirmation: fieldErrors.password_confirmation?.[0],
  }
}
