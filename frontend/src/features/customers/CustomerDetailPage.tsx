import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Badge, ReservationStatusBadge } from '../../shared/ui/Badge'
import { EmptyState, LoadingBlock, PageHeading, Pair, Panel } from '../../shared/ui/layout'
import { formatDate, formatDay, formatFcfa } from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import { customerQuery, customerReservationsQuery } from './api'
import { CustomerFormDialog } from './CustomerFormDialog'

export function CustomerDetailPage() {
  const { id = '' } = useParams()
  const { can } = useCurrentUser()
  const [editing, setEditing] = useState(false)
  const customer = useQuery(customerQuery(id))
  const stays = useQuery({ ...customerReservationsQuery(id), enabled: can('reservations.view') })

  if (customer.isPending) return <LoadingBlock lines={5} label="Chargement de la fiche client…" />
  const c = customer.data
  if (!c) {
    return (
      <PageHeading
        eyebrow="Clients"
        title="Client introuvable"
        actions={
          <Link className="secondary" to="/clients">
            ← Clients
          </Link>
        }
      />
    )
  }

  return (
    <>
      <PageHeading
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
      <div className="toolbar">
        <Link className="secondary" to="/clients">
          ← Clients
        </Link>
        {can('customers.manage') && (
          <button type="button" className="primary" onClick={() => setEditing(true)}>
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
                  {stays.data.map((r) => (
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
        </Panel>
      )}
      {editing && <CustomerFormDialog customer={c} onClose={() => setEditing(false)} />}
    </>
  )
}
