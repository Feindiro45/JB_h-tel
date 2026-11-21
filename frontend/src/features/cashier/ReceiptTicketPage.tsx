import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Icon } from '../../shared/ui/Icon'
import { LoadingBlock, PageHeading } from '../../shared/ui/layout'
import {
  ThermalTicket,
  TicketPair,
  TicketPrintLayout,
  TicketRule,
} from '../../shared/ui/ThermalTicket'
import {
  formatFcfa,
  formatNumericDateTime,
  formatSignedFcfa,
  formatStayMoment,
} from '../../shared/utils/format'
import { receiptQuery } from './api'

/**
 * Ticket 80 mm d'un versement (D-061) : mêmes données que le reçu A4, situation du séjour au
 * moment de l'édition. Jamais « payé » tant qu'un reste dû subsiste.
 */
export function ReceiptTicketPage() {
  const { id = '' } = useParams()
  const receipt = useQuery(receiptQuery(id))
  const [editedAt] = useState(() => new Date())

  if (receipt.isPending) return <LoadingBlock lines={6} label="Chargement du ticket…" />
  const r = receipt.data
  if (!r) {
    return (
      <PageHeading
        icon="print"
        eyebrow="Documents"
        title="Reçu introuvable"
        actions={
          <Link className="secondary" to="/documents?onglet=recus">
            <Icon name="back" size={17} />
            Factures et reçus
          </Link>
        }
      />
    )
  }

  const cancelled = r.status !== 'VALID'
  // Encaissement fait hors ligne (lot 4, N-03) : numéro provisoire jusqu'à l'accusé du serveur.
  const provisional = r.receipt_number.startsWith('LOC-')
  const summary = r.summary
  const balance = summary.balance_fcfa

  return (
    <TicketPrintLayout
      eyebrow="Documents"
      title="Ticket 80 mm du reçu"
      description={r.receipt_number}
      links={[
        { to: `/documents/recus/${r.id}`, label: 'Reçu A4', icon: 'document' },
        { to: `/reservations/${r.reservation.id}`, label: 'Ouvrir la réservation', icon: 'eye' },
      ]}
    >
      {(width) => (
        <ThermalTicket
          label={`Ticket du reçu ${r.receipt_number}`}
          hotel={r.hotel}
          title="Reçu de paiement"
          stamp={cancelled ? 'Annulé' : provisional ? 'Provisoire' : null}
          width={width}
          footer={
            <>
              {provisional && (
                <p className="ticket-note" role="note">
                  Reçu émis hors ligne : numéro provisoire. Le numéro définitif est attribué par le
                  serveur au retour du réseau (D-064).
                </p>
              )}
              <p className="ticket-note">
                Ce reçu atteste du versement ci-dessus. La facture du séjour est remise séparément.
              </p>
              <p>Merci de votre visite !</p>
              <p className="ticket-note">Édité le {formatNumericDateTime(editedAt)}</p>
            </>
          }
        >
          <TicketPair label="N°">{r.receipt_number}</TicketPair>
          <TicketPair label="Date">{formatNumericDateTime(r.received_at)}</TicketPair>
          <TicketPair label="Reçu par">{r.cashier.name}</TicketPair>
          <TicketRule />
          <TicketPair label="Client">{r.customer?.full_name ?? '—'}</TicketPair>
          <TicketPair label="Chambre">
            {r.room ? `${r.room.number} (${r.room.room_type})` : '—'}
          </TicketPair>
          {r.stay && (
            <>
              <TicketPair label="Arrivée">
                {formatStayMoment(r.stay.start_date, r.stay.start_time)}
              </TicketPair>
              <TicketPair label="Départ">
                {formatStayMoment(r.stay.end_date, r.stay.end_time)}
              </TicketPair>
              <TicketPair label="Durée">
                {r.stay.quantity} × {r.stay.billing_unit_label.toLowerCase()}
              </TicketPair>
            </>
          )}
          <TicketRule />
          <TicketPair label="Versement" amount strong>
            {formatFcfa(r.amount_fcfa)}
          </TicketPair>
          <TicketPair label="Mode de paiement">{r.method_label}</TicketPair>
          {r.reference && <TicketPair label="Référence">{r.reference}</TicketPair>}
          {r.refunds.map((refund) => (
            <TicketPair
              key={refund.id}
              label={`Remboursé le ${formatNumericDateTime(refund.processed_at)}`}
              amount
            >
              {formatSignedFcfa(-refund.amount_fcfa)}
            </TicketPair>
          ))}
          {cancelled && (
            <p className="ticket-note" role="note">
              Encaissement annulé
              {r.cancelled_at ? ` le ${formatNumericDateTime(r.cancelled_at)}` : ''}
              {r.cancellation_reason ? ` — motif : ${r.cancellation_reason}` : ''}. Ce reçu n’a plus
              de valeur de paiement.
            </p>
          )}
          <TicketRule />
          <p className="ticket-section-title">
            Situation du séjour au {formatNumericDateTime(r.summary_at)}
          </p>
          <TicketPair label="Total du séjour" amount>
            {formatFcfa(summary.amount_due_fcfa)}
          </TicketPair>
          <TicketPair label="Déjà réglé (net)" amount>
            {formatFcfa(summary.net_paid_fcfa)}
          </TicketPair>
          <TicketPair label="Reste dû" amount strong>
            {formatFcfa(Math.max(0, balance))}
          </TicketPair>
          {balance < 0 && (
            <TicketPair label="À rendre au client" amount>
              {formatFcfa(-balance)}
            </TicketPair>
          )}
          <TicketPair label="Statut">
            {balance > 0 && summary.status === 'PAID' ? 'Solde restant dû' : summary.status_label}
          </TicketPair>
        </ThermalTicket>
      )}
    </TicketPrintLayout>
  )
}
