import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import type { DashboardRow, OccupancyRow } from '../../shared/api/types'
import { ReservationStatusBadge } from '../../shared/ui/Badge'
import { ROOM_STATE_LABELS } from '../../shared/ui/statusLabels'
import { EmptyState, LoadingBlock, Metric, PageHeading, Panel } from '../../shared/ui/layout'
import {
  formatDay,
  formatFcfa,
  formatNumber,
  formatWeekday,
  initials,
  todayIso,
} from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import { NewReservationDialog, occupancyQuery } from '../reservations'
import { dashboardQuery } from './api'

const DONUT_COLORS: Record<string, string> = {
  OCCUPIED: '#047857',
  RESERVED: '#77b9aa',
  FREE: '#d9e8df',
  MAINTENANCE: '#e5a85d',
}

/** Vue d'ensemble de la réception (design du prototype), données réelles de l'API. */
export function DashboardPage() {
  const { user, can } = useCurrentUser()
  const dashboard = useQuery(dashboardQuery)
  const occupancy = useQuery(occupancyQuery)
  const [creating, setCreating] = useState(false)

  const rooms = occupancy.data?.data ?? []
  const counts = (['OCCUPIED', 'RESERVED', 'FREE', 'MAINTENANCE'] as const).map((state) => ({
    state,
    count: rooms.filter((row) => row.state === state).length,
  }))
  const occupied = counts[0].count

  return (
    <>
      <PageHeading
        eyebrow={`Réception · ${formatDay(todayIso())}`}
        title="Vue d’ensemble"
        description={`Bonjour ${user?.name.split(' ')[0] ?? ''}, voici les séjours et les mouvements de caisse du jour.`}
        actions={
          can('reservations.create') && (
            <button type="button" className="primary" onClick={() => setCreating(true)}>
              + Nouvelle réservation
            </button>
          )
        }
      />

      {dashboard.isPending ? (
        <LoadingBlock lines={3} label="Chargement des indicateurs…" />
      ) : dashboard.data ? (
        <section className="metrics" aria-label="Indicateurs du jour">
          <Metric
            label="Encaissé aujourd’hui"
            value={formatFcfa(dashboard.data.collected_today_fcfa)}
            hint="Versements validés − remboursements"
            icon="cash"
          />
          <Metric
            label="Facturé ce mois"
            value={formatFcfa(dashboard.data.invoiced_month_fcfa)}
            hint="Factures émises − avoirs"
            icon="document"
          />
          <Metric
            label="Soldes à recevoir"
            value={formatFcfa(dashboard.data.receivables_fcfa)}
            hint="Réservations non annulées"
            icon="chart"
          />
          <Metric
            label="Chambres occupées"
            value={`${occupied} / ${rooms.length}`}
            hint="Séjours en cours maintenant"
            icon="rooms"
          />
        </section>
      ) : null}

      <div className="dashboard-grid">
        <Panel title="Encaissements par jour" subtitle="Encaissé net des 7 derniers jours, en FCFA">
          {dashboard.data ? (
            <CollectedChart days={dashboard.data.collected_last_7_days} />
          ) : (
            <LoadingBlock lines={3} />
          )}
        </Panel>
        <Panel
          title="Occupation des chambres"
          subtitle="État calculé maintenant, à partir des réservations"
        >
          {occupancy.isPending ? (
            <LoadingBlock lines={3} />
          ) : (
            <OccupancyDonut rows={rooms} counts={counts} />
          )}
        </Panel>
      </div>

      <div className="dashboard-grid">
        <Panel
          title="Arrivées du jour"
          subtitle="Réservations confirmées qui commencent aujourd’hui"
        >
          <MovementsTable
            rows={dashboard.data?.arrivals_today}
            timeKey="start_time"
            empty="Aucune arrivée prévue aujourd’hui."
          />
        </Panel>
        <Panel title="Départs du jour" subtitle="Séjours en cours qui se terminent aujourd’hui">
          <MovementsTable
            rows={dashboard.data?.departures_today}
            timeKey="end_time"
            empty="Aucun départ prévu aujourd’hui."
          />
        </Panel>
      </div>

      <Panel
        title="Réservations récentes"
        action={
          <Link className="text-button" to="/reservations">
            Toutes les réservations →
          </Link>
        }
      >
        <RecentTable rows={dashboard.data?.recent_reservations} />
      </Panel>

      {creating && <NewReservationDialog onClose={() => setCreating(false)} />}
    </>
  )
}

