/**
 * Logiciel en veille (D-074) : l'état est gardé dans le navigateur, pour que recharger la page ou
 * ouvrir un autre onglet ne le contourne pas, et partagé entre les onglets (événement `storage`).
 */
export const STANDBY_KEY = 'jb-hotel.standby'

export function isStandbyFlagged(): boolean {
  try {
    return localStorage.getItem(STANDBY_KEY) !== null
  } catch {
    return false
  }
}

/** Heure de mise en veille (ms), ou `null` hors veille. */
export function standbySince(): number | null {
  try {
    const value = Number(localStorage.getItem(STANDBY_KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export function flagStandby(since: number | null): void {
  try {
    if (since === null) localStorage.removeItem(STANDBY_KEY)
    else localStorage.setItem(STANDBY_KEY, String(since))
  } catch {
    // Stockage refusé : la veille ne vaut que pour cette page.
  }
}
