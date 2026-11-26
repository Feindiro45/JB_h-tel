import { desktopBridge, type DesktopBridge } from '../desktop/bridge'

/**
 * Petit stockage clé → valeur dans IndexedDB (copie locale du mode hors ligne, D-064). Si le
 * navigateur refuse IndexedDB (navigation privée, tests), les valeurs restent en mémoire le
 * temps de la page : l'application fonctionne, sans copie hors ligne durable.
 *
 * Dans le logiciel Windows (D-069), les mêmes fonctions écrivent dans la base SQLite du poste
 * (processus principal Electron) : mêmes clés, mêmes valeurs, transactions SQLite.
 */
const DB_NAME = 'jb-hotel-offline'
const STORE = 'kv'

const memory = new Map<string, unknown>()
let database: Promise<IDBDatabase | null> | null = null

export const STORAGE_ERROR =
  'Enregistrement impossible sur ce poste : stockage durable indisponible, plein ou refusé. Gardez cette page ouverte et rétablissez le stockage avant de travailler hors ligne.'

/** Lecture et écritures dans une seule transaction, également entre plusieurs onglets. */
export async function storageMutate<T>(
  keys: string[],
  change: (values: Record<string, unknown>) => { values: Record<string, unknown>; result: T },
): Promise<T> {
  const desktop = desktopBridge()
  if (desktop) return desktopMutate(desktop, keys, change)
  const db = await open()
  if (!db || typeof indexedDB === 'undefined') throw new Error(STORAGE_ERROR)
  return new Promise<T>((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE, 'readwrite', { durability: 'strict' })
      const store = transaction.objectStore(STORE)
      const values: Record<string, unknown> = {}
      let remaining = keys.length
      let result: T
      let failure: unknown
      const apply = () => {
        try {
          const changed = change(values)
          result = changed.result
          for (const [key, value] of Object.entries(changed.values)) store.put(value, key)
        } catch (error) {
          failure = error
          transaction.abort()
        }
      }
      for (const key of keys) {
        const request = store.get(key)
        request.onsuccess = () => {
          values[key] = request.result
          if (--remaining === 0) apply()
        }
      }
      if (keys.length === 0) apply()
      transaction.oncomplete = () => resolve(result)
      transaction.onerror = transaction.onabort = () => reject(failure ?? new Error(STORAGE_ERROR))
    } catch {
      reject(new Error(STORAGE_ERROR))
    }
  })
}

/**
 * Écritures du poste Windows l'une après l'autre : une écriture hors ligne (opération, numéro
 * provisoire, copie des écrans) n'est calculée qu'une fois, sans conflit avec une sauvegarde
 * automatique de la copie lancée au même moment.
 */
let desktopWrites: Promise<unknown> = Promise.resolve()

function serialized<T>(work: () => Promise<T>): Promise<T> {
  const next = desktopWrites.then(work, work)
  desktopWrites = next.catch(() => undefined)
  return next
}

/**
 * Lecture versionnée puis écriture conditionnelle dans une transaction SQLite : si une autre
 * écriture (autre fenêtre, restauration) a changé une des clés lues entre-temps, la lecture et
 * le calcul sont refaits.
 */
function desktopMutate<T>(
  desktop: DesktopBridge,
  keys: string[],
  change: (values: Record<string, unknown>) => { values: Record<string, unknown>; result: T },
): Promise<T> {
  return serialized(() => desktopMutateNow(desktop, keys, change))
}

async function desktopMutateNow<T>(
  desktop: DesktopBridge,
  keys: string[],
  change: (values: Record<string, unknown>) => { values: Record<string, unknown>; result: T },
): Promise<T> {
  for (let attempt = 0; attempt < 10; attempt++) {
    let read
    try {
      read = await desktop.storage.read(keys)
    } catch {
      throw new Error(STORAGE_ERROR)
    }
    const changed = change(read.values)
    let committed
    try {
      committed = await desktop.storage.commit({ expect: read.versions, put: changed.values })
    } catch {
      throw new Error(STORAGE_ERROR)
    }
    if (committed.ok) return changed.result
  }
  throw new Error(STORAGE_ERROR)
}

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
  const desktop = desktopBridge()
  if (desktop) {
    try {
      return (await desktop.storage.read([key])).values[key] as T | undefined
    } catch {
      return undefined
    }
  }
  if (!(await open())) return memory.get(key) as T | undefined
  return run<T>('readonly', (store) => store.get(key))
}

/** Rend `false` si le navigateur refuse l’écriture (stockage plein ou interdit). */
export async function storageSet(key: string, value: unknown): Promise<boolean> {
  const desktop = desktopBridge()
  if (desktop) {
    try {
      return (await serialized(() => desktop.storage.commit({ put: { [key]: value } }))).ok
    } catch {
      return false
    }
  }
  if (!(await open())) {
    memory.set(key, value)
    return true
  }
  return (await run<IDBValidKey>('readwrite', (store) => store.put(value, key))) !== undefined
}

export async function storageDelete(key: string): Promise<void> {
  memory.delete(key)
  const desktop = desktopBridge()
  if (desktop) {
    await serialized(() => desktop.storage.commit({ remove: [key] })).catch(() => undefined)
    return
  }
  if (await open()) await run('readwrite', (store) => store.delete(key))
}

export async function storageClear(): Promise<void> {
  memory.clear()
  const desktop = desktopBridge()
  // Poste Windows : la file des opérations et la numérotation provisoire ne sont jamais effacées.
  if (desktop) return serialized(() => desktop.storage.clear())
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
  // Poste Windows : base SQLite sur le disque, jamais effacée par un navigateur.
  if (desktopBridge()) return true
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

export async function storageProtection(): Promise<StorageProtection> {
  const desktop = desktopBridge()
  if (desktop) {
    try {
      const info = await desktop.system.info()
      const usage = info.databaseBytes
      const quota = usage !== null && info.freeBytes !== null ? usage + info.freeBytes : null
      return { durable: true, persisted: true, usage, quota }
    } catch {
      return { durable: true, persisted: true, usage: null, quota: null }
    }
  }
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
  const desktop = desktopBridge()
  if (desktop) return desktop.storage.sizes().catch(() => ({}))
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
