import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
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
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const list = useQuery(customersQuery(search, page))
  const rows = list.data?.data ?? []
  const meta = list.data?.meta

  function apply(event: FormEvent) {
    event.preventDefault()
    setSearch(draft.trim())
    setPage(1)
  }

  return (
    <>
      <PageHeading
        eyebrow="Exploitation"
        title="Clients"
        description="Retrouvez un client par son nom, son téléphone ou son e-mail."
        actions={
          can('customers.manage') && (
            <button type="button" className="primary" onClick={() => setCreating(true)}>
              + Nouveau client
            </button>
          )
        }
      />
      <Panel
        title="Répertoire"
        action={
          meta && <Badge tone="green" label={`${meta.total} client${meta.total > 1 ? 's' : ''}`} />
        }
      >
        <form
          className="filterbar"
          onSubmit={apply}
          role="search"
          aria-label="Rechercher un client"
        >
          <TextField
            label="Recherche"
            type="search"
            placeholder="Nom, téléphone ou e-mail"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="secondary">
            Rechercher
          </button>
          {search && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setDraft('')
                setSearch('')
                setPage(1)
              }}
            >
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
                        Ouvrir →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={meta} onPage={setPage} />
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
