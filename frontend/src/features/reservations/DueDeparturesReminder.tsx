import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { Reservation } from '../../shared/api/types'
import { Icon } from '../../shared/ui/Icon'
import { Modal } from '../../shared/ui/Modal'
import { useToast } from '../../shared/ui/toastContext'
import { formatDay } from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import { reservationInvoicesQuery } from '../invoices'
import { useWritesAllowedHere } from '../workstations'
import {
  alertSummaryQuery,
  departureAlertsQuery,
  overdueDuration,
  type DepartureAlert,
} from './alerts'
import { reservationKeys } from './api'
import { CheckOutDialog } from './CheckOutDialog'
import { ExtendDialog } from './dialogs'
import { refreshStay } from './stayRefresh'
import './reservationJourney.css'

/** D-071 : délai du rappel quand la caissière choisit « plus tard » (décision de l'utilisateur). */
export const REMINDER_DELAY_MS = 10 * 60_000
/** Délai laissé pour traiter le séjour sur sa fiche quand on l'ouvre depuis la fenêtre. */
const OPEN_RECORD_GRACE_MS = 2 * 60_000
const CHECK_EVERY_MS = 15_000

/**
 * « Départs à enregistrer » (D-071, décision de l'utilisateur). Dès qu'un séjour en cours a
 * dépassé sa fin (alertes D-056), une fenêtre s'ouvre sur n'importe quel écran avec, pour chaque
 * chambre, l'opération à faire : enregistrer le départ (le solde est proposé d'abord) ou prolonger
 * le séjour. « Me le rappeler dans 10 min » la ferme ; elle revient tant qu'un départ reste en
 * retard. Elle ne s'ouvre jamais par-dessus une autre fenêtre (saisie en cours, erreur), seulement
 * pour un compte qui peut enregistrer les départs, et sur un poste autorisé à écrire (D-062).
 */
export function DueDeparturesReminder() {
  const { can } = useCurrentUser()
  const writable = useWritesAllowedHere()
  const enabled = can('reservations.view') && can('reservations.check_in_out') && writable
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const summary = useQuery({ ...alertSummaryQuery, enabled })
  const list = useQuery({
    ...departureAlertsQuery({ page: 1, per_page: 10 }),
    enabled: enabled && (summary.data?.total ?? 0) > 0,
  })
  // Un départ enregistré sur ce poste (même hors ligne) retire aussitôt le séjour de la liste.
  const stays =
    (summary.data?.total ?? 0) > 0
      ? (list.data?.data ?? []).filter(
          (stay) =>
            (queryClient.getQueryData<Reservation>(reservationKeys.detail(stay.id))?.status ??
              stay.status) === 'IN_PROGRESS',
        )
      : []

  const [open, setOpen] = useState(false)
  const [quietUntil, setQuietUntil] = useState(0)
  const [handling, setHandling] = useState<{
    stay: DepartureAlert
    action: 'check-out' | 'extend'
  } | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), CHECK_EVERY_MS)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (open || handling || !enabled || stays.length === 0 || Date.now() < quietUntil) return
    const timer = window.setTimeout(() => {
      // Une autre fenêtre est ouverte (saisie, erreur) : on attend qu'elle soit fermée.
      if (!document.querySelector('[role="dialog"], [role="alertdialog"]')) setOpen(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open, handling, enabled, stays.length, quietUntil, tick])

  const later = (delay: number) => {
    setOpen(false)
    setQuietUntil(Date.now() + delay)
  }

  if (handling) {
    const close = () => setHandling(null)
    return handling.action === 'check-out' ? (
      <CheckOutDialog
        reservation={handling.stay}
        onClose={close}
        onDone={() => {
          close()
          notify(`Départ enregistré — chambre ${handling.stay.room?.number ?? ''} libérée`.trim())
        }}
      />
    ) : (
      <ReminderExtension
        stay={handling.stay}
        onClose={close}
        onDone={(invoiceNumber) => {
          refreshStay(queryClient, handling.stay.id)
          close()
          notify(
            invoiceNumber
              ? `Séjour prolongé · nouvelle facture ${invoiceNumber}`
              : 'Séjour prolongé',
          )
        }}
      />
    )
  }

  if (!open || stays.length === 0) return null

  const more = (summary.data?.total ?? stays.length) - stays.length
  return (
    <Modal
      title="Départs à enregistrer"
      subtitle={
        stays.length === 1
          ? 'Un séjour a dépassé sa date de départ.'
          : `${stays.length} séjours ont dépassé leur date de départ.`
      }
      onClose={() => later(REMINDER_DELAY_MS)}
      closeLabel="Me le rappeler dans 10 min"
      alert
    >
      <p>
        La chambre reste bloquée tant que le départ n’est pas enregistré. Enregistrez le départ du
        client, ou prolongez son séjour s’il reste.
      </p>
      <ul className="due-departures">
        {stays.map((stay) => (
          <li key={stay.id}>
            <div className="due-departures__head">
              <strong>
                Chambre {stay.room?.number ?? '—'} · {stay.customer?.full_name ?? 'Client'}
              </strong>
              <span className="due-departures__late">
                En retard de {overdueDuration(stay.overdue_minutes)}
              </span>
            </div>
            <span>
              Départ prévu le {formatDay(stay.period.end_date)}
              {stay.period.end_time ? ` à ${stay.period.end_time}` : ' (fin de journée)'}
            </span>
            <div className="due-departures__actions">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setOpen(false)
                  setHandling({ stay, action: 'check-out' })
                }}
              >
                <Icon name="logout" size={17} />
                Enregistrer le départ
              </button>
              {can('reservations.update') && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setOpen(false)
                    setHandling({ stay, action: 'extend' })
                  }}
                >
                  <Icon name="calendar" size={17} />
                  Prolonger le séjour
                </button>
              )}
              <Link
                className="text-button"
                to={`/reservations/${stay.id}`}
                onClick={() => later(OPEN_RECORD_GRACE_MS)}
              >
                Ouvrir la fiche
              </Link>
            </div>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <p className="caption">
          Et {more} autre(s) :{' '}
          <Link to="/alertes" onClick={() => later(OPEN_RECORD_GRACE_MS)}>
            voir toutes les alertes
          </Link>
          .
        </p>
      )}
    </Modal>
  )
}

/** Prolongation depuis la fenêtre : la facture active est lue pour annoncer son remplacement. */
function ReminderExtension({
  stay,
  onClose,
  onDone,
}: {
  stay: Reservation
  onClose: () => void
  onDone: (invoiceNumber: string | null) => void
}) {
  const { can } = useCurrentUser()
  const invoices = useQuery({
    ...reservationInvoicesQuery(stay.id),
    enabled: can('invoices.view'),
  })
  if (can('invoices.view') && invoices.isPending) return null
  const active =
    invoices.data?.find((invoice) => invoice.type === 'INVOICE' && invoice.status === 'ISSUED') ??
    null
  return (
    <ExtendDialog
      reservation={stay}
      activeInvoiceNumber={active?.number ?? null}
      onClose={onClose}
      onDone={onDone}
    />
  )
}
