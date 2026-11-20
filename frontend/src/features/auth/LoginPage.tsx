import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { config } from '../../shared/config'
import { TextField } from '../../shared/ui/fields'
import { Icon } from '../../shared/ui/Icon'
import { login, ME_KEY } from './api'
import './login.css'

/** Connexion simple sans image : session Sanctum par cookie, jamais de jeton stocké. */
export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const mutation = useMutation({
    mutationFn: () => login(email.trim(), password),
    onSuccess: (user) => {
      queryClient.setQueryData(ME_KEY, user)
      navigate(from, { replace: true })
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    const next: typeof errors = {}
    if (!email.trim()) next.email = 'Saisissez votre adresse e-mail.'
    if (!password) next.password = 'Saisissez votre mot de passe.'
    setErrors(next)
    if (Object.keys(next).length === 0) mutation.mutate()
  }

  return (
    <main id="contenu" className="auth auth--simple">
      <section className="auth-panel" aria-labelledby="login-title">
        <div>
          <div className="login-brand">
            <span className="login-monogram" aria-hidden="true">
              JB
            </span>
            <span>{config.appName}</span>
          </div>
          <h1 id="login-title">Connexion de l’équipe</h1>
          <p className="lead">Connectez-vous à votre espace de gestion.</p>
          <form className="auth-form" onSubmit={submit} noValidate>
            <TextField
              label="Adresse e-mail"
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={errors.email}
              required
            />
            <div className="login-password">
              <TextField
                label="Mot de passe"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={errors.password}
                required
              />
              <button
                type="button"
                className="text-button"
                onClick={() => setShowPassword((value) => !value)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={17} />
                {showPassword ? 'Masquer' : 'Afficher'}
              </button>
            </div>
            <button type="submit" className="primary" disabled={mutation.isPending}>
              <Icon
                name={mutation.isPending ? 'loader' : 'login'}
                className={mutation.isPending ? 'is-spinning' : undefined}
              />
              {mutation.isPending ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
