import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Icon } from '../../shared/ui/Icon'
import { LoadingBlock, PageHeading } from '../../shared/ui/layout'
import {
  ThermalTicket,
  TicketLines,
  TicketPair,
  TicketPrintLayout,
  TicketRule,
} from '../../shared/ui/ThermalTicket'
import {
  formatFcfa,
  formatNumericDate,
  formatNumericDateTime,
  formatSignedFcfa,
  formatStayMoment,
} from '../../shared/utils/format'
import { invoiceQuery } from './api'

/**
 * Ticket 80 mm d'une facture ou d'un avoir (D-061), construit uniquement depuis l'instantané
 * figé : réimprimer donne toujours les montants de l'émission, jamais les tarifs actuels. Aucune
 * ligne de taxe n'est ajoutée : l'instantané n'en contient pas (règles fiscales en RCA à valider,
 * Q-09 et Q-16). Le PDF A4 avec QR de vérification reste le document de référence.
 */
export function InvoiceTicketPage() {
  const { id = '' } = useParams()
  const invoice = useQuery(invoiceQuery(id))
  const [editedAt] = useState(() => new Date())

  if (invoice.isPending) return <LoadingBlock lines={6} label="Chargement du ticket…" />
  const inv = invoice.data
  if (!inv) {
    return (
      <PageHeading
        icon="print"
        eyebrow="Documents"
        title="Document introuvable"
        actions={
          <Link className="secondary" to="/documents">
            <Icon name="back" size={17} />
            Factures et reçus
          </Link>
        }
      />
    )
  }

  const s = inv.snapshot
  const isCredit = inv.type === 'CREDIT_NOTE'
  const reservationId = s.stay.reservation_uuid
  const methods = [...new Set(s.payments.lines.map((line) => line.method))]

  return (
    <TicketPrintLayout
      eyebrow="Documents"
      title={`Ticket 80 mm ${isCredit ? 'de l’avoir' : 'de la facture'}`}
      description={s.document.number}
      links={[
        { to: '/documents', label: 'Factures et reçus', icon: 'back' },
        ...(reservationId
          ? [
              {
                to: `/reservations/${reservationId}`,
                label: 'Ouvrir la réservation',
                icon: 'eye' as const,
              },
            ]
          : []),
      ]}
    >
      {(width) => (
        <ThermalTicket
          label={`Ticket ${s.document.label.toLowerCase()} ${s.document.number}`}
          hotel={s.hotel}
          title={s.document.label}
          stamp={!isCredit && inv.status === 'CREDITED' ? 'Annulée par avoir' : null}
          width={width}
          footer={
            <>
              <p className="ticket-note">
                {isCredit
                  ? 'Cet avoir corrige le document référencé ci-dessus. Il ne constitue pas un remboursement.'
                  : 'Document figé à sa date d’émission ; toute correction fait l’objet d’un avoir.'}
              </p>
              <p className="ticket-note">
                Document de référence : {isCredit ? 'avoir' : 'facture'} A4 avec QR code de
                vérification.
              </p>
              {!isCredit && <p>Merci pour votre séjour !</p>}
              <p className="ticket-note">Édité le {formatNumericDateTime(editedAt)}</p>
            </>
          }
        >
          <TicketPair label="N°">{s.document.number}</TicketPair>
          <TicketPair label="Date">{formatNumericDateTime(s.document.issued_at)}</TicketPair>
          {s.issued_by && <TicketPair label="Émis par">{s.issued_by.name}</TicketPair>}
          {isCredit && s.credit && (
            <p className="ticket-note" role="note">
              Annule la facture n° {s.credit.credited_invoice_number} du{' '}
              {formatNumericDate(s.credit.credited_invoice_issued_at)}. Motif : {s.credit.reason}
            </p>
          )}
          {!isCredit && s.replaces?.invoice_number && (
            <p className="ticket-note" role="note">
              Remplace la facture n° {s.replaces.invoice_number}
              {s.replaces.reason ? ` — ${s.replaces.reason}` : ''}
            </p>
          )}
          <TicketRule />
          <TicketPair label="Client">{s.customer?.full_name ?? '—'}</TicketPair>
          <TicketPair label="Chambre">
            {s.room ? `${s.room.number}${s.room.type ? ` (${s.room.type})` : ''}` : '—'}
          </TicketPair>
          <TicketPair label="Arrivée">
            {formatStayMoment(s.stay.start_date, s.stay.start_time)}
          </TicketPair>
          <TicketPair label="Départ">
            {formatStayMoment(s.stay.end_date, s.stay.end_time)}
          </TicketPair>
          <TicketRule />
          <TicketLines
            lines={s.lines.map((line, index) => ({
              key: `${index}-${line.kind}`,
              label: line.label,
              quantity: line.quantity,
              unitPriceFcfa: line.unit_price_fcfa,
              amountFcfa: line.amount_fcfa,
            }))}
          />
          <TicketRule />
          <TicketPair label="Sous-total" amount>
            {formatFcfa(s.totals.gross_fcfa)}
          </TicketPair>
          {s.totals.discount_fcfa > 0 && (
            <TicketPair
              label={`Remise${s.totals.discount_label ? ` (${s.totals.discount_label})` : ''}`}
              amount
            >
              {formatSignedFcfa(-s.totals.discount_fcfa)}
            </TicketPair>
          )}
          {s.totals.discount_reason && (
            <p className="ticket-note">Motif de la remise : {s.totals.discount_reason}</p>
          )}
          <TicketPair label={isCredit ? 'Montant de l’avoir' : 'Net à payer'} amount strong>
            {formatFcfa(s.totals.net_fcfa)}
          </TicketPair>
          {!isCredit && (
            <>
              <TicketRule />
              <p className="ticket-section-title">Versements à la date d’émission</p>
              {s.payments.lines.length === 0 && <p className="ticket-note">Aucun versement.</p>}
              {s.payments.lines.map((line) => (
                <TicketPair
                  key={line.receipt_number}
                  label={`${line.receipt_number} · ${formatNumericDate(line.received_at)}`}
                  amount
                >
                  {formatFcfa(line.amount_fcfa - line.refunded_fcfa)}
                </TicketPair>
              ))}
              <TicketPair label="Déjà réglé (net)" amount>
                {formatFcfa(s.payments.net_paid_fcfa)}
              </TicketPair>
              <TicketPair label="Reste dû" amount strong>
                {formatFcfa(Math.max(0, s.payments.balance_fcfa))}
              </TicketPair>
              {methods.length > 0 && (
                <TicketPair label="Mode de paiement">{methods.join(', ')}</TicketPair>
              )}
            </>
          )}
        </ThermalTicket>
      )}
    </TicketPrintLayout>
  )
}
