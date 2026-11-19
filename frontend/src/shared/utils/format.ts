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
  return `${integerFormatter.format(amount === 0 ? 0 : amount)} FCFA`
}

/** Montant signé lisible : « − 5 000 FCFA » pour une sortie de caisse (vrai signe moins). */
export function formatSignedFcfa(amount: number): string {
  return amount < 0 ? `− ${formatFcfa(-amount)}` : formatFcfa(amount)
}

/** Montant sans unité, pour les axes de graphique et les tableaux serrés. */
export function formatNumber(amount: number): string {
  return integerFormatter.format(amount)
}

function toDate(value: Date | string): Date {
  if (value instanceof Date) return value
  // Une date seule (« 2026-12-01 ») désigne un jour de l'hôtel, pas un instant UTC.
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value)
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

/** « 01 déc. 2026 » */
export function formatDay(value: Date | string, timeZone: string = config.timeZone): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(toDate(value))
}

/** « lun. 01/12 », pour les colonnes du planning. */
export function formatWeekday(value: string, timeZone: string = config.timeZone): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone,
  }).format(toDate(value))
}

/** « 14:30 » */
export function formatTime(value: Date | string, timeZone: string = config.timeZone): string {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(toDate(value))
}

/** Date du jour dans le fuseau de l'hôtel, au format « AAAA-MM-JJ ». */
export function todayIso(timeZone: string = config.timeZone, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now)
}

/** Ajoute des jours à une date « AAAA-MM-JJ ». */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** « Awa Ngaïkosset » → « AN » */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2)
}
