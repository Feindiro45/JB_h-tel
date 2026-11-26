/*
 * JB Hôtel — service worker (lot 2, D-064). Ouvre l'application sans réseau une fois chargée en
 * ligne. Il ne garde que l'application elle-même (page d'accueil et fichiers de /assets/) ; les
 * données viennent de la copie locale IndexedDB, et l'API n'est jamais interceptée.
 *
 * - Pages : réseau d'abord (toujours la dernière version en ligne), copie gardée sinon.
 * - Fichiers /assets/ (noms uniques à chaque version) : copie gardée d'abord.
 * - Paramètre `api` : préfixe de l'API sur le même domaine (ex. /backend), jamais intercepté.
 */
const CACHE = 'jb-hotel-shell-v1'
const scope = self.registration.scope
const apiPrefix = new URL(self.location.href).searchParams.get('api') || ''
const indexUrl = new URL('index.html', scope).href
const assetsPath = new URL('assets/', scope).pathname

function isApi(url) {
  if (apiPrefix && (url.pathname === apiPrefix || url.pathname.startsWith(`${apiPrefix}/`))) {
    return true
  }
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/sanctum/')
}

async function cacheShell(cache, response) {
  const html = await response.clone().text()
  await cache.put(indexUrl, response)
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => new URL(match[1], scope))
    .filter((url) => url.origin === self.location.origin && url.pathname.startsWith(assetsPath))
  await Promise.all(assets.map((url) => cache.add(url.href).catch(() => undefined)))
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      try {
        const response = await fetch(scope, { cache: 'no-store' })
        if (response.ok) await cacheShell(cache, response)
      } catch {
        // Installation hors ligne : la page sera gardée au prochain chargement en ligne.
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key.startsWith('jb-hotel-shell-') && key !== CACHE)
          .map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
      await cacheShell(cache, response.clone())
    }
    return response
  } catch {
    return (await cache.match(indexUrl)) || Response.error()
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || isApi(url)) return
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request))
  } else if (url.pathname.startsWith(assetsPath)) {
    event.respondWith(cacheFirstAsset(request))
  }
})
