import { PageOverview } from '../../shared/ui/PageOverview'
import { useAutoFilters } from '../../shared/ui/useAutoFilters'
import { AutoFilterStatus } from '../../shared/ui/AutoFilterStatus'
import { Icon } from '../../shared/ui/Icon'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Badge } from '../../shared/ui/Badge'
import { TextField } from '../../shared/ui/fields'
import { EmptyState, LoadingBlock, PageHeading, Panel } from '../../shared/ui/layout'
import { Pagination } from '../../shared/ui/Pagination'
import { formatDate, initials } from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import { customersQuery } from './api'
import { CustomerFormDialog } from './CustomerFormDialog'

export function CustomersPage() {
  const { can } = useCurrentUser()
  const navigate = useNavigate()
  const { draft, filters, change, reset, pending, valid } = useAutoFilters({
    search: '',
    email: '',
    origin_city: '',
    origin_country: '',
    page: 1,
    per_page: 25,
  })
  const { search, page, per_page: perPage, ...extra } = filters
  const [creating, setCreating] = useState(false)
  const list = useQuery(customersQuery(search, page, perPage, extra))
  const rows = list.data?.data ?? []
  const meta = list.data?.meta

  return (
    <>
      <PageHeading
        icon="people"
        eyebrow="Exploitation"
        title="Clients"
        description="Retrouvez un client par son nom, son téléphone ou son e-mail."
        actions={
          can('customers.manage') && (
            <button type="button" className="primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={17} />
              <span className="sr-only">+</span> Nouveau client
            </button>
          )
        }
      />
      <PageOverview
        items={[
          {
            label: 'Clients',
            value: meta?.total,
            hint: 'Ensemble des résultats filtrés',
            icon: 'people',
          },
          {
            label: 'Avec téléphone',
            value: list.data ? rows.filter((c) => c.phone).length : undefined,
            hint: 'Clients de la page affichée',
            icon: 'phone',
          },
          {
            label: 'Avec e-mail',
            value: list.data ? rows.filter((c) => c.email).length : undefined,
            hint: 'Clients de la page affichée',
            icon: 'mail',
          },
          {
            label: 'Pays représentés',
            value: list.data
              ? new Set(rows.map((c) => c.origin_country?.trim().toLowerCase()).filter(Boolean))
                  .size
              : undefined,
            hint: 'Provenances renseignées sur cette page',
            icon: 'globe',
          },
        ]}
      />
      <Panel
        title="Répertoire"
        action={
          meta && <Badge tone="green" label={`${meta.total} client${meta.total > 1 ? 's' : ''}`} />
        }
      >
        <form
          className="filterbar"
          onSubmit={(e) => e.preventDefault()}
          role="search"
          aria-label="Rechercher un client"
        >
          <TextField
            label="Recherche"
            type="search"
            placeholder="Nom, téléphone ou e-mail"
            value={draft.search}
            onChange={(e) => change({ search: e.target.value }, true)}
          />
          <TextField
            label="E-mail"
            type="search"
            value={draft.email}
            onChange={(e) => change({ email: e.target.value }, true)}
          />
          <TextField
            label="Ville"
            value={draft.origin_city}
            onChange={(e) => change({ origin_city: e.target.value }, true)}
          />
          <TextField
            label="Pays"
            value={draft.origin_country}
            onChange={(e) => change({ origin_country: e.target.value }, true)}
          />
          <AutoFilterStatus pending={pending} valid={valid} />
          {[draft.search, draft.email, draft.origin_city, draft.origin_country].some(Boolean) && (
            <button type="button" className="text-button" onClick={reset}>
              <Icon name="close" size={17} />
              Effacer
            </button>
          )}
        </form>
        {list.isPending ? (
          <LoadingBlock />
        ) : rows.length === 0 ? (
          <EmptyState title="Aucun client">
            {search
              ? 'Aucun client ne correspond à cette recherche.'
              : 'Aucun client enregistré pour le moment.'}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">E-mail</th>
                  <th scope="col">Provenance</th>
                  <th scope="col">Créé le</th>
                  <th scope="col">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <div className="person">
                        <span className="avatar pale" aria-hidden="true">
                          {initials(customer.full_name)}
                        </span>
                        <div>
                          <strong>{customer.full_name}</strong>
                          <small>{customer.phone ?? '—'}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {customer.email ?? '—'}
                      {customer.email && !customer.email_notifications && (
                        <small> · sans notifications</small>
                      )}
                    </td>
                    <td>
                      {[customer.origin_city, customer.origin_country].filter(Boolean).join(', ') ||
                        '—'}
                    </td>
                    <td>{customer.created_at ? formatDate(customer.created_at) : '—'}</td>
                    <td className="num">
                      <Link className="text-button" to={`/clients/${customer.id}`}>
                        <Icon name="eye" size={17} />
                        Ouvrir →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          meta={meta}
          onPage={(page) => change({ page })}
          perPage={perPage}
          onPerPage={(per_page) => change({ per_page })}
        />
      </Panel>
      {creating && (
        <CustomerFormDialog
          onClose={() => setCreating(false)}
          onSaved={(customer) => navigate(`/clients/${customer.id}`)}
        />
      )}
    </>
  )
}
