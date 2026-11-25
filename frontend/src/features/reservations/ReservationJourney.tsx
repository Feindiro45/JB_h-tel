import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import type { AccountSummary, InvoiceSummary, Reservation } from '../../shared/api/types'
import { Icon } from '../../shared/ui/Icon'
import { formatDay, formatFcfa, todayIso } from '../../shared/utils/format'
import './reservationJourney.css'

type Action = 'confirm' | 'check-in' | 'check-out' | 'payment'

export function ReservationJourney({
  reservation: r,
  summary,
  invoice,
  invoicePending,
  can,
  onAction,
}: {
  reservation: Reservation
  summary?: AccountSummary
  invoice: InvoiceSummary | null
  invoicePending: boolean
  can: (permission: string) => boolean
  onAction: (action: Action) => void
}) {
  const location = useLocation()
  const heading = useRef<HTMLHeadingElement>(null)
  const justCreated = Boolean(
    (location.state as { reservationCreated?: boolean } | null)?.reservationCreated,
  )
  useEffect(() => {
    if (justCreated) heading.current?.focus()
  }, [justCreated])
  if (r.status === 'CANCELLED') return null

  const pending = r.status === 'PENDING'
  const inProgress = r.status === 'IN_PROGRESS'
  const completed = r.status === 'COMPLETED'
  const arrivalReady = r.period.start_date <= todayIso()
  const balance = summary?.balance_fcfa
  const paid = balance !== undefined && balance <= 0
  const next = pending
    ? 'Confirmez la réservation : la facture sera créée automatiquement.'
    : completed
      ? balance !== undefined && balance > 0
        ? 'Le séjour est terminé : encaissez le solde restant.'
        : 'Le séjour est terminé. Les documents restent disponibles ci-dessous.'
      : inProgress
        ? balance !== undefined && balance > 0
          ? 'Avant le départ, pensez au solde et enregistrez ensuite le départ pour libérer la chambre.'
          : 'Au départ du client, enregistrez son départ pour libérer la chambre.'
        : arrivalReady
          ? 'À l’arrivée du client, enregistrez son arrivée pour marquer la chambre occupée.'
          : `Préparez le séjour. L’arrivée pourra être enregistrée à partir du ${formatDay(r.period.start_date)}.`

  return (
    <section className="reservation-journey" aria-labelledby="reservation-journey-title">
      <div className="reservation-journey__heading">
        <Icon name="calendar" size={25} />
        <div>
          <h2 id="reservation-journey-title" ref={heading} tabIndex={-1}>
            {justCreated
              ? 'Réservation enregistrée : les prochaines étapes'
              : 'Les étapes du séjour'}
          </h2>
          <p>Suivez l’avancement ; chaque action enregistrée met ce guide à jour.</p>
        </div>
      </div>
      <ol className="reservation-journey__steps">
        <li data-done={!pending} aria-current={pending ? 'step' : undefined}>
          <span className="reservation-journey__number">1</span>
          <strong>Réservation</strong>
          <span>{pending ? 'À confirmer' : 'Confirmation enregistrée'}</span>
        </li>
        <li data-done={Boolean(invoice)}>
          <span className="reservation-journey__number">2</span>
          <strong>Facture automatique</strong>
          <span>
            {invoice
              ? invoice.number
              : pending
                ? 'À la confirmation'
                : invoicePending
                  ? 'Chargement du document…'
                  : can('invoices.view')
                    ? 'Facture absente : à vérifier avec l’administrateur'
                    : 'Consultation avec un compte autorisé'}
          </span>
          {invoice && can('invoices.view') && (
            <Link to={`/documents/factures/${invoice.id}/ticket`} className="text-button">
              Ouvrir le ticket de facture
            </Link>
          )}
        </li>
        <li
          data-done={inProgress || completed}
          aria-current={!pending && !inProgress && !completed ? 'step' : undefined}
        >
          <span className="reservation-journey__number">3</span>
          <strong>Arrivée du client</strong>
          <span>
            {inProgress || completed
              ? 'Arrivée enregistrée'
              : 'À enregistrer quand le client arrive'}
          </span>
        </li>
        <li data-done={paid} aria-current={inProgress && !paid ? 'step' : undefined}>
          <span className="reservation-journey__number">4</span>
          <strong>Encaissement et reçu</strong>
          <span>
            {paid
              ? 'Solde réglé'
              : balance !== undefined
                ? `${formatFcfa(balance)} à encaisser`
                : 'Situation de caisse à consulter'}
          </span>
          {!paid && (
            <small>
              Une avance ou un paiement différé reste possible. Vérifiez le solde avant le départ.
            </small>
          )}
        </li>
        <li data-done={completed} aria-current={inProgress && paid ? 'step' : undefined}>
          <span className="reservation-journey__number">5</span>
          <strong>Départ du client</strong>
          <span>
            {completed
              ? 'Départ enregistré · chambre libérée'
              : 'À enregistrer au départ pour libérer la chambre'}
          </span>
        </li>
      </ol>
      <div className="reservation-journey__next">
        <div>
          <strong>Prochaine opération</strong>
          <p>{next}</p>
        </div>
        <div className="reservation-journey__actions">
          {pending && can('reservations.update') && (
            <button type="button" className="primary" onClick={() => onAction('confirm')}>
              <Icon name="check" size={17} />
              Confirmer la réservation
            </button>
          )}
          {r.status === 'CONFIRMED' && arrivalReady && can('reservations.check_in_out') && (
            <button type="button" className="primary" onClick={() => onAction('check-in')}>
              <Icon name="login" size={17} />
              Enregistrer l’arrivée
            </button>
          )}
          {balance !== undefined && balance > 0 && can('payments.record') && (
            <button type="button" className="secondary" onClick={() => onAction('payment')}>
              <Icon name="wallet" size={17} />
              Encaisser
            </button>
          )}
          {inProgress && can('reservations.check_in_out') && (
            <button type="button" className="primary" onClick={() => onAction('check-out')}>
              <Icon name="logout" size={17} />
              Enregistrer le départ
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
