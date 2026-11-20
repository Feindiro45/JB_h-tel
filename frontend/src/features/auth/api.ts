import { queryOptions, useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'
import type { CurrentUser, Envelope } from '../../shared/api/types'

export const ME_KEY = ['auth', 'me'] as const

/** Utilisateur connecté, ou `null` si la session est absente ou expirée (401). */
export const meQueryOptions = queryOptions({
  queryKey: ME_KEY,
  queryFn: async ({ signal }): Promise<CurrentUser | null> => {
    try {
      return (await api.get<Envelope<CurrentUser>>('/api/v1/auth/me', { signal })).data
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null
      throw error
    }
  },
  staleTime: 5 * 60_000,
  retry: false,
  meta: { silentError: true },
})

export async function login(email: string, password: string): Promise<CurrentUser> {
  await api.csrf()
  return (await api.post<Envelope<CurrentUser>>('/api/v1/auth/login', { email, password })).data
}

/** Mot de passe choisi depuis le lien de l'invitation reçue par e-mail (6M). */
export async function setPassword(input: {
  email: string
  token: string
  password: string
  password_confirmation: string
  /** Lien « mot de passe oublié » (D-059) ; absent pour une invitation. */
  purpose?: 'reset'
}): Promise<string> {
  await api.csrf()
  return (await api.post<{ message: string }>('/api/v1/auth/password', input)).message
}

/** Mot de passe oublié (D-059) : réponse identique que le compte existe ou non. */
export async function requestPasswordReset(email: string): Promise<string> {
  await api.csrf()
  return (await api.post<{ message: string }>('/api/v1/auth/forgot-password', { email })).message
}

export async function logout(): Promise<void> {
  await api.post('/api/v1/auth/logout')
}

export function useCurrentUser() {
  const query = useQuery(meQueryOptions)
  const user = query.data ?? null
  return {
    user,
    isPending: query.isPending,
    can: (permission: string) => user?.permissions.includes(permission) ?? false,
  }
}
