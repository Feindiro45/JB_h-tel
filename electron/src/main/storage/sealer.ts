import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Chiffrement des données sensibles de la base locale (D-069, docs/OFFLINE_SECURITY.md).
 * SQLite n'est pas chiffré par lui-même : chaque valeur (opérations, copie des données, session)
 * est scellée en AES-256-GCM avant d'être écrite. La clé est aléatoire ; sous Windows elle est
 * protégée par DPAPI (Electron `safeStorage`), donc liée au compte Windows de la caissière.
 * Les colonnes techniques (type d'opération, état, dates) restent lisibles pour le diagnostic.
 */
export interface Sealer {
  /** `dpapi` : clé protégée par Windows ; `plain` : chiffrement indisponible (signalé). */
  readonly mode: 'dpapi' | 'plain' | 'memory'
  readonly sealed: boolean
  seal(text: string): Uint8Array
  open(data: Uint8Array, sealed: boolean): string
}

const FORMAT = 1
const IV_BYTES = 12
const TAG_BYTES = 16

export function keySealer(key: Uint8Array, mode: 'dpapi' | 'memory'): Sealer {
  if (key.byteLength !== 32) throw new Error('Clé de chiffrement locale invalide.')
  return {
    mode,
    sealed: true,
    seal(text) {
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
      return Buffer.concat([Buffer.from([FORMAT]), iv, cipher.getAuthTag(), body])
    },
    open(data, sealed) {
      const bytes = Buffer.from(data)
      if (!sealed) return bytes.toString('utf8')
      if (bytes[0] !== FORMAT) throw new Error('Donnée locale illisible (format inconnu).')
      const iv = bytes.subarray(1, 1 + IV_BYTES)
      const tag = bytes.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES)
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([
        decipher.update(bytes.subarray(1 + IV_BYTES + TAG_BYTES)),
        decipher.final(),
      ]).toString('utf8')
    },
  }
}

/** Sans protection du système, les valeurs restent en clair ; l'écran « Poste Windows » le dit. */
export const plainSealer: Sealer = {
  mode: 'plain',
  sealed: false,
  seal: (text) => Buffer.from(text, 'utf8'),
  open(data, sealed) {
    if (sealed) {
      throw new Error(
        'Données locales chiffrées illisibles : la clé de ce compte Windows est indisponible.',
      )
    }
    return Buffer.from(data).toString('utf8')
  },
}

export function newKey(): Uint8Array {
  return randomBytes(32)
}
