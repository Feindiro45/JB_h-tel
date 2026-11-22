/**
 * Rythme des échanges en masse avec le serveur (téléchargement complet, envoi après une longue
 * coupure) : l'API accepte 120 requêtes par minute et par utilisateur ; on reste en dessous, en
 * gardant de la marge pour les écrans ouverts. Un « trop de requêtes » (429) est réessayé.
 */
export const BULK_REQUESTS_PER_MINUTE = 90
export const RETRY_AFTER_429_MS = 15_000

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Jamais plus de `perMinute` départs sur 60 s glissantes, ni plus de `concurrency` en cours. */
export function createLimiter(perMinute = BULK_REQUESTS_PER_MINUTE, concurrency = 4) {
  const starts: number[] = []
  let active = 0
  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    for (;;) {
      const now = Date.now()
      while (starts.length > 0 && now - starts[0]! >= 60_000) starts.shift()
      if (active < concurrency && starts.length < perMinute) break
      await sleep(active >= concurrency ? 25 : 60_000 - (now - starts[0]!) + 10)
    }
    active++
    starts.push(Date.now())
    try {
      return await task()
    } finally {
      active--
    }
  }
}
