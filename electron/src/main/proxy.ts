/**
 * Relais de l'API (D-069). L'interface est servie depuis `app://jbhotel/` ; ses appels à
 * `app://jbhotel/server/…` sont transmis par le processus principal au serveur Laravel configuré.
 * Pour Laravel, la requête est celle de la PWA : cookies de session Sanctum gardés par Electron
 * pour le domaine du serveur, en-tête `Origin` de l'application web autorisée, jeton CSRF
 * `X-XSRF-TOKEN` lu dans le cookie `XSRF-TOKEN`. Aucun changement d'authentification côté serveur.
 *
 * Fonctions pures (sans Electron) : testées dans `proxy.test.ts`.
 */
export const APP_ORIGIN = 'app://jbhotel'
export const API_PREFIX = '/server'
export const API_BASE = `${APP_ORIGIN}${API_PREFIX}`

/**
 * Adresse de l'application ? Node rend l'origine `"null"` pour un schéma qui n'est pas http(s) :
 * le protocole et l'hôte sont donc comparés directement.
 */
export function isAppLocation(url: URL): boolean {
  return url.protocol === 'app:' && url.host === 'jbhotel' && !url.username && !url.password
}

/** En-têtes de l'interface transmis au serveur ; les autres sont ignorés. */
const FORWARDED_REQUEST = [
  'accept',
  'accept-language',
  'content-type',
  'x-requested-with',
  'x-workstation-token',
  'idempotency-key',
  'x-offline-replay',
]

/** En-têtes du serveur rendus à l'interface (`Set-Cookie` reste dans le processus principal). */
const FORWARDED_RESPONSE = [
  'content-type',
  'content-disposition',
  'content-length',
  'cache-control',
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
]

export interface ServerTarget {
  /** Racine publique de Laravel, dossier éventuel compris (ex. https://api.jb-hotel.com). */
  serverUrl: string
  /** Origine de l'application web autorisée par Sanctum (ex. https://app.jb-hotel.com). */
  origin: string
}

export function normalizeServerUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Adresse du serveur invalide : http ou https uniquement.')
  }
  if (url.username || url.password) {
    throw new Error('Adresse du serveur invalide : identifiants interdits dans l’adresse.')
  }
  url.hash = ''
  url.search = ''
  return url.toString().replace(/\/+$/, '')
}

export function normalizeOrigin(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Origine invalide : http ou https uniquement.')
  }
  return url.origin
}

/** Adresse du serveur visée par une requête de l'interface, ou `null` si elle n'est pas pour l'API. */
export function targetUrl(requestUrl: string, serverUrl: string): string | null {
  const url = new URL(requestUrl)
  if (!isAppLocation(url)) return null
  if (url.pathname !== API_PREFIX && !url.pathname.startsWith(`${API_PREFIX}/`)) return null
  const rest = url.pathname.slice(API_PREFIX.length).replace(/^\/+/, '')
  const base = new URL(`${serverUrl}/`)
  const target = new URL(rest, base)
  // Jamais en dehors du dossier de l'API (`..` déjà résolu par l'analyse de l'adresse).
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) return null
  target.search = url.search
  return target.toString()
}

export function requestHeaders(
  incoming: Headers,
  target: ServerTarget,
  method: string,
  xsrf: string | null,
): Headers {
  const headers = new Headers()
  for (const name of FORWARDED_REQUEST) {
    const value = incoming.get(name)
    if (value !== null) headers.set(name, value)
  }
  headers.set('origin', target.origin)
  headers.set('referer', `${target.origin}/`)
  if (method !== 'GET' && method !== 'HEAD' && xsrf) headers.set('x-xsrf-token', xsrf)
  return headers
}

export function responseHeaders(incoming: Headers): Headers {
  const headers = new Headers()
  for (const name of FORWARDED_RESPONSE) {
    const value = incoming.get(name)
    if (value !== null) headers.set(name, value)
  }
  return headers
}
