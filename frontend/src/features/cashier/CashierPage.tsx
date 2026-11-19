import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import type { CashMovement, Receivable } from '../../shared/api/types'
import { Badge, ReservationStatusBadge } from '../../shared/ui/Badge'
import { SelectField, TextField } from '../../shared/ui/fields'
import { EmptyState, LoadingBlock, Metric, PageHeading, Panel } from '../../shared/ui/layout'
import {
  addDays,
  formatDateTime,
  formatDay,
  formatFcfa,
  formatSignedFcfa,
  todayIso,
} from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import { cashJournalQuery, receivablesQuery } from './api'
import { PaymentActions } from './PaymentActions'
import { PaymentDialog } from './PaymentDialog'

function periodLabel(from: string, to: string): string {
  return from === to ? `le ${formatDay(from)}` : `du ${formatDay(from)} au ${formatDay(to)}`
}

/**
 * Caisse : journal d'une période (encaissé, remboursé, net), ventilé par moyen de paiement et par
 * agent, mouvements détaillés et soldes restant à encaisser. Mêmes définitions que le tableau de
 * bord (D-040, D-041).
 */
export function CashierPage() {
  const { can } = useCurrentUser()
  const today = todayIso()
  const [period, setPeriod] = useState({ from: today, to: today })
  const [agentId, setAgentId] = useState('')
  const [paying, setPaying] = useState<Receivable | null>(null)

  const all = useQuery(cashJournalQuery(period.from, period.to, ''))
  const filtered = useQuery({
    ...cashJournalQuery(period.from, period.to, agentId),
    enabled: agentId !== '',
  })
  const journal = agentId ? filtered : all
  const receivables = useQuery(receivablesQuery)
  const data = journal.data
  const quick: [string, { from: string; to: string }][] = [
    ['Aujourd’hui', { from: today, to: today }],
    ['Hier', { from: addDays(today, -1), to: addDays(today, -1) }],
    ['7 derniers jours', { from: addDays(today, -6), to: today }],
    ['Ce mois', { from: `${today.slice(0, 8)}01`, to: today }],
  ]

  return (
    <>
      <PageHeading
        eyebrow="Finances"
        title="Caisse"
        description={`Mouvements de caisse ${periodLabel(period.from, period.to)}.`}
        actions={
          <button type="button" className="secondary" onClick={() => window.print()}>
            Imprimer le journal
          </button>
        }
      />

      <div className="filterbar" style={{ padding: '0 0 14px' }}>
        <div className="segmented" role="group" aria-label="Période rapide">
          {quick.map(([label, value]) => (
            <button
              key={label}
              type="button"
              aria-pressed={period.from === value.from && period.to === value.to}
              onClick={() => setPeriod(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <TextField
          label="Du"
          type="date"
          value={period.from}
          max={today}
          onChange={(e) => e.target.value && setPeriod({ from: e.target.value, to: period.to })}
        />
        <TextField
          label="Au"
          type="date"
          value={period.to}
          min={period.from}
          max={today}
          onChange={(e) => e.target.value && setPeriod({ from: period.from, to: e.target.value })}
        />
        <SelectField label="Agent" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          <option value="">Tous les agents</option>
          {all.data?.by_agent.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.label}
            </option>
          ))}
        </SelectField>
      </div>

      {!data ? (
        <LoadingBlock lines={5} label="Chargement du journal de caisse…" />
      ) : (
        <>
          <section className="metrics" aria-label="Totaux de la période">
            <Metric
              label="Encaissé"
              value={formatFcfa(data.totals.collected_fcfa)}
              hint={`${data.totals.payments_count} versement(s) valide(s)`}
              icon="cash"
            />
            <Metric
              label="Remboursé"
              value={formatFcfa(data.totals.refunded_fcfa)}
              hint={`${data.totals.refunds_count} remboursement(s)`}
              icon="arrow"
            />
            <Metric
              label="Net en caisse"
              value={formatFcfa(data.totals.net_fcfa)}
              hint="Encaissé − remboursé"
              icon="chart"
            />
            <Metric
              label="Annulés"
              value={formatFcfa(data.totals.cancelled_fcfa)}
              hint="Listés pour mémoire, non comptés"
              icon="document"
            />
          </section>

          <div className="dashboard-grid">
            <Panel title="Par moyen de paiement">
              <Breakdown rows={data.by_method} />
            </Panel>
            <Panel title="Par agent" subtitle="Encaissements reçus et remboursements effectués">
              <Breakdown rows={data.by_agent} />
            </Panel>
          </div>

          <Panel
            title="Mouvements"
            subtitle="Encaissements et remboursements, dans l’ordre chronologique"
            action={<Badge tone="green" label={`${data.movements.length} mouvement(s)`} />}
          >
            <Movements rows={data.movements} />
          </Panel>
        </>
      )}

      <Panel
        title="Soldes à encaisser"
        subtitle="Séjours non annulés dont le montant n’est pas entièrement réglé"
        action={
          receivables.data && (
            <Badge tone="amber" label={`Total ${formatFcfa(receivables.data.total_fcfa)}`} />
          )
        }
      >
        {receivables.isPending ? (
          <LoadingBlock lines={2} />
        ) : receivables.data && receivables.data.data.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Chambre</th>
                  <th scope="col">Séjour</th>
                  <th scope="col">Statut</th>
                  <th scope="col" className="num">
                    Montant net
                  </th>
                  <th scope="col" className="num">
                    Encaissé
                  </th>
                  <th scope="col" className="num">
                    Solde
                  </th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {receivables.data.data.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.customer}</strong>
                      {row.phone && <small style={{ display: 'block' }}>{row.phone}</small>}
                    </td>
                    <td>
                      {row.room.number} <small>{row.room.type}</small>
                    </td>
                    <td>
                      {formatDay(row.start_date)} → {formatDay(row.end_date)}
                    </td>
                    <td>
                      <ReservationStatusBadge status={row.status} label={row.status_label} />
                    </td>
                    <td className="num">{formatFcfa(row.net_fcfa)}</td>
                    <td className="num">{formatFcfa(row.paid_net_fcfa)}</td>
                    <td className="num">
                      <strong>{formatFcfa(row.balance_fcfa)}</strong>
                    </td>
                    <td className="num compact-actions">
                      {can('payments.record') && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setPaying(row)}
                          aria-label={`Encaisser le séjour de ${row.customer}`}
                        >
                          Encaisser
                        </button>
                      )}
                      <Link className="text-button" to={`/reservations/${row.id}`}>
                        Ouvrir →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Aucun solde en attente">
            Tous les séjours en cours sont réglés.
          </EmptyState>
        )}
      </Panel>

      {paying && (
        <PaymentDialog
          reservationId={paying.id}
          balance={paying.balance_fcfa}
          onClose={() => setPaying(null)}
        />
      )}
    </>
  )
}

