import { LocalTable } from '../../shared/ui/LocalTable'
import { PageOverview } from '../../shared/ui/PageOverview'
import { Icon } from '../../shared/ui/Icon'
import { useIsFetching, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { isConferenceRoom, type InvoiceSummary, type Reservation } from '../../shared/api/types'
import { isLocalId, operationIdOf } from '../../shared/offline/localRefs'
import { outboxQuery, type QueuedOperation } from '../../shared/offline/outbox'
import { Badge, ReservationStatusBadge } from '../../shared/ui/Badge'
import { DeleteDialog } from '../../shared/ui/DeleteDialog'
import { EmptyState, LoadingBlock, PageHeading, Pair, Panel } from '../../shared/ui/layout'
import { useToast } from '../../shared/ui/toastContext'
import { formatDateTime, formatDay, formatFcfa } from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import { PaymentActions, PaymentDialog, paymentsKey, reservationPaymentsQuery } from '../cashier'
import { CreditNoteDialog, reservationInvoicesQuery } from '../invoices'
import { ReservationJourney } from './ReservationJourney'
import {
  cancelReservation,
  checkIn,
  confirmReservation,
  historyQuery,
  reservationKeys,
  reservationQuery,
  type CancellationInput,
} from './api'
import { CheckOutDialog } from './CheckOutDialog'
import { CancelDialog, ConfirmDialog, ExtendDialog, ModifyDialog, OccupantsDialog } from './dialogs'
import { nextOperation, type CompletedStep } from './nextOperation'
import { refreshStay } from './stayRefresh'

type Dialog =
  | 'confirm'
  | 'check-in'
  | 'check-out'
  | 'cancel'
  | 'extend'
  | 'occupants'
  | 'payment'
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
  // Une clé par séjour : en passant à la fiche définitive (réservation reçue par le serveur), les
  // fenêtres et l'enchaînement des étapes repartent de zéro.
  return (
    <ReservationDetail key={reservation.data.id} reservation={reservation.data} origin={origin} />
  )
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
  const location = useLocation()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const [dialog, setDialog] = useState<Dialog>(null)
  // D-071 : opération qui vient d'aboutir ; la fenêtre de la suivante s'ouvre une fois la fiche
  // relue. Une réservation qui arrive de l'assistant enchaîne sur l'arrivée si elle commence ce jour.
  const [chainAfter, setChainAfter] = useState<CompletedStep | null>(() =>
    (location.state as { reservationCreated?: boolean } | null)?.reservationCreated
      ? 'created'
      : null,
  )
  const [crediting, setCrediting] = useState<InvoiceSummary | null>(null)
  const payments = useQuery({ ...reservationPaymentsQuery(r.id), enabled: can('payments.view') })
  const invoices = useQuery({ ...reservationInvoicesQuery(r.id), enabled: can('invoices.view') })
  const history = useQuery(historyQuery(r.id))
  const rereading =
    useIsFetching({ queryKey: reservationKeys.detail(r.id) }) +
    useIsFetching({ queryKey: paymentsKey(r.id) })

  // Annulation, prolongation et départ touchent aussi la caisse et les factures (D-053).
  const refresh = () => refreshStay(queryClient, r.id)
  const done = (message: string) => {
    refresh()
    setDialog(null)
    notify(message)
  }

  const transition = useMutation({
    mutationFn: async (kind: 'confirm' | 'check-in') => {
      if (kind === 'confirm') await confirmReservation(r.id)
      if (kind === 'check-in') await checkIn(r.id)
      return kind
    },
    onSuccess: (kind) => {
      done(kind === 'confirm' ? 'Réservation confirmée' : 'Arrivée enregistrée')
      setChainAfter(kind)
    },
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
  const summaryReady = !can('payments.view') || payments.data !== undefined
  // Ajustement pendant le rendu (et non dans un effet) : dès que la fiche et sa caisse sont
  // relues, la fenêtre de l'opération suivante s'ouvre, une seule fois.
  if (chainAfter && dialog === null && rereading === 0 && summaryReady) {
    const next = nextOperation(chainAfter, r, summary, can)
    setChainAfter(null)
    if (next) setDialog(next)
  }
  const open = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(r.status)
  const activeInvoice =
    invoices.data?.find((invoice) => invoice.type === 'INVOICE' && invoice.status === 'ISSUED') ??
    null
  const cancelled = r.status === 'CANCELLED'
  // D-072 : salle de conférence réservée pour un événement.
  const conference = isConferenceRoom(r.room) || Boolean(r.event)

  return (
    <>
      <PageHeading
        icon="calendar"
        eyebrow="Réservations"
        title={r.event?.name ?? r.customer?.full_name ?? 'Réservation'}
        description={`${conference ? `Salle ${r.room?.number}` : `Chambre ${r.room?.number}`} · ${r.room?.room_type.label} · ${formatDay(r.period.start_date)} → ${formatDay(r.period.end_date)}${r.event && r.customer ? ` · ${r.customer.full_name}` : ''}`}
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
            <strong>Gardée sur ce poste, pas encore reçue par le serveur.</strong> Toutes les
            actions restent possibles, sauf la suppression ; tout part au retour du réseau.
          </span>
        </p>
      ) : null}
      {r.departure_overdue && (
        <p className="notice departure-warning" role="status">
          <Icon name="bell" size={21} />
          <span>
            <strong>{conference ? 'Fin prévue dépassée.' : 'Départ prévu dépassé.'}</strong> La{' '}
            {conference ? 'salle' : 'chambre'} reste occupée. Enregistrez le départ réel ou
            prolongez avec validation du supplément.
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
        {open && can('reservations.update') && (
          <>
            <button type="button" className="secondary" onClick={() => setDialog('extend')}>
              <Icon name="clock" size={17} />
              Prolonger
            </button>
            {!conference && (
              <button type="button" className="secondary" onClick={() => setDialog('occupants')}>
                <Icon name="edit" size={17} />
                Modifier les occupants
              </button>
            )}
          </>
        )}
        {['PENDING', 'CONFIRMED'].includes(r.status) && can('reservations.update') && (
          <button type="button" className="secondary" onClick={() => setDialog('modify')}>
            <Icon name="calendar" size={17} />
            Modifier la réservation
          </button>
        )}
        {['PENDING', 'CONFIRMED'].includes(r.status) && can('reservations.cancel') && (
          <button type="button" className="danger" onClick={() => setDialog('cancel')}>
            <Icon name="close" size={17} />
            Annuler la réservation
          </button>
        )}
      </div>

      <ReservationJourney
        reservation={r}
        summary={summary}
        invoice={activeInvoice}
        invoicePending={invoices.isPending && can('invoices.view')}
        can={can}
        onAction={setDialog}
      />

      <div className="dashboard-grid">
        <Panel title={conference ? 'Informations sur l’événement' : 'Informations sur le séjour'}>
          <div className="panel-body pairs grid-pairs">
            {r.event && (
              <>
                <Pair label="Événement">{r.event.name}</Pair>
                <Pair label="Type d’occupant">{r.event.organizer_type_label}</Pair>
                {r.event.organization_name && (
                  <Pair label="Organisation">{r.event.organization_name}</Pair>
                )}
                {(r.event.contact_name || r.event.contact_phone) && (
                  <Pair label="Responsable sur place">
                    {[r.event.contact_name, r.event.contact_phone].filter(Boolean).join(' · ')}
                  </Pair>
                )}
                {r.customer && <Pair label="Client (réservation)">{r.customer.full_name}</Pair>}
              </>
            )}
            <Pair label={conference ? 'Début' : 'Arrivée'}>
              {formatDay(r.period.start_date)} · {r.period.start_time ?? 'Heure libre'}
            </Pair>
            <Pair label={conference ? 'Fin' : 'Départ'}>
              {formatDay(r.period.end_date)} · {r.period.end_time ?? 'Heure libre'}
            </Pair>
            <Pair label={conference ? 'Salle bloquée' : 'Chambre bloquée'}>
              {formatDateTime(r.period.blocked_from)} → {formatDateTime(r.period.blocked_until)}
            </Pair>
            {!conference && (
              <Pair label="Occupants">
                {(r.occupants ?? []).map((o) => o.name).join(', ') || '—'}
              </Pair>
            )}
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
                            <Link
                              className="text-button"
                              to={`/documents/factures/${invoice.id}/ticket`}
                              aria-label={`Ticket 80 mm de ${invoice.type_label.toLowerCase()} ${invoice.number}`}
                            >
                              <Icon name="print" size={17} />
                              Ticket
                            </Link>
                            {!isLocalId(invoice.id) && (
                              <a
                                className="text-button"
                                href={invoice.verification_url}
                                target="_blank"
                                rel="noopener"
                              >
                                <Icon name="shield" size={17} />
                                Vérification ↗
                              </a>
                            )}
                            {invoice.type === 'INVOICE' &&
                              !isLocalId(invoice.id) &&
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
        <CheckOutDialog
          reservation={r}
          onClose={() => setDialog(null)}
          onDone={() => done('Départ enregistré')}
        />
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
          onPaid={() => setChainAfter('payment')}
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
