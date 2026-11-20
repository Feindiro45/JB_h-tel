import { PageOverview } from '../../shared/ui/PageOverview'
import { useAutoFilters } from '../../shared/ui/useAutoFilters'
import { AutoFilterStatus } from '../../shared/ui/AutoFilterStatus'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { cashAgentsQuery } from '../../shared/api/lookups'
import { Badge } from '../../shared/ui/Badge'
import { SelectField, TextField } from '../../shared/ui/fields'
import { EmptyState, LoadingBlock, Panel } from '../../shared/ui/layout'
import { Pagination } from '../../shared/ui/Pagination'
import { formatDateTime, formatFcfa } from '../../shared/utils/format'
import { PAYMENT_METHODS, paymentsListQuery, type PaymentFilters } from './api'
import { PaymentActions } from './PaymentActions'

/** Liste de tous les reçus (un par versement), filtrable, avec impression et actions de caisse. */
export function ReceiptsPanel() {
  const { filters, draft, change, pending, valid } = useAutoFilters<PaymentFilters>({
    page: 1,
    per_page: 25,
  })
  const agents = useQuery(cashAgentsQuery)
  const list = useQuery(paymentsListQuery(filters))
  const rows = list.data?.data ?? []

  return (
    <>
      <PageOverview
        items={[
          {
            label: 'Reçus',
            value: list.data?.meta.total,
            hint: 'Ensemble des résultats filtrés',
            icon: 'document',
          },
          {
            label: 'Versements valides',
            value: list.data ? rows.filter((r) => r.status === 'VALID').length : undefined,
            hint: 'Sur la page affichée',
            icon: 'check',
          },
          {
            label: 'Annulés',
            value: list.data ? rows.filter((r) => r.status === 'CANCELLED').length : undefined,
            hint: 'Sur la page affichée',
            icon: 'undo',
          },
          {
            label: 'Montant des reçus',
            value: list.data
              ? formatFcfa(
                  rows.filter((r) => r.status === 'VALID').reduce((n, r) => n + r.amount_fcfa, 0),
                )
              : undefined,
            hint: 'Reçus valides de cette page, avant remboursements',
            icon: 'cash',
          },
        ]}
      />
      <form
        className="filterbar"
        onSubmit={(e) => e.preventDefault()}
        aria-label="Filtrer les reçus"
      >
        <TextField
          label="Recherche"
          type="search"
          placeholder="N° de reçu, référence ou client"
          value={draft.search ?? ''}
          onChange={(e) => change({ search: e.target.value || undefined }, true)}
        />
        <SelectField
          label="Moyen"
          value={draft.method ?? ''}
          onChange={(e) => change({ method: e.target.value || undefined })}
        >
          <option value="">Tous</option>
          {PAYMENT_METHODS.map((method) => (
            <option key={method.value} value={method.value}>
              {method.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="État"
          value={draft.status ?? ''}
          onChange={(e) => change({ status: e.target.value || undefined })}
        >
          <option value="">Tous</option>
          <option value="VALID">Validé</option>
          <option value="CANCELLED">Annulé</option>
        </SelectField>
        <SelectField
          label="Agent"
          value={draft.agent_id ?? ''}
          onChange={(e) => change({ agent_id: e.target.value })}
        >
          <option value="">Tous</option>
          {agents.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Du"
          type="date"
          value={draft.from ?? ''}
          onChange={(e) => change({ from: e.target.value || undefined })}
        />
        <TextField
          label="Au"
          type="date"
          value={draft.to ?? ''}
          onChange={(e) => change({ to: e.target.value || undefined })}
        />
        <AutoFilterStatus pending={pending} valid={valid} />
      </form>
      <Panel
        title={`Reçus de paiement${list.data?.meta ? ` (${list.data.meta.total})` : ''}`}
        subtitle="Un reçu numéroté par versement"
      >
        {list.isPending ? (
          <LoadingBlock />
        ) : rows.length === 0 ? (
          <EmptyState title="Aucun reçu">
            Aucun encaissement ne correspond à ces critères.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Reçu</th>
                  <th scope="col">Date</th>
                  <th scope="col">Client et chambre</th>
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
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.receipt_number}</strong>
                      {p.reference && <small style={{ display: 'block' }}>{p.reference}</small>}
                    </td>
                    <td>{formatDateTime(p.received_at)}</td>
                    <td>
                      {p.reservation ? (
                        <Link className="text-button" to={`/reservations/${p.reservation.id}`}>
                          {p.customer?.full_name ?? 'Séjour'}
                        </Link>
                      ) : (
                        '—'
                      )}
                      {p.room && (
                        <small style={{ display: 'block' }}>Chambre {p.room.number}</small>
                      )}
                    </td>
                    <td>{p.method_label}</td>
                    <td>{p.cashier.name}</td>
                    <td>
                      <Badge tone={p.status === 'VALID' ? 'green' : 'red'} label={p.status_label} />
                      {p.refunded_fcfa > 0 && (
                        <small style={{ display: 'block' }}>
                          remboursé {formatFcfa(p.refunded_fcfa)}
                        </small>
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
        <Pagination
          meta={list.data?.meta}
          onPage={(page) => change({ page })}
          perPage={filters.per_page}
          onPerPage={(per_page) => change({ per_page })}
        />
      </Panel>
    </>
  )
}
