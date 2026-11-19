import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import type { Reservation } from '../../shared/api/types'
import { Badge, ReservationStatusBadge } from '../../shared/ui/Badge'
import { EmptyState, LoadingBlock, PageHeading, Pair, Panel } from '../../shared/ui/layout'
import { useToast } from '../../shared/ui/toastContext'
import { formatDateTime, formatDay, formatFcfa, todayIso } from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import { PaymentDialog, paymentsKey, reservationPaymentsQuery } from '../cashier'
import { invoicePdfUrl, invoicesKey, issueInvoice, reservationInvoicesQuery } from '../invoices'
import {
  cancelReservation,
  checkIn,
  checkOut,
  confirmReservation,
  historyQuery,
  reservationKeys,
  reservationQuery,
} from './api'
import { CancelDialog, ConfirmDialog, ExtendDialog, OccupantsDialog } from './dialogs'

type Dialog =
  | 'confirm'
  | 'check-in'
  | 'check-out'
  | 'cancel'
  | 'extend'
  | 'occupants'
  | 'payment'
  | 'invoice'
  | null

export function ReservationDetailPage() {
  const { id = '' } = useParams()
  const reservation = useQuery(reservationQuery(id))

  if (reservation.isPending) return <LoadingBlock lines={6} label="Chargement de la réservation…" />
  if (!reservation.data) {
    return (
      <PageHeading
        eyebrow="Réservations"
        title="Réservation introuvable"
        actions={
          <Link className="secondary" to="/reservations">
            ← Réservations
          </Link>
        }
      />
    )
  }
  return <ReservationDetail reservation={reservation.data} />
}

