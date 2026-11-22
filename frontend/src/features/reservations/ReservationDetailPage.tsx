import { LocalTable } from '../../shared/ui/LocalTable'
import { PageOverview } from '../../shared/ui/PageOverview'
import { Icon } from '../../shared/ui/Icon'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { InvoiceSummary, Reservation } from '../../shared/api/types'
import { isLocalId, operationIdOf } from '../../shared/offline/localRefs'
import { outboxQuery, type QueuedOperation } from '../../shared/offline/outbox'
import { Badge, ReservationStatusBadge } from '../../shared/ui/Badge'
import { DeleteDialog } from '../../shared/ui/DeleteDialog'
import { EmptyState, LoadingBlock, PageHeading, Pair, Panel } from '../../shared/ui/layout'
import { useToast } from '../../shared/ui/toastContext'
import { formatDateTime, formatDay, formatFcfa, todayIso } from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import {
  CASH_KEYS,
  PaymentActions,
  PaymentDialog,
  paymentsKey,
  reservationPaymentsQuery,
} from '../cashier'
import {
  CreditNoteDialog,
  invoicePdfUrl,
  invoicesKey,
  issueInvoice,
  reservationInvoicesQuery,
} from '../invoices'
import {
  cancelReservation,
  checkIn,
  checkOut,
  confirmReservation,
  historyQuery,
  reservationKeys,
  reservationQuery,
  type CancellationInput,
} from './api'
import { CancelDialog, ConfirmDialog, ExtendDialog, ModifyDialog, OccupantsDialog } from './dialogs'
import { ALERTS_KEY } from './alerts'

type Dialog =
  | 'confirm'
  | 'check-in'
  | 'check-out'
  | 'cancel'
  | 'extend'
  | 'occupants'
  | 'payment'
  | 'invoice'
  | 'modify'
  | 'delete'
  | null

export function ReservationDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const reservation = useQuery({
    ...reservationQuery(id),
    refetchInterval: (query) =>
      query.state.data?.status === 'IN_PROGRESS' && !isLocalId(id) ? 30_000 : false,
    refetchOnWindowFocus: !isLocalId(id),
  })
  // Réservation créée hors ligne : une fois reçue par le serveur, la fiche définitive s'ouvre.
  const outbox = useQuery({ ...outboxQuery, enabled: isLocalId(id) })
  const origin = isLocalId(id)
    ? (outbox.data?.find((operation) => operation.id === operationIdOf(id)) ?? null)
    : null
  const serverId = origin?.status === 'accepted' ? origin.resultId : null
  useEffect(() => {
    if (serverId) void navigate(`/reservations/${serverId}`, { replace: true })
  }, [navigate, serverId])

  if (reservation.isPending) return <LoadingBlock lines={6} label="Chargement de la réservation…" />
  if (!reservation.data) {
    return (
      <PageHeading
        icon="calendar"
        eyebrow="Réservations"
        title="Réservation introuvable"
        actions={
          <Link className="secondary" to="/reservations">
            <Icon name="back" size={17} />
            <span className="sr-only">←</span> Réservations
          </Link>
        }
      />
    )
  }
  return <ReservationDetail reservation={reservation.data} origin={origin} />
}

