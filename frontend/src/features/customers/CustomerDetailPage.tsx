import { PageOverview } from '../../shared/ui/PageOverview'
import { Icon } from '../../shared/ui/Icon'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Badge, ReservationStatusBadge } from '../../shared/ui/Badge'
import { EmptyState, LoadingBlock, PageHeading, Pair, Panel } from '../../shared/ui/layout'
import { formatDate, formatDay, formatFcfa } from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import { Pagination } from '../../shared/ui/Pagination'
import { useTable } from '../../shared/ui/useTable'
import { TextField } from '../../shared/ui/fields'
import { customerQuery, customerReservationsQuery } from './api'
import { CustomerFormDialog } from './CustomerFormDialog'

export function CustomerDetailPage() {
  const { id = '' } = useParams()
  const { can } = useCurrentUser()
  const [editing, setEditing] = useState(false)
  const customer = useQuery(customerQuery(id))
  const stays = useQuery({ ...customerReservationsQuery(id), enabled: can('reservations.view') })

  const [search, setSearch] = useState('')
  const table = useTable(
    (stays.data ?? []).filter((r) =>
      `${r.room?.number} ${r.status_label} ${r.period.start_date} ${r.period.end_date}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ),
  )

  if (customer.isPending) return <LoadingBlock lines={5} label="Chargement de la fiche client…" />
  const c = customer.data
  if (!c) {
    return (
      <PageHeading
        icon="people"
        eyebrow="Clients"
        title="Client introuvable"
        actions={
          <Link className="secondary" to="/clients">
            <Icon name="back" size={17} />
            <span className="sr-only">←</span> Clients
          </Link>
        }
      />
    )
  }

  return (
    <>
      <PageHeading
        icon="people"
        eyebrow="Clients"
        title={c.full_name}
        description={c.phone ?? undefined}
        actions={
          c.email ? (
            <Badge
              tone={c.email_notifications ? 'green' : 'neutral'}
              label={
                c.email_notifications
                  ? 'Notifications e-mail actives'
                  : 'Notifications e-mail désactivées'
              }
            />
          ) : (
            <Badge tone="neutral" label="Sans e-mail" />
          )
        }
      />
      <PageOverview
        items={[
          {
            label: 'Téléphone',
            value: c.phone ? 'Renseigné' : 'À compléter',
            hint: 'Contact téléphonique',
            icon: 'phone',
          },
          {
            label: 'E-mail',
            value: c.email ? 'Renseigné' : 'À compléter',
            hint: c.email_notifications ? 'Notifications autorisées' : 'Notifications désactivées',
            icon: 'mail',
          },
          {
            label: 'Séjours',
            value: can('reservations.view') ? stays.data?.length : 'Accès limité',
            hint: 'Historique complet du client',
            icon: 'calendar',
          },
          {
            label: 'En cours',
            value: can('reservations.view')
              ? stays.data?.filter((r) => r.status === 'IN_PROGRESS').length
              : 'Accès limité',
            hint: 'Séjours de ce client',
            icon: 'rooms',
          },
        ]}
      />
      <div className="toolbar">
        <Link className="secondary" to="/clients">
          <Icon name="back" size={17} />
          <span className="sr-only">←</span> Clients
        </Link>
        {can('customers.manage') && (
          <button type="button" className="primary" onClick={() => setEditing(true)}>
            <Icon name="edit" size={17} />
            Modifier la fiche
          </button>
        )}
      </div>

      <Panel title="Coordonnées">
        <div className="panel-body pairs grid-pairs">
          <Pair label="Nom">{c.name}</Pair>
          <Pair label="Prénoms">{c.first_name ?? '—'}</Pair>
          <Pair label="Téléphone">{c.phone ?? '—'}</Pair>
          <Pair label="E-mail">{c.email ?? '—'}</Pair>
          <Pair label="Provenance">
            {[c.origin_city, c.origin_country].filter(Boolean).join(', ') || '—'}
          </Pair>
          <Pair label="Adresse">{c.address ?? '—'}</Pair>
          <Pair label="Pièce d’identité">
            {c.identification_type ? `${c.identification_type} · ${c.identification_number}` : '—'}
          </Pair>
          <Pair label="Client depuis">{c.created_at ? formatDate(c.created_at) : '—'}</Pair>
          {c.notes && <Pair label="Notes internes">{c.notes}</Pair>}
        </div>
      </Panel>

      {can('reservations.view') && (
        <Panel title="Séjours" subtitle="Historique des réservations de ce client">
          <div className="filterbar">
            <TextField
              label="Rechercher un séjour"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                table.onPage(1)
              }}
            />
          </div>
          {stays.isPending ? (
            <LoadingBlock lines={2} />
          ) : stays.data && stays.data.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Chambre</th>
                    <th scope="col">Arrivée</th>
                    <th scope="col">Départ</th>
                    <th scope="col">Statut</th>
                    <th scope="col" className="num">
                      Montant net
                    </th>
                    <th scope="col">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.room?.number}</strong> <small>{r.room?.room_type.label}</small>
                      </td>
                      <td>{formatDay(r.period.start_date)}</td>
                      <td>{formatDay(r.period.end_date)}</td>
                      <td>
                        <ReservationStatusBadge status={r.status} label={r.status_label} />
                      </td>
                      <td className="num">{formatFcfa(r.price.net_fcfa)}</td>
                      <td className="num">
                        <Link className="text-button" to={`/reservations/${r.id}`}>
                          <Icon name="eye" size={17} />
                          Ouvrir →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Aucun séjour">Ce client n’a pas encore de réservation.</EmptyState>
          )}
          <Pagination {...table} />
        </Panel>
      )}
      {editing && <CustomerFormDialog customer={c} onClose={() => setEditing(false)} />}
    </>
  )
}
