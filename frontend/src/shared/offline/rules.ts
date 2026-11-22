import type { QueryClient } from '@tanstack/react-query'
import type { OperationKind } from './outbox'
import { getQueryClientRef } from './queryClientRef'

/**
 * Règles hors ligne (lot 4A.5, provisoires, écran Paramètres → Hors ligne) : envoyées par le
 * serveur avec le signal de présence du poste et gardées dans sa copie, elles s'appliquent aussi
 * sans réseau. Valeurs par défaut tant que le poste ne les a jamais reçues.
 */
export interface OfflineRules {
  /** `null` : toutes les opérations sont permises (N-02). */
  allowed_operations: string[] | null
  lock_after_minutes: number
  backup_reminder_minutes: number
  provisional_prefix: string
}

export const DEFAULT_OFFLINE_RULES: OfflineRules = {
  allowed_operations: null,
  lock_after_minutes: 15,
  backup_reminder_minutes: 60,
  provisional_prefix: 'LOC',
}

/** Libellés des opérations (mêmes que le serveur, `OfflineOperation::KIND_LABELS`). */
export const OPERATION_LABELS: Record<OperationKind, string> = {
  'payment.record': 'Encaissement',
  'reservation.create': 'Nouvelle réservation',
  'customer.create': 'Nouveau client',
  'reservation.confirm': 'Confirmation d’une réservation',
  'reservation.check-in': 'Arrivée',
  'reservation.check-out': 'Départ',
  'reservation.extend': 'Prolongation',
  'reservation.cancel': 'Annulation',
  'reservation.modify': 'Modification d’une réservation',
  'reservation.occupants': 'Occupants',
  'invoice.issue': 'Facture provisoire',
}

export function offlineRules(client: QueryClient | null = getQueryClientRef()): OfflineRules {
  const self = client?.getQueryData<{ offline_rules?: Partial<OfflineRules> } | null>([
    'workstation',
    'self',
  ])
  return { ...DEFAULT_OFFLINE_RULES, ...(self?.offline_rules ?? {}) }
}

export function isAllowedOffline(kind: OperationKind, rules: OfflineRules): boolean {
  return rules.allowed_operations === null || rules.allowed_operations.includes(kind)
}

/** « plus d’une heure », « plus de 30 min », « plus de 2 h » : délai du rappel de sauvegarde. */
export function reminderDelayLabel(minutes: number): string {
  if (minutes === 60) return 'plus d’une heure'
  if (minutes % 60 === 0) return `plus de ${minutes / 60} h`
  return `plus de ${minutes} min`
}
