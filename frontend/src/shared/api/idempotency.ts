import { useState } from 'react'

/**
 * Clé `Idempotency-Key` (lot 3) : une écriture renvoyée avec la même clé (double clic, réseau
 * lent, nouvel essai) rend la réponse déjà enregistrée au lieu de recommencer. Le serveur ne
 * mémorise jamais une erreur : après un refus, la même clé sert au nouvel essai corrigé.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // Page servie sans HTTPS (réseau local) : UUID v4 construit à partir d'octets aléatoires.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Une clé stable pour toute la vie d'un dialogue : chaque nouvelle ouverture en reçoit une autre. */
export function useIdempotencyKey(): string {
  const [key] = useState(newIdempotencyKey)
  return key
}
