import { PageOverview } from '../../shared/ui/PageOverview'
import { useAutoFilters } from '../../shared/ui/useAutoFilters'
import { AutoFilterStatus } from '../../shared/ui/AutoFilterStatus'
import { Icon } from '../../shared/ui/Icon'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import type { Reservation } from '../../shared/api/types'
import { Badge, ReservationStatusBadge } from '../../shared/ui/Badge'
import { RESERVATION_STATUS_LABELS } from '../../shared/ui/statusLabels'
import { SelectField, TextField } from '../../shared/ui/fields'
import { EmptyState, LoadingBlock, PageHeading, Panel } from '../../shared/ui/layout'
import { Pagination } from '../../shared/ui/Pagination'
import { formatDay, formatFcfa, initials } from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import { roomsQuery, roomTypesQuery } from '../catalog'
import { reservationsQuery, type ReservationFilters } from './api'
import { NewReservationDialog } from './NewReservationDialog'

export function ReservationsPage() {
  const { can } = useCurrentUser()
  const rooms = useQuery(roomsQuery)
  const types = useQuery(roomTypesQuery)
  const { filters, draft, change, reset, pending, valid } = useAutoFilters<ReservationFilters>({
    page: 1,
    per_page: 25,
  })
  const [creating, setCreating] = useState(false)
  const list = useQuery(reservationsQuery(filters))

  const rows = list.data?.data ?? []
  const meta = list.data?.meta

  return (
    <>
      <PageHeading
        icon="calendar"
        eyebrow="Exploitation"
        title="Réservations"
        description="Suivez les demandes, les arrivées et les départs de vos clients."
        actions={
          can('reservations.create') && (
            <button type="button" className="primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={17} />
              <span className="sr-only">+</span> Nouvelle réservation
            </button>
          )
        }
      />
      <PageOverview
        items={[
          {
            label: 'Réservations',
            value: meta?.total,
            hint: 'Ensemble des résultats filtrés',
            icon: 'calendar',
          },
          {
            label: 'En attente',
            value: list.data ? rows.filter((r) => r.status === 'PENDING').length : undefined,
            hint: 'Sur la page affichée',
            icon: 'clock',
          },
          {
            label: 'Confirmées',
            value: list.data ? rows.filter((r) => r.status === 'CONFIRMED').length : undefined,
            hint: 'Sur la page affichée',
            icon: 'check',
          },
          {
            label: 'Séjours en cours',
            value: list.data ? rows.filter((r) => r.status === 'IN_PROGRESS').length : undefined,
            hint: 'Sur la page affichée',
            icon: 'rooms',
          },
        ]}
      />
      <Panel
        title="Séjours enregistrés"
        action={
          meta && <Badge tone="green" label={`${meta.total} séjour${meta.total > 1 ? 's' : ''}`} />
        }
      >
        <form
          className="filterbar"
          onSubmit={(e) => e.preventDefault()}
          aria-label="Filtrer les réservations"
        >
          <TextField
            label="Client"
            type="search"
            value={draft.search ?? ''}
            onChange={(e) => change({ search: e.target.value }, true)}
          />
          <SelectField
            label="Catégorie"
            value={draft.room_type_id ?? ''}
            onChange={(e) => change({ room_type_id: e.target.value })}
          >
            <option value="">Toutes</option>
            {types.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Forfait"
            value={draft.billing_unit ?? ''}
            onChange={(e) => change({ billing_unit: e.target.value })}
          >
            <option value="">Tous</option>
            <option value="HALF_DAY">Demi-journée</option>
            <option value="DAY">Journée</option>
          </SelectField>
          <SelectField
            label="Statut"
            value={draft.status ?? ''}
            onChange={(e) => change({ status: e.target.value || undefined })}
          >
            <option value="">Tous</option>
            {Object.entries(RESERVATION_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Chambre"
            value={draft.room_id ?? ''}
            onChange={(e) => change({ room_id: e.target.value || undefined })}
          >
            <option value="">Toutes</option>
            {rooms.data?.map((room) => (
              <option key={room.id} value={room.id}>
                {room.number} · {room.room_type.label}
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
          {Object.entries(draft).some(
            ([key, value]) => !['page', 'per_page'].includes(key) && Boolean(value),
          ) && (
            <button type="button" className="text-button" onClick={reset}>
              <Icon name="close" size={17} />
              Effacer
            </button>
          )}
        </form>
        {list.isPending ? <LoadingBlock /> : <ReservationTable rows={rows} />}
        <Pagination
          meta={meta}
          onPage={(page) => change({ page })}
          perPage={filters.per_page}
          onPerPage={(per_page) => change({ per_page })}
        />
      </Panel>
      {creating && <NewReservationDialog onClose={() => setCreating(false)} />}
    </>
  )
}

export function ReservationTable({ rows }: { rows: Reservation[] }) {
  if (rows.length === 0) return <EmptyState />
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Client</th>
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
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <div className="person">
                  <span className="avatar pale" aria-hidden="true">
                    {initials(row.customer?.full_name ?? '?')}
                  </span>
                  <div>
                    <strong>{row.customer?.full_name ?? '—'}</strong>
                    <small>{row.customer?.phone ?? ''}</small>
                  </div>
                </div>
              </td>
              <td>
                <strong>{row.room?.number}</strong> <small>{row.room?.room_type.label}</small>
              </td>
              <td>
                {formatDay(row.period.start_date)}
                {row.period.start_time && <small> · {row.period.start_time}</small>}
              </td>
              <td>
                {formatDay(row.period.end_date)}
                {row.period.end_time && <small> · {row.period.end_time}</small>}
              </td>
              <td>
                <ReservationStatusBadge status={row.status} label={row.status_label} />
              </td>
              <td className="num">{formatFcfa(row.price.net_fcfa)}</td>
              <td className="num">
                <Link className="text-button" to={`/reservations/${row.id}`}>
                  <Icon name="eye" size={17} />
                  Ouvrir →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
