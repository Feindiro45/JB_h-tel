import { api } from '../../shared/api/client'

/**
 * Sortie de veille (D-074) : le serveur vérifie le mot de passe de l'utilisateur connecté, sans
 * nouvelle connexion ni alerte e-mail (204 ; 422 si faux ; 429 après 6 essais par minute).
 */
export function confirmPassword(password: string): Promise<unknown> {
  return api.post('/api/v1/auth/confirm-password', { password })
}
