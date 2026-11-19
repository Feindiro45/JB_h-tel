import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { Badge } from '../../shared/ui/Badge'
import { LoadingBlock, PageHeading, Pair } from '../../shared/ui/layout'
import { formatDateTime, formatFcfa } from '../../shared/utils/format'
import { receiptQuery } from './api'

/**
 * Reçu de paiement imprimable (A4, CSS d'impression) : un reçu par versement (cahier des
 * charges). Le serveur fournit l'en-tête de l'hôtel et la situation du séjour au moment de la
 * consultation (D-041).
 */
export function ReceiptPage() {
  const { id = '' } = useParams()
  const receipt = useQuery(receiptQuery(id))

  if (receipt.isPending) return <LoadingBlock lines={6} label="Chargement du reçu…" />
  const r = receipt.data
  if (!r) {
    return (
      <PageHeading
        eyebrow="Documents"
        title="Reçu introuvable"
        actions={
          <Link className="secondary" to="/documents?onglet=recus">
            ← Factures et reçus
          </Link>
        }
      />
    )
  }

  const hotel = r.hotel
  const legal = [
    hotel.tax_id && `NIF ${hotel.tax_id}`,
    hotel.trade_register && `RCCM ${hotel.trade_register}`,
  ].filter(Boolean)

  return (
    <div className="print-only-paper">
      <PageHeading
        eyebrow="Documents"
        title="Reçu de paiement"
        description={r.receipt_number}
        actions={
          <button type="button" className="primary" onClick={() => window.print()}>
            Imprimer / PDF
          </button>
        }
      />
      <div className="toolbar">
        <Link className="secondary" to="/documents?onglet=recus">
          ← Factures et reçus
        </Link>
        <Link className="secondary" to={`/reservations/${r.reservation.id}`}>
          Ouvrir la réservation
        </Link>
      </div>

      <article className="paper panel" aria-label={`Reçu ${r.receipt_number}`}>
        <header>
          <div>
            <b className="seal" aria-hidden="true">
              JB
            </b>
            <h2>{hotel.name ?? 'JB Hôtel'}</h2>
            {[hotel.address, hotel.city, hotel.phone, hotel.email].filter(Boolean).map((line) => (
              <p key={line}>{line}</p>
            ))}
            {legal.length > 0 && <p>{legal.join(' · ')}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <h2>Reçu de paiement</h2>
            <strong>{r.receipt_number}</strong>
            <p>{formatDateTime(r.received_at)}</p>
            {r.status !== 'VALID' && <Badge tone="red" label={r.status_label} />}
          </div>
        </header>

        <div className="paper-client">
          <Pair label="Client">{r.customer?.full_name ?? '—'}</Pair>
          <Pair label="Chambre">{r.room ? `${r.room.number} · ${r.room.room_type}` : '—'}</Pair>
          <Pair label="Séjour">{r.reservation.status_label}</Pair>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Moyen de paiement</th>
                <th scope="col">Référence</th>
                <th scope="col">Reçu par</th>
                <th scope="col" className="num">
                  Montant
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{r.method_label}</td>
                <td>{r.reference ?? '—'}</td>
                <td>{r.cashier.name}</td>
                <td className="num">
                  <strong>{formatFcfa(r.amount_fcfa)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {r.status !== 'VALID' && (
          <p className="notice" role="note" style={{ marginTop: 14 }}>
            Encaissement annulé
            {r.cancelled_at ? ` le ${formatDateTime(r.cancelled_at)}` : ''}
            {r.cancellation_reason ? ` — motif : ${r.cancellation_reason}` : ''}. Ce reçu n’a plus
            de valeur de paiement.
          </p>
        )}

        {r.refunds.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table>
              <caption style={{ textAlign: 'left', fontWeight: 700, padding: '6px 0' }}>
                Remboursements sur ce versement
              </caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Motif</th>
                  <th scope="col">Traité par</th>
                  <th scope="col" className="num">
                    Montant
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.refunds.map((refund) => (
                  <tr key={refund.id}>
                    <td>{formatDateTime(refund.processed_at)}</td>
                    <td>{refund.reason}</td>
                    <td>{refund.processed_by.name}</td>
                    <td className="num">− {formatFcfa(refund.amount_fcfa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="paper-total">
          <Pair label="Montant du reçu">{formatFcfa(r.amount_fcfa)}</Pair>
          {r.refunded_fcfa > 0 && <Pair label="Remboursé">− {formatFcfa(r.refunded_fcfa)}</Pair>}
          <Pair label={`Situation du séjour au ${formatDateTime(r.summary_at)}`}>
            {formatFcfa(r.summary.net_paid_fcfa)} réglés sur {formatFcfa(r.summary.amount_due_fcfa)}
          </Pair>
          <Pair label="Reste à payer">{formatFcfa(Math.max(0, r.summary.balance_fcfa))}</Pair>
        </div>

        <footer>
          Reçu émis par {hotel.name ?? 'JB Hôtel'}. Il atteste du versement ci-dessus ; la facture
          du séjour est remise séparément.
        </footer>
      </article>
    </div>
  )
}