function Breakdown({
  rows,
}: {
  rows: { label: string; collected_fcfa: number; refunded_fcfa: number; net_fcfa: number }[]
}) {
  if (rows.length === 0)
    return <EmptyState title="Aucun mouvement">Rien sur cette période.</EmptyState>
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Libellé</th>
            <th scope="col" className="num">
              Encaissé
            </th>
            <th scope="col" className="num">
              Remboursé
            </th>
            <th scope="col" className="num">
              Net
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td className="num">{formatFcfa(row.collected_fcfa)}</td>
              <td className="num">{formatFcfa(row.refunded_fcfa)}</td>
              <td className="num">
                <strong>{formatSignedFcfa(row.net_fcfa)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Movements({ rows }: { rows: CashMovement[] }) {
  if (rows.length === 0)
    return (
      <EmptyState title="Aucun mouvement">
        Aucun encaissement ni remboursement sur cette période.
      </EmptyState>
    )
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Date et heure</th>
            <th scope="col">Opération</th>
            <th scope="col">Reçu</th>
            <th scope="col">Client et chambre</th>
            <th scope="col">Moyen</th>
            <th scope="col">Agent</th>
            <th scope="col" className="num">
              Montant
            </th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.type}-${row.id}`}>
              <td>{formatDateTime(row.at)}</td>
              <td>
                {row.type === 'REFUND' ? (
                  <Badge tone="amber" label="Remboursement" />
                ) : row.counted ? (
                  <Badge tone="green" label="Encaissement" />
                ) : (
                  <Badge tone="red" label="Annulé" />
                )}
                {row.reason && <small style={{ display: 'block' }}>{row.reason}</small>}
              </td>
              <td>{row.receipt_number}</td>
              <td>
                {row.reservation ? (
                  <Link className="text-button" to={`/reservations/${row.reservation.id}`}>
                    {row.customer?.full_name ?? 'Séjour'}
                  </Link>
                ) : (
                  '—'
                )}
                {row.room && <small style={{ display: 'block' }}>Chambre {row.room.number}</small>}
              </td>
              <td>{row.method_label}</td>
              <td>{row.agent.name}</td>
              <td className={`num${row.signed_amount_fcfa < 0 ? ' amount-out' : ''}`}>
                {row.counted ? (
                  formatSignedFcfa(row.signed_amount_fcfa)
                ) : (
                  <s aria-label={`${formatFcfa(row.amount_fcfa)}, non compté`}>
                    {formatFcfa(row.amount_fcfa)}
                  </s>
                )}
              </td>
              <td className="num">
                {row.type === 'PAYMENT' && (
                  <PaymentActions
                    payment={{
                      id: row.payment_id,
                      receipt_number: row.receipt_number,
                      amount_fcfa: row.amount_fcfa,
                      status: row.status,
                      method_label: row.method_label,
                      refundable_fcfa: row.refundable_fcfa,
                      has_refunds: row.has_refunds,
                    }}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
