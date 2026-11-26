/**
 * Jeton du poste de caisse (D-062), propre à ce navigateur. Il identifie l'appareil, pas la
 * personne : la session reste portée par le cookie Sanctum. Si le stockage local est interdit,
 * le navigateur fonctionne comme un poste non enregistré (consultation seulement quand l'admin
 * réserve les écritures au poste principal).
 */
export const WORKSTATION_HEADER = 'X-Workstation-Token'

const KEY = 'jb-hotel.workstation-token'

export function readWorkstationToken(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function saveWorkstationToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(KEY, token)
    else localStorage.removeItem(KEY)
  } catch {
    // Stockage refusé : le poste sera enregistré de nouveau à la prochaine visite.
  }
}
