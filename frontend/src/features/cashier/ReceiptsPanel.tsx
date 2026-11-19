import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Badge } from '../../shared/ui/Badge'
import { SelectField, TextField } from '../../shared/ui/fields'
import { EmptyState, LoadingBlock } from '../../shared/ui/layout'
import { Pagination } from '../../shared/ui/Pagination'
import { formatDateTime, formatFcfa } from '../../shared/utils/format'
import { PAYMENT_METHODS, paymentsListQuery, type PaymentFilters } from './api'
import { PaymentActions } from './PaymentActions'

/** Liste de tous les reçus (un par versement), filtrable, avec impression et actions de caisse. */
export function ReceiptsPanel() {
  const [filters, setFilters] = useState<PaymentFilters>({ page: 1 })
  const [draft, setDraft] = useState<PaymentFilters>({})
  const list = useQuery(paymentsListQuery(filters))
  const rows = list.data?.data ?? []

  function apply(event: FormEvent) {
    event.preventDefault()
    setFilters({ ...draft, page: 1 })
  }

  return (
    <>
      <form className="filterbar" onSubmit={apply} aria-label="Filtrer les reçus">
        <TextField
          label="Recherche"
          type="search"
          placeholder="N° de reçu ou référence"
          value={draft.search ?? ''}
          onChange={(e) => setDraft({ ...draft, search: e.target.value || undefined })}
        />
        <SelectField
          label="Moyen"
          value={draft.method ?? ''}
          onChange={(e) => setDraft({ ...draft, method: e.target.value || undefined })}
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
          onChange={(e) => setDraft({ ...draft, status: e.target.value || undefined })}
        >
          <option value="">Tous</option>
          <option value="VALID">Validé</option>
          <option value="CANCELLED">Annulé</option>
        </SelectField>
        <TextField
          label="Du"
          type="date"
          value={draft.from ?? ''}
          onChange={(e) => setDraft({ ...draft, from: e.target.value || undefined })}
        />
        <TextField
          label="Au"
          type="date"
          value={draft.to ?? ''}
          onChange={(e) => setDraft({ ...draft, to: e.target.value || undefined })}
        />
        <button type="submit" className="secondary">
          Filtrer
        </button>
      </form>
      {list.isPending ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <EmptyState title="Aucun reçu">Aucun encaissement ne correspond à ces critères.</EmptyState>
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
                    {p.room && <small style={{ display: 'block' }}>Chambre {p.room.number}</small>}
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
                        refundable_fcfa: p.status === 'VALID' ? p.amount_fcfa - p.refunded_fcfa : 0,
                        has_refunds: p.refunds.length > 0,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination meta={list.data?.meta} onPage={(page) => setFilters({ ...filters, page })} />
    </>
  )
}
