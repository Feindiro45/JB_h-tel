declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL?: string
    readonly VITE_TIMEZONE?: string
  }
}

export const config = {
  appName: 'JB Hôtel',
  /** URL de base de l'API Laravel, sans barre oblique finale. */
  apiUrl: (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, ''),
  /** Fuseau d'affichage (provisoire, voir docs/DECISIONS.md D-010). */
  timeZone: import.meta.env.VITE_TIMEZONE || 'Africa/Bangui',
} as const