function ReservationDetail({ reservation: r }: { reservation: Reservation }) {
  const { can } = useCurrentUser()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const [dialog, setDialog] = useState<Dialog>(null)
  const payments = useQuery({ ...reservationPaymentsQuery(r.id), enabled: can('payments.view') })
  const invoices = useQuery({ ...reservationInvoicesQuery(r.id), enabled: can('invoices.view') })
  const history = useQuery(historyQuery(r.id))

  const refresh = () => {
    for (const key of [
      reservationKeys.detail(r.id),
      reservationKeys.history(r.id),
      paymentsKey(r.id),
      invoicesKey(r.id),
    ]) {
      void queryClient.invalidateQueries({ queryKey: key })
    }
    for (const key of [['reservations', 'list'], ['dashboard'], ['occupancy'], ['planning']]) {
      void queryClient.invalidateQueries({ queryKey: key })
    }
  }
  const done = (message: string) => {
    refresh()
    setDialog(null)
    notify(message)
  }

  const transition = useMutation({
    mutationFn: async (kind: 'confirm' | 'check-in' | 'check-out' | 'invoice') => {
      if (kind === 'confirm') await confirmReservation(r.id)
      if (kind === 'check-in') await checkIn(r.id)
      if (kind === 'check-out') await checkOut(r.id)
      if (kind === 'invoice') await issueInvoice(r.id)
      return kind
    },
    onSuccess: (kind) =>
      done(
        {
          confirm: 'Réservation confirmée',
          'check-in': 'Arrivée enregistrée',
          'check-out': 'Départ enregistré',
          invoice: 'Facture émise',
        }[kind],
      ),
  })
  const cancel = useMutation({
    mutationFn: (reason: string) => cancelReservation(r.id, reason),
    onSuccess: () => done('Réservation annulée'),
  })

  const summary = payments.data?.summary
  const open = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(r.status)
  const hasActiveInvoice =
    invoices.data?.some((invoice) => invoice.type === 'INVOICE' && invoice.status === 'ISSUED') ??
    false

  return (
    <>
      <PageHeading
        eyebrow="Réservations"
        title={r.customer?.full_name ?? 'Réservation'}
        description={`Chambre ${r.room?.number} · ${r.room?.room_type.label} · ${formatDay(r.period.start_date)} → ${formatDay(r.period.end_date)}`}
        actions={<ReservationStatusBadge status={r.status} label={r.status_label} />}
      />

      <div className="toolbar">
        <Link className="secondary" to="/reservations">
          ← Réservations
        </Link>
        {r.status === 'PENDING' && can('reservations.update') && (
          <button type="button" className="primary" onClick={() => setDialog('confirm')}>
            Confirmer la réservation
          </button>
        )}
        {r.status === 'CONFIRMED' &&
          can('reservations.check_in_out') &&
          // Confort uniquement : le serveur refuse de toute façon une arrivée anticipée (409).
          (r.period.start_date <= todayIso() ? (
            <button type="button" className="primary" onClick={() => setDialog('check-in')}>
              Enregistrer l’arrivée
            </button>
          ) : (
            <span className="caption">
              Arrivée enregistrable à partir du {formatDay(r.period.start_date)}
            </span>
          ))}
        {r.status === 'IN_PROGRESS' && can('reservations.check_in_out') && (
          <button type="button" className="primary" onClick={() => setDialog('check-out')}>
            Enregistrer le départ
          </button>
        )}
        {open && can('reservations.update') && (
          <>
            <button type="button" className="secondary" onClick={() => setDialog('extend')}>
              Prolonger
            </button>
            <button type="button" className="secondary" onClick={() => setDialog('occupants')}>
              Modifier les occupants
            </button>
          </>
        )}
        {summary &&
          summary.balance_fcfa > 0 &&
          r.status !== 'CANCELLED' &&
          can('payments.record') && (
            <button type="button" className="secondary" onClick={() => setDialog('payment')}>
              Encaisser
            </button>
          )}
        {!['PENDING', 'CANCELLED'].includes(r.status) &&
          !hasActiveInvoice &&
          can('invoices.issue') && (
            <button type="button" className="secondary" onClick={() => setDialog('invoice')}>
              Émettre une facture
            </button>
          )}
        {['PENDING', 'CONFIRMED'].includes(r.status) && can('reservations.cancel') && (
          <button type="button" className="danger" onClick={() => setDialog('cancel')}>
            Annuler la réservation
          </button>
        )}
      </div>

      <div className="dashboard-grid">
        <Panel title="Informations sur le séjour">
          <div className="panel-body pairs grid-pairs">
            <Pair label="Arrivée">
              {formatDay(r.period.start_date)} · {r.period.start_time ?? 'Heure libre'}
            </Pair>
            <Pair label="Départ">
              {formatDay(r.period.end_date)} · {r.period.end_time ?? 'Heure libre'}
            </Pair>
            <Pair label="Chambre bloquée">
              {formatDateTime(r.period.blocked_from)} → {formatDateTime(r.period.blocked_until)}
            </Pair>
            <Pair label="Occupants">
              {(r.occupants ?? []).map((o) => o.name).join(', ') || '—'}
            </Pair>
            {r.checked_in_at && (
              <Pair label="Arrivée enregistrée">{formatDateTime(r.checked_in_at)}</Pair>
            )}
            {r.checked_out_at && (
              <Pair label="Départ enregistré">{formatDateTime(r.checked_out_at)}</Pair>
            )}
            {r.cancellation_reason && (
              <Pair label="Motif d’annulation">{r.cancellation_reason}</Pair>
            )}
          </div>
          {r.period.is_estimated && (
            <p className="notice" style={{ margin: '0 18px 16px' }}>
              Période déduite : sans heure d’arrivée ou de départ, la chambre est bloquée sur la
              journée entière.
            </p>
          )}
        </Panel>

        <Panel
          title="Récapitulatif de caisse"
          action={
            summary && (
              <Badge
                tone={summary.balance_fcfa > 0 ? 'amber' : 'green'}
                label={summary.status_label}
              />
            )
          }
        >
          <div className="panel-body pairs grid-pairs">
            <Pair label="Forfait">
              {r.price.billing_unit_label} × {r.price.quantity}
            </Pair>
            <Pair label="Prix unitaire appliqué">{formatFcfa(r.price.unit_price_fcfa)}</Pair>
            <Pair label="Brut">{formatFcfa(r.price.gross_fcfa)}</Pair>
            <Pair label="Remise">
              {r.price.discount
                ? `− ${formatFcfa(r.price.discount_fcfa)} (${r.price.discount.value} · ${r.price.discount.reason})`
                : 'Aucune'}
            </Pair>
            <Pair label="Total net">{formatFcfa(r.price.net_fcfa)}</Pair>
            {summary && <Pair label="Encaissé net">{formatFcfa(summary.net_paid_fcfa)}</Pair>}
            {summary && <Pair label="Solde">{formatFcfa(summary.balance_fcfa)}</Pair>}
          </div>
        </Panel>
      </div>

      {can('payments.view') && (
        <Panel title="Encaissements du séjour">
          {payments.isPending ? (
            <LoadingBlock lines={2} />
          ) : payments.data && payments.data.data.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Reçu</th>
                    <th scope="col">Date</th>
                    <th scope="col">Moyen</th>
                    <th scope="col">Agent</th>
                    <th scope="col">État</th>
                    <th scope="col" className="num">
                      Montant
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.data.data.map((p) => (
                    <tr key={p.id}>
                      <td>{p.receipt_number}</td>
                      <td>{formatDateTime(p.received_at)}</td>
                      <td>{p.method_label}</td>
                      <td>{p.cashier.name}</td>
                      <td>
                        <Badge
                          tone={p.status === 'VALID' ? 'green' : 'red'}
                          label={p.status_label}
                        />
                        {p.refunded_fcfa > 0 && (
                          <small> · remboursé {formatFcfa(p.refunded_fcfa)}</small>
                        )}
                      </td>
                      <td className="num">{formatFcfa(p.amount_fcfa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Aucun encaissement">Le séjour n’a pas encore été réglé.</EmptyState>
          )}
        </Panel>
      )}

      {can('invoices.view') && (
        <Panel title="Factures et avoirs">
          {invoices.data && invoices.data.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Document</th>
                    <th scope="col">Date</th>
                    <th scope="col">Statut</th>
                    <th scope="col" className="num">
                      Montant net
                    </th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.data.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        {invoice.type_label} {invoice.number}
                      </td>
                      <td>{formatDateTime(invoice.issued_at)}</td>
                      <td>
                        <Badge
                          tone={
                            invoice.type === 'CREDIT_NOTE'
                              ? 'amber'
                              : invoice.status === 'CREDITED'
                                ? 'red'
                                : 'green'
                          }
                          label={invoice.type === 'CREDIT_NOTE' ? 'Avoir' : invoice.status_label}
                        />
                      </td>
                      <td className="num">{formatFcfa(invoice.net_fcfa)}</td>
                      <td className="num">
                        <a
                          className="text-button"
                          href={invoicePdfUrl(invoice.id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          PDF A4 ↗
                        </a>
                        <a
                          className="text-button"
                          href={invoice.verification_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Vérification ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Aucune facture">
              La facture s’émet une fois la réservation confirmée.
            </EmptyState>
          )}
        </Panel>
      )}

      <Panel
        title="Historique du séjour"
        subtitle="Journal des opérations, de leurs auteurs et des montants"
      >
        {history.data && history.data.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Date et heure</th>
                  <th scope="col">Auteur</th>
                  <th scope="col">Opération</th>
                  <th scope="col" className="num">
                    Montant après
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDateTime(entry.occurred_at)}</td>
                    <td>{entry.actor?.name ?? 'Système'}</td>
                    <td>{entry.label}</td>
                    <td className="num">
                      {typeof entry.after?.net_fcfa === 'number'
                        ? formatFcfa(entry.after.net_fcfa)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <LoadingBlock lines={2} />
        )}
      </Panel>

      {dialog === 'confirm' && (
        <ConfirmDialog
          title="Confirmer la réservation"
          confirmLabel="Confirmer"
          pending={transition.isPending}
          onClose={() => setDialog(null)}
          onConfirm={() => transition.mutate('confirm')}
        >
          <p>Le tarif en vigueur aujourd’hui sera figé sur la réservation.</p>
        </ConfirmDialog>
      )}
      {dialog === 'check-in' && (
        <ConfirmDialog
          title="Enregistrer l’arrivée"
          confirmLabel="Enregistrer l’arrivée"
          pending={transition.isPending}
          onClose={() => setDialog(null)}
          onConfirm={() => transition.mutate('check-in')}
        >
          <p>La chambre {r.room?.number} passera à l’état « occupée ».</p>
        </ConfirmDialog>
      )}
      {dialog === 'check-out' && (
        <ConfirmDialog
          title="Enregistrer le départ"
          confirmLabel="Enregistrer le départ"
          pending={transition.isPending}
          onClose={() => setDialog(null)}
          onConfirm={() => transition.mutate('check-out')}
        >
          <p>
            Le séjour sera clôturé et la chambre libérée.
            {summary && summary.balance_fcfa > 0 && (
              <strong> Attention : il reste {formatFcfa(summary.balance_fcfa)} à encaisser.</strong>
            )}
          </p>
        </ConfirmDialog>
      )}
      {dialog === 'invoice' && (
        <ConfirmDialog
          title="Émettre une facture"
          confirmLabel="Émettre la facture"
          pending={transition.isPending}
          onClose={() => setDialog(null)}
          onConfirm={() => transition.mutate('invoice')}
        >
          <p>La facture sera figée et numérotée. Toute correction passera ensuite par un avoir.</p>
        </ConfirmDialog>
      )}
      {dialog === 'cancel' && (
        <CancelDialog
          pending={cancel.isPending}
          onClose={() => setDialog(null)}
          onConfirm={(reason) => cancel.mutate(reason)}
        />
      )}
      {dialog === 'extend' && (
        <ExtendDialog
          reservation={r}
          onClose={() => setDialog(null)}
          onDone={() => done('Séjour prolongé')}
        />
      )}
      {dialog === 'occupants' && (
        <OccupantsDialog
          reservation={r}
          onClose={() => setDialog(null)}
          onDone={() => done('Occupants modifiés')}
        />
      )}
      {dialog === 'payment' && summary && (
        <PaymentDialog
          reservationId={r.id}
          balance={summary.balance_fcfa}
          onClose={() => {
            setDialog(null)
            refresh()
          }}
        />
      )}
    </>
  )
}
