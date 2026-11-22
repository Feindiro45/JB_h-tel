/**
 * Petit stockage clé → valeur dans IndexedDB (copie locale du mode hors ligne, D-064). Si le
 * navigateur refuse IndexedDB (navigation privée, tests), les valeurs restent en mémoire le
 * temps de la page : l'application fonctionne, sans copie hors ligne durable.
 */
const DB_NAME = 'jb-hotel-offline'
const STORE = 'kv'

const memory = new Map<string, unknown>()
let database: Promise<IDBDatabase | null> | null = null

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  database ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return database
}

/**
 * Une écriture n'est confirmée qu'une fois **inscrite sur le disque** (durabilité stricte) : une
 * coupure de courant juste après un encaissement hors ligne ne peut pas le perdre.
 */
function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined)
        try {
          const transaction =
            mode === 'readwrite'
              ? db.transaction(STORE, mode, { durability: 'strict' })
              : db.transaction(STORE, mode)
          const request = action(transaction.objectStore(STORE))
          transaction.oncomplete = () => resolve(request.result as T)
          transaction.onerror = () => resolve(undefined)
          transaction.onabort = () => resolve(undefined)
        } catch {
          resolve(undefined)
        }
      }),
  )
}

export async function storageGet<T>(key: string): Promise<T | undefined> {
  if (!(await open())) return memory.get(key) as T | undefined
  return run<T>('readonly', (store) => store.get(key))
}

/** Rend `false` si le navigateur refuse l’écriture (stockage plein ou interdit). */
export async function storageSet(key: string, value: unknown): Promise<boolean> {
  if (!(await open())) {
    memory.set(key, value)
    return true
  }
  return (await run<IDBValidKey>('readwrite', (store) => store.put(value, key))) !== undefined
}

export async function storageDelete(key: string): Promise<void> {
  memory.delete(key)
  if (await open()) await run('readwrite', (store) => store.delete(key))
}

export async function storageClear(): Promise<void> {
  memory.clear()
  if (await open()) await run('readwrite', (store) => store.clear())
}

export interface StorageProtection {
  /** IndexedDB disponible ; sinon les données ne vivent que le temps de la page. */
  durable: boolean
  /** `true` : le navigateur s'engage à ne rien effacer de lui-même ; `null` : information absente. */
  persisted: boolean | null
  usage: number | null
  quota: number | null
}

/**
 * Par défaut, le navigateur garde IndexedDB « au mieux » : disque plein, il peut l'effacer sans
 * prévenir. Le stockage persistant l'en empêche (accordé d'office à une application installée par
 * Edge et Chrome ; Firefox le demande à l'utilisateur).
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

export async function storageProtection(): Promise<StorageProtection> {
  const durable = (await open()) !== null
  let persisted: boolean | null = null
  let usage: number | null = null
  let quota: number | null = null
  try {
    if (typeof navigator !== 'undefined' && navigator.storage) {
      if (navigator.storage.persisted) persisted = await navigator.storage.persisted()
      if (navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate()
        usage = estimate.usage ?? null
        quota = estimate.quota ?? null
      }
    }
  } catch {
    // Information indisponible : l'écran l'indique sans bloquer.
  }
  return { durable, persisted, usage, quota }
}

function byteSize(value: unknown): number {
  try {
    return new Blob([JSON.stringify(value) ?? '']).size
  } catch {
    return 0
  }
}

/** Taille de chaque donnée gardée sur le poste (octets), pour la répartition du stockage. */
export async function storageSizes(): Promise<Record<string, number>> {
  const db = await open()
  if (!db) return Object.fromEntries([...memory].map(([key, value]) => [key, byteSize(value)]))
  return new Promise((resolve) => {
    const sizes: Record<string, number> = {}
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return resolve(sizes)
        sizes[String(cursor.key)] = byteSize(cursor.value)
        cursor.continue()
      }
      request.onerror = () => resolve(sizes)
    } catch {
      resolve(sizes)
    }
  })
}
