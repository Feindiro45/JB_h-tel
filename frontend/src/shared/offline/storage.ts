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

function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined)
        try {
          const request = action(db.transaction(STORE, mode).objectStore(STORE))
          request.onsuccess = () => resolve(request.result as T)
          request.onerror = () => resolve(undefined)
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