function ReservationDetail({
  reservation: r,
  origin,
}: {
  reservation: Reservation
  /** Opération qui a créé la réservation hors ligne, tant qu'elle n'est pas reçue par le serveur. */
  origin: QueuedOperation | null
}) {
  const local = isLocalId(r.id)
  const { can } = useCurrentUser()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [crediting, setCrediting] = useState<InvoiceSummary | null>(null)
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
    // Annulation et prolongation touchent aussi la caisse et les factures (D-053).
    for (const key of [
      ['reservations', 'list'],
      ['occupancy'],
      ['planning'],
      ['free-rooms'],
      ALERTS_KEY,
      ['invoices'],
      ...CASH_KEYS,
    ]) {
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
    mutationFn: (input: CancellationInput) => cancelReservation(r.id, input),
    onSuccess: (_, input) =>
      done(
        input.refund_fcfa > 0
          ? `Réservation annulée, ${formatFcfa(input.refund_fcfa)} remboursés`
          : 'Réservation annulée',
      ),
  })

  const summary = payments.data?.summary
  const open = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(r.status)
  const activeInvoice =
    invoices.data?.find((invoice) => invoice.type === 'INVOICE' && invoice.status === 'ISSUED') ??
    null
  const hasActiveInvoice = activeInvoice !== null
  const cancelled = r.status === 'CANCELLED'

  return (
    <>
      <PageHeading
        icon="calendar"
        eyebrow="Réservations"
        title={r.customer?.full_name ?? 'Réservation'}
        description={`Chambre ${r.room?.number} · ${r.room?.room_type.label} · ${formatDay(r.period.start_date)} → ${formatDay(r.period.end_date)}`}
        actions={
          <>
            <ReservationStatusBadge status={r.status} label={r.status_label} />
            {can('records.delete') && !local && (
              <button type="button" className="danger" onClick={() => setDialog('delete')}>
                <Icon name="trash" size={17} />
                Supprimer
              </button>
            )}
          </>
        }
      />

      {local && origin?.status === 'rejected' ? (
        <p className="notice departure-warning" role="alert">
          <Icon name="close" size={21} />
          <span>
            <strong>Refusée par le serveur :</strong> {origin.error?.message ?? 'cause inconnue'}{' '}
            <Link to="/synchronisation">Voir dans Synchronisation</Link>
          </span>
        </p>
      ) : local ? (
        <p className="notice notice--info departure-warning" role="status">
          <Icon name="upload" size={21} />
          <span>
            <strong>Gardée sur ce poste, pas encore reçue par le serveur.</strong> Encaissement,
            arrivée, départ, prolongation et annulation restent possibles ; tout part au retour du
            réseau.
          </span>
        </p>
      ) : null}
      {r.departure_overdue && (
        <p className="notice departure-warning" role="status">
          <Icon name="bell" size={21} />
          <span>
            <strong>Départ prévu dépassé.</strong> La chambre reste occupée. Enregistrez le départ
            réel ou prolongez le séjour avec validation du supplément.
          </span>
        </p>
      )}
      <PageOverview
        items={[
          cancelled
            ? {
                label: 'Montant dû',
                value: formatFcfa(r.price.amount_due_fcfa),
                hint: `Réservation annulée · prix initial ${formatFcfa(r.price.net_fcfa)}`,
                icon: 'document',
              }
            : {
                label: 'Montant du séjour',
                value: formatFcfa(r.price.net_fcfa),
                hint: 'Prix enregistré de la réservation',
                icon: 'document',
              },
          {
            label: 'Remise',
            value: formatFcfa(r.price.discount_fcfa),
            hint: 'Réduction enregistrée',
            icon: 'percent',
          },
          {
            label: 'Encaissé net',
            value: can('payments.view')
              ? summary
                ? formatFcfa(summary.net_paid_fcfa)
                : undefined
              : 'Accès limité',
            hint: 'Versements moins remboursements',
            icon: 'wallet',
          },
          {
            label: 'Solde',
            value: can('payments.view')
              ? summary
                ? formatFcfa(summary.balance_fcfa)
                : undefined
              : 'Accès limité',
            hint: 'Situation actuelle du séjour',
            icon: 'cash',
          },
        ]}
      />
      {cancelled && summary && summary.balance_fcfa < 0 && (
        <p className="notice" role="status">
          Réservation annulée avant le remboursement automatique :{' '}
          {formatFcfa(-summary.balance_fcfa)} restent à rendre au client. Remboursez-les depuis les
          reçus ci-dessous.
        </p>
      )}
      <div className="toolbar">
        <Link className="secondary" to="/reservations">
          <Icon name="back" size={17} />
          <span className="sr-only">←</span> Réservations
        </Link>
        {r.status === 'PENDING' && can('reservations.update') && !local && (
          <button type="button" className="primary" onClick={() => setDialog('confirm')}>
            <Icon name="check" size={17} />
            Confirmer la réservation
          </button>
        )}
        {r.status === 'CONFIRMED' &&
          can('reservations.check_in_out') &&
          // Confort uniquement : le serveur refuse de toute façon une arrivée anticipée (409).
          (r.period.start_date <= todayIso() ? (
            <button type="button" className="primary" onClick={() => setDialog('check-in')}>
              <Icon name="login" size={17} />
              Enregistrer l’arrivée
            </button>
          ) : (
            <span className="caption">
              Arrivée enregistrable à partir du {formatDay(r.period.start_date)}
            </span>
          ))}
        {r.status === 'IN_PROGRESS' && can('reservations.check_in_out') && (
          <button type="button" className="primary" onClick={() => setDialog('check-out')}>
            <Icon name="logout" size={17} />
            Enregistrer le départ
          </button>
        )}
        {open && can('reservations.update') && (
          <>
            <button type="button" className="secondary" onClick={() => setDialog('extend')}>
              <Icon name="clock" size={17} />
              Prolonger
            </button>
            {!local && (
              <button type="button" className="secondary" onClick={() => setDialog('occupants')}>
                <Icon name="edit" size={17} />
                Modifier les occupants
              </button>
            )}
          </>
        )}
        {['PENDING', 'CONFIRMED'].includes(r.status) && can('reservations.update') && !local && (
          <button type="button" className="secondary" onClick={() => setDialog('modify')}>
            <Icon name="calendar" size={17} />
            Modifier la réservation
          </button>
        )}
        {summary &&
          summary.balance_fcfa > 0 &&
          r.status !== 'CANCELLED' &&
          can('payments.record') && (
            <button type="button" className="secondary" onClick={() => setDialog('payment')}>
              <Icon name="wallet" size={17} />
              Encaisser
            </button>
          )}
        {!['PENDING', 'CANCELLED'].includes(r.status) &&
          !hasActiveInvoice &&
          !local &&
          can('invoices.issue') && (
            <button type="button" className="secondary" onClick={() => setDialog('invoice')}>
              <Icon name="document" size={17} />
              Émettre une facture
            </button>
          )}
        {['PENDING', 'CONFIRMED'].includes(r.status) && can('reservations.cancel') && (
          <button type="button" className="danger" onClick={() => setDialog('cancel')}>
            <Icon name="close" size={17} />
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
          ) : payments.data ? (
            <LocalTable
              label="encaissements du séjour"
              rows={payments.data.data}
              searchText={(r) =>
                `${r.receipt_number} ${formatDateTime(r.received_at)} ${r.method_label} ${r.cashier.name} ${r.status_label} ${r.amount_fcfa}`
              }
            >
              {(visibleRows) => (
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
                        <th scope="col">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((p) => (
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
                          <td className="num">
                            <PaymentActions
                              payment={{
                                ...p,
                                refundable_fcfa:
                                  p.status === 'VALID' ? p.amount_fcfa - p.refunded_fcfa : 0,
                                has_refunds: p.refunds.length > 0,
                                cashier_id: p.cashier.id,
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </LocalTable>
          ) : (
            <EmptyState title="Aucun encaissement">Le séjour n’a pas encore été réglé.</EmptyState>
          )}
        </Panel>
      )}

      {can('invoices.view') && (
        <Panel title="Factures et avoirs">
          {invoices.data ? (
            <LocalTable
              label="factures du séjour"
              rows={invoices.data}
              searchText={(r) =>
                `${r.number} ${r.type_label} ${r.status_label} ${formatDateTime(r.issued_at)} ${r.net_fcfa}`
              }
            >
              {(visibleRows) => (
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
                      {visibleRows.map((invoice) => (
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
                              label={
                                invoice.type === 'CREDIT_NOTE' ? 'Avoir' : invoice.status_label
                              }
                            />
                          </td>
                          <td className="num">{formatFcfa(invoice.net_fcfa)}</td>
                          <td className="num">
                            <a
                              className="text-button"
                              href={invoicePdfUrl(invoice.id)}
                              target="_blank"
                              rel="noopener"
                            >
                              <Icon name="download" size={17} />
                              PDF A4 ↗
                            </a>
                            <Link
                              className="text-button"
                              to={`/documents/factures/${invoice.id}/ticket`}
                              aria-label={`Ticket 80 mm de ${invoice.type_label.toLowerCase()} ${invoice.number}`}
                            >
                              <Icon name="print" size={17} />
                              Ticket
                            </Link>
                            <a
                              className="text-button"
                              href={invoice.verification_url}
                              target="_blank"
                              rel="noopener"
                            >
                              <Icon name="shield" size={17} />
                              Vérification ↗
                            </a>
                            {invoice.type === 'INVOICE' &&
                              invoice.status === 'ISSUED' &&
                              can('invoices.credit') && (
                                <button
                                  type="button"
                                  className="text-button"
                                  onClick={() => setCrediting(invoice)}
                                  aria-label={`Émettre un avoir pour ${invoice.number}`}
                                >
                                  <Icon name="undo" size={17} />
                                  Avoir
                                </button>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </LocalTable>
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
        {history.data ? (
          <LocalTable
            label="historique du séjour"
            rows={history.data}
            searchText={(r) =>
              `${formatDateTime(r.occurred_at)} ${r.actor?.name ?? 'Système'} ${r.label}`
            }
          >
            {(visibleRows) => (
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
                    {visibleRows.map((entry) => (
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
            )}
          </LocalTable>
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
          collected={can('payments.view') ? summary?.net_paid_fcfa : 0}
          canRefund={can('refunds.create')}
          activeInvoiceNumber={activeInvoice?.number ?? null}
          pending={cancel.isPending}
          onClose={() => setDialog(null)}
          onConfirm={(input) => cancel.mutate(input)}
        />
      )}
      {dialog === 'extend' && (
        <ExtendDialog
          reservation={r}
          activeInvoiceNumber={activeInvoice?.number ?? null}
          onClose={() => setDialog(null)}
          onDone={(invoiceNumber) =>
            done(
              invoiceNumber
                ? `Séjour prolongé · nouvelle facture ${invoiceNumber} (séjour initial et prolongation)`
                : 'Séjour prolongé',
            )
          }
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
      {crediting && <CreditNoteDialog invoice={crediting} onClose={() => setCrediting(null)} />}
      {dialog === 'modify' && (
        <ModifyDialog
          reservation={r}
          activeInvoiceNumber={activeInvoice?.number ?? null}
          onClose={() => setDialog(null)}
          onDone={(invoiceNumber) =>
            done(
              invoiceNumber
                ? `Réservation modifiée · nouvelle facture ${invoiceNumber}`
                : 'Réservation modifiée',
            )
          }
        />
      )}
      {dialog === 'delete' && (
        <DeleteDialog
          title="Supprimer la réservation"
          path={`/api/v1/reservations/${r.id}`}
          onClose={() => setDialog(null)}
          onDeleted={() => {
            for (const key of [['reservations'], ['occupancy'], ['planning'], ['dashboard']]) {
              void queryClient.invalidateQueries({ queryKey: key })
            }
            navigate('/reservations', { replace: true })
          }}
        >
          La réservation de <strong>{r.customer?.full_name ?? 'ce client'}</strong> (chambre{' '}
          {r.room?.number}, {formatDay(r.period.start_date)} → {formatDay(r.period.end_date)}) sera
          supprimée. Seule une réservation sans aucun encaissement ni facture peut l’être ; sinon,
          annulez-la.
        </DeleteDialog>
      )}
    </>
  )
}
