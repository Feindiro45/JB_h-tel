import { config } from '../config'
import { isDesktop } from '../desktop/bridge'
// Capte dès le démarrage la proposition d’installation du navigateur (PWA).
import './install'

/**
 * Enregistre le service worker (`public/sw.js`) en production seulement : en développement, il
 * gênerait le rechargement à chaud de Vite. Le préfixe de l'API sur le même domaine (ex.
 * `/backend` sur l'hébergement LWS) lui est transmis pour qu'il ne l'intercepte jamais.
 */
export function apiPrefixFor(apiUrl: string, origin: string): string {
  const api = new URL(apiUrl, origin)
  return api.origin === origin ? api.pathname.replace(/\/+$/, '') : ''
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  // Logiciel Windows (D-069) : l'interface est installée avec le logiciel, sans service worker.
  if (isDesktop()) return
  const base = import.meta.env.BASE_URL
  const prefix = apiPrefixFor(config.apiUrl, window.location.origin)
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${base}sw.js?api=${encodeURIComponent(prefix)}`, { scope: base })
      .catch(() => {
        // Sans service worker, l'application fonctionne normalement en ligne.
      })
  })
}
