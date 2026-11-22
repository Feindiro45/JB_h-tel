import { config } from '../config'
import { errorFromResponse, networkError } from './errors'
import { readWorkstationToken, WORKSTATION_HEADER } from './workstationToken'
import { reportReachable, reportUnreachable } from '../offline/connectivity'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type QueryValue = string | number | boolean | null | undefined

export interface RequestOptions {
  method?: HttpMethod
  body?: unknown
  query?: Record<string, QueryValue>
  signal?: AbortSignal
  /** Clé d’idempotence de l’écriture (lot 3), voir `shared/api/idempotency.ts`. */
  idempotencyKey?: string
  /** En-têtes supplémentaires (rejeu d’une opération faite hors ligne, lot 4A). */
  headers?: Record<string, string>
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  // Un chemin commencant par / effacerait le dossier de deploiement de l'API.
  const url = new URL(path.replace(/^\/+/, ''), `${config.apiUrl}/`)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined && value !== '')
      url.searchParams.set(key, String(value))
  }
  return url.toString()
}

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`
  const entry = document.cookie.split('; ').find((part) => part.startsWith(prefix))
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : undefined
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined
  const text = await response.text()
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * Appel à l'API Laravel. Envoie les cookies de session (Sanctum, mode SPA) et l'en-tête
 * CSRF `X-XSRF-TOKEN` sur les requêtes qui modifient des données.
 * Lève toujours une `ApiError` au message français en cas d'échec.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  // Poste de caisse (D-062) : le serveur réserve certaines écritures au poste principal.
  const workstation = readWorkstationToken()
  if (workstation) headers[WORKSTATION_HEADER] = workstation
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey
  Object.assign(headers, options.headers)
  if (method !== 'GET') {
    const xsrf = readCookie('XSRF-TOKEN')
    if (xsrf) headers['X-XSRF-TOKEN'] = xsrf
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'include',
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    // Serveur injoignable : l’application passe en consultation hors ligne (lot 2).
    reportUnreachable()
    throw networkError()
  }
  reportReachable()

  const payload = await parseBody(response)
  if (!response.ok) throw errorFromResponse(response.status, payload)
  return payload as T
}

type Options = Omit<RequestOptions, 'method' | 'body'>

export const api = {
  get: <T>(path: string, options?: Options) => apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Options) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: Options) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: Options) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  /** Le corps est facultatif (motif d'une suppression définitive, D-058). */
  delete: <T>(path: string, body?: unknown, options?: Options) =>
    apiRequest<T>(path, { ...options, method: 'DELETE', body }),
  /** Dépose le cookie `XSRF-TOKEN` (Sanctum, mode SPA) avant la connexion. */
  csrf: () => apiRequest<void>('/sanctum/csrf-cookie'),
}

/** Fichier reçu de l'API (export Excel) : contenu et nom proposé par le serveur. */
export interface DownloadedFile {
  blob: Blob
  filename: string
}

function filenameFrom(disposition: string | null, fallback: string): string {
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  return match ? decodeURIComponent(match[1]) : fallback
}

/**
 * Télécharge un fichier de l'API (session, poste de caisse) ; les erreurs suivent le même
 * contrat que `apiRequest` (message français, « Connexion impossible… » sans réseau).
 */
export async function apiDownload(
  path: string,
  options: { query?: Record<string, QueryValue>; signal?: AbortSignal; fallbackName: string },
): Promise<DownloadedFile> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json',
    'X-Requested-With': 'XMLHttpRequest',
  }
  const workstation = readWorkstationToken()
  if (workstation) headers[WORKSTATION_HEADER] = workstation
  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      headers,
      credentials: 'include',
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    reportUnreachable()
    throw networkError()
  }
  reportReachable()
  if (!response.ok) throw errorFromResponse(response.status, await parseBody(response))
  return {
    blob: await response.blob(),
    filename: filenameFrom(response.headers.get('Content-Disposition'), options.fallbackName),
  }
}

/** Adresse absolue d'une ressource de l'API (PDF à ouvrir dans un nouvel onglet). */
export function apiUrl(path: string): string {
  return buildUrl(path)
}
