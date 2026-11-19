import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import hotelImage from '../../assets/jb-hotel.webp'
import { config } from '../../shared/config'
import { TextField } from '../../shared/ui/fields'
import { Icon } from '../../shared/ui/Icon'
import { login, ME_KEY } from './api'

/** Connexion de l'équipe (design du prototype) : session Sanctum par cookie, jamais de jeton stocké. */
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
          <p className="eyebrow">Réception et gestion</p>
          <h1>Bienvenue à JB Hôtel.</h1>
          <p>Gérez vos chambres, vos séjours et vos encaissements en toute sérénité.</p>
        </div>
      </section>

      <section className="auth-panel">
        <div>
          <h2>Connexion de l’équipe</h2>
          <p className="lead">Identifiez-vous avec le compte fourni par l’administrateur.</p>
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
            <div className="password-field">
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
