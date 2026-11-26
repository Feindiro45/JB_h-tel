import { desktopBridge } from './desktop/bridge'

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL?: string
    readonly VITE_TIMEZONE?: string
  }
}

export const config = {
  appName: 'JB Hôtel',
  /**
   * Racine publique de Laravel, dossier compris (ex. https://banguiweb-tech.com/backend). Dans le
   * logiciel Windows (D-069), le relais du processus principal (`app://jbhotel/server`).
   */
  apiUrl: (
    desktopBridge()?.apiBase ||
    import.meta.env.VITE_API_URL ||
    'http://localhost:8000'
  ).replace(/\/+$/, ''),
  /** Fuseau d'affichage (provisoire, voir docs/DECISIONS.md D-010). */
  timeZone: import.meta.env.VITE_TIMEZONE || 'Africa/Bangui',
} as const
