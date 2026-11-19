import { config } from '../config'

const integerFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/**
 * Formate un montant entier en FCFA avec séparateur de milliers (espace insécable fine).
 * Les montants sont toujours des entiers (docs/DECISIONS.md D-008) : un montant non entier
 * révèle une erreur de calcul et lève une exception plutôt que d'être arrondi en silence.
 */
export function formatFcfa(amount: number): string {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`Montant FCFA non entier : ${amount}`)
  }
  return `${integerFormatter.format(amount)} FCFA`
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

export function formatDateTime(value: Date | string, timeZone: string = config.timeZone): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone,
  }).format(toDate(value))
}

export function formatDate(value: Date | string, timeZone: string = config.timeZone): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone }).format(toDate(value))
}