function CollectedChart({ days }: { days: { date: string; net_fcfa: number }[] }) {
  const max = Math.max(10_000, ...days.map((day) => day.net_fcfa))
  const top = Math.ceil(max / 10_000) * 10_000
  return (
    <>
      <div className="chart" aria-hidden="true">
        <div className="chart-axis">
          {[1, 0.75, 0.5, 0.25, 0].map((ratio) => (
            <span key={ratio}>{formatNumber(Math.round((top * ratio) / 1000))} k</span>
          ))}
        </div>
        <div className="chart-bars">
          {days.map((day) => (
            <div key={day.date}>
              <span className="bar-wrap">
                <i style={{ height: `${Math.max(0, (day.net_fcfa / top) * 100)}%` }} />
              </span>
              <small>{formatWeekday(day.date)}</small>
            </div>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>Encaissé net par jour</caption>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <th scope="row">{formatDay(day.date)}</th>
              <td>{formatFcfa(day.net_fcfa)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function OccupancyDonut({
  rows,
  counts,
}: {
  rows: OccupancyRow[]
  counts: { state: string; count: number }[]
}) {
  if (rows.length === 0)
    return <EmptyState title="Aucune chambre">Créez les chambres dans l’administration.</EmptyState>
  // Segments cumulés du donut, calculés sans mutation pendant le rendu.
  const gradient = counts
    .reduce<{ stops: string[]; end: number }>(
      (acc, { state, count }) => {
        const end = acc.end + (count * 100) / rows.length
        return { stops: [...acc.stops, `${DONUT_COLORS[state]} ${acc.end}% ${end}%`], end }
      },
      { stops: [], end: 0 },
    )
    .stops.join(', ')
  const occupied = counts.find((item) => item.state === 'OCCUPIED')?.count ?? 0
  return (
    <div className="occupation">
      <div
        className="donut"
        style={{ background: `conic-gradient(${gradient})` }}
        aria-hidden="true"
      >
        <div>
          <strong>{Math.round((occupied * 100) / rows.length)} %</strong>
          <small>occupées</small>
        </div>
      </div>
      <div className="legend">
        {counts.map(({ state, count }) => (
          <div key={state}>
            <i style={{ background: DONUT_COLORS[state] }} aria-hidden="true" />
            <span>{ROOM_STATE_LABELS[state]}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function Person({ name, sub }: { name: string; sub: string }) {
  return (
    <div className="person">
      <span className="avatar pale" aria-hidden="true">
        {initials(name)}
      </span>
      <div>
        <strong>{name}</strong>
        <small>{sub}</small>
      </div>
    </div>
  )
}

function MovementsTable({
  rows,
  timeKey,
  empty,
}: {
  rows?: DashboardRow[]
  timeKey: 'start_time' | 'end_time'
  empty: string
}) {
  if (!rows) return <LoadingBlock lines={2} />
  if (rows.length === 0) return <EmptyState title="Rien à signaler">{empty}</EmptyState>
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Client</th>
            <th scope="col">Chambre</th>
            <th scope="col">Heure</th>
            <th scope="col">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Person name={row.customer} sub={row.room.type} />
              </td>
              <td>{row.room.number}</td>
              <td>{row[timeKey] ?? 'Heure libre'}</td>
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

function RecentTable({ rows }: { rows?: DashboardRow[] }) {
  if (!rows) return <LoadingBlock lines={3} />
  if (rows.length === 0)
    return (
      <EmptyState title="Aucune réservation">
        Les nouvelles réservations apparaîtront ici.
      </EmptyState>
    )
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Client</th>
            <th scope="col">Chambre</th>
            <th scope="col">Arrivée</th>
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
                <Person name={row.customer} sub={row.room.type} />
              </td>
              <td>{row.room.number}</td>
              <td>{formatDay(row.start_date)}</td>
              <td>
                <ReservationStatusBadge status={row.status} label={row.status_label} />
              </td>
              <td className="num">{formatFcfa(row.net_fcfa)}</td>
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
