import { protocol, type Session } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import {
  isAppLocation,
  requestHeaders,
  responseHeaders,
  targetUrl,
  type ServerTarget,
} from './proxy.ts'

/**
 * Protocole `app://jbhotel/` (D-069) : l'interface React est lue dans les fichiers installés
 * avec le logiciel (aucun CDN, aucun serveur Vite, aucun accès réseau pour s'afficher), et les
 * appels `app://jbhotel/server/…` sont relayés vers Laravel (voir `proxy.ts`).
 */
export const SCHEME = 'app'

/** Politique de sécurité du contenu de l'interface : rien ne se charge hors de l'application. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

/** À appeler avant `app.whenReady()`. */
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true },
    },
  ])
}

async function fileResponse(file: string): Promise<Response> {
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
  const headers: Record<string, string> = {
    'content-type': type,
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-cache',
  }
  if (type.startsWith('text/html')) headers['content-security-policy'] = CONTENT_SECURITY_POLICY
  return new Response(new Uint8Array(await readFile(file)), { status: 200, headers })
}

async function serveStatic(root: string, pathname: string): Promise<Response> {
  let relative: string
  try {
    relative = decodeURIComponent(pathname)
  } catch {
    return new Response('Adresse invalide', { status: 400 })
  }
  const file = normalize(join(root, relative))
  if (file !== root && !file.startsWith(root + sep)) {
    return new Response('Introuvable', { status: 404 })
  }
  try {
    if ((await stat(file)).isFile()) return await fileResponse(file)
  } catch {
    // Fichier absent : adresse de l'application (routeur React) ou ressource manquante.
  }
  if (relative.startsWith('/assets/') || /\.[a-z0-9]+$/i.test(relative)) {
    return new Response('Introuvable', { status: 404 })
  }
  return fileResponse(join(root, 'index.html'))
}

const NULL_BODY = new Set([101, 204, 205, 304])

async function readXsrf(session: Session, serverUrl: string): Promise<string | null> {
  const cookies = await session.cookies.get({ url: `${serverUrl}/`, name: 'XSRF-TOKEN' })
  const value = cookies[0]?.value
  if (!value) return null
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

async function relay(
  session: Session,
  request: Request,
  url: string,
  target: ServerTarget,
): Promise<Response> {
  const method = request.method.toUpperCase()
  const write = method !== 'GET' && method !== 'HEAD'
  const headers = requestHeaders(
    request.headers,
    target,
    method,
    write ? await readXsrf(session, target.serverUrl) : null,
  )
  const upstream = await session.fetch(url, {
    method,
    headers,
    body: write ? await request.arrayBuffer() : undefined,
    credentials: 'include',
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  } as RequestInit)
  return new Response(NULL_BODY.has(upstream.status) ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders(upstream.headers),
  })
}

export function handleProtocol(
  session: Session,
  rendererDir: string,
  target: () => ServerTarget,
): void {
  const root = normalize(rendererDir)
  session.protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url)
    if (!isAppLocation(url)) return new Response('Introuvable', { status: 404 })
    const current = target()
    const api = targetUrl(request.url, current.serverUrl)
    // Une erreur réseau rejetée ici devient « Connexion impossible » dans l'interface (hors ligne).
    if (api) return relay(session, request, api, current)
    return serveStatic(root, url.pathname)
  })
}
