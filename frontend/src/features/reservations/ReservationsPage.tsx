import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { Reservation } from '../../shared/api/types'
import { Badge, ReservationStatusBadge } from '../../shared/ui/Badge'
import { RESERVATION_STATUS_LABELS } from '../../shared/ui/statusLabels'
import { SelectField, TextField } from '../../shared/ui/fields'
import { EmptyState, LoadingBlock, PageHeading, Panel } from '../../shared/ui/layout'
import { Pagination } from '../../shared/ui/Pagination'
import { formatDay, formatFcfa, initials } from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import { roomsQuery } from '../catalog'
import { reservationsQuery, type ReservationFilters } from './api'
import { NewReservationDialog } from './NewReservationDialog'

export function ReservationsPage() {
  const { can } = useCurrentUser()
  const rooms = useQuery(roomsQuery)
  const [filters, setFilters] = useState<ReservationFilters>({ page: 1 })
  const [draft, setDraft] = useState<ReservationFilters>({})
  const [creating, setCreating] = useState(false)
  const list = useQuery(reservationsQuery(filters))

  function apply(event: FormEvent) {
    event.preventDefault()
    setFilters({ ...draft, page: 1 })
  }

  const rows = list.data?.data ?? []
  const meta = list.data?.meta

  return (
    <>
      <PageHeading
        eyebrow="Exploitation"
        title="Réservations"
        description="Suivez les demandes, les arrivées et les départs de vos clients."
        actions={
          can('reservations.create') && (
            <button type="button" className="primary" onClick={() => setCreating(true)}>
              + Nouvelle réservation
            </button>
          )
        }
      />
      <Panel
        title="Séjours enregistrés"
        action={
          meta && <Badge tone="green" label={`${meta.total} séjour${meta.total > 1 ? 's' : ''}`} />
        }
      >
        <form className="filterbar" onSubmit={apply} aria-label="Filtrer les réservations">
          <SelectField
            label="Statut"
            value={draft.status ?? ''}
            onChange={(e) => setDraft({ ...draft, status: e.target.value || undefined })}
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
            onChange={(e) => setDraft({ ...draft, room_id: e.target.value || undefined })}
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
          {Object.values(draft).some(Boolean) && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setDraft({})
                setFilters({ page: 1 })
              }}
            >
              Effacer
            </button>
          )}
        </form>
        {list.isPending ? <LoadingBlock /> : <ReservationTable rows={rows} />}
        <Pagination meta={meta} onPage={(page) => setFilters({ ...filters, page })} />
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
