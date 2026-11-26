import type { AccountSummary, Reservation } from '../../shared/api/types'
import { todayIso } from '../../shared/utils/format'

export type JourneyAction = 'confirm' | 'check-in' | 'check-out' | 'payment'
/** Opération qui vient d'aboutir sur la fiche (« created » : arrivée depuis l'assistant). */
export type CompletedStep = 'created' | 'confirm' | 'check-in' | 'payment'

/**
 * Enchaînement des étapes (D-071) : après une opération réussie, la fenêtre de la suivante
 * s'ouvre d'elle-même, si l'utilisateur a le droit de la faire. On ne repropose jamais
 * l'opération qui vient d'être faite (un encaissement partiel n'ouvre pas un autre encaissement).
 * - après la création : l'arrivée, si le séjour commence aujourd'hui ;
 * - après la confirmation : l'encaissement s'il reste un solde, sinon l'arrivée ;
 * - après l'arrivée : l'encaissement s'il reste un solde ;
 * - après un encaissement : l'arrivée si elle est possible, ou le départ le dernier jour du séjour.
 */
export function nextOperation(
  after: CompletedStep,
  r: Reservation,
  summary: AccountSummary | undefined,
  can: (permission: string) => boolean,
  today: string = todayIso(),
): JourneyAction | null {
  const owes = summary !== undefined && summary.balance_fcfa > 0 && can('payments.record')
  const moves = can('reservations.check_in_out')
  const arrival = moves && r.status === 'CONFIRMED' && r.period.start_date <= today
  const departure =
    moves &&
    r.status === 'IN_PROGRESS' &&
    (r.departure_overdue === true || r.period.end_date <= today)
  switch (after) {
    case 'created':
      return arrival ? 'check-in' : null
    case 'confirm':
      return owes ? 'payment' : arrival ? 'check-in' : null
    case 'check-in':
      return owes ? 'payment' : null
    case 'payment':
      return arrival ? 'check-in' : departure ? 'check-out' : null
  }
}
