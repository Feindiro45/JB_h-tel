import { LocalTable } from '../../shared/ui/LocalTable'
import { Icon } from '../../shared/ui/Icon'
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
import { OfflineAdminCard, PendingOperationsPanel } from '../offline'
import { NewReservationDialog, occupancyQuery } from '../reservations'
import { dashboardQuery } from './api'

const DONUT_COLORS: Record<string, string> = {
  OCCUPIED: '#c93644',
  RESERVED: '#3975cb',
  FREE: '#24985b',
  MAINTENANCE: '#c58a2c',
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
        icon="dashboard"
        eyebrow={`Réception · ${formatDay(todayIso())}`}
        title="Vue d’ensemble"
        description={`Bonjour ${user?.name.split(' ')[0] ?? ''}, voici les séjours et les mouvements de caisse du jour.`}
        actions={
          can('reservations.create') && (
            <button type="button" className="primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={17} />
              <span className="sr-only">+</span> Nouvelle réservation
            </button>
          )
        }
      />

      {dashboard.isPending ? (
        <LoadingBlock lines={3} label="Chargement des indicateurs…" />
      ) : dashboard.data ? (
        <section className="metrics" aria-label="Indicateurs du jour">
          <Metric
            tone="green"
            label="Encaissé aujourd’hui"
            value={formatFcfa(dashboard.data.collected_today_fcfa)}
            hint="Versements validés − remboursements"
            icon="cash"
          />
          <Metric
            tone="blue"
            label="Facturé ce mois"
            value={formatFcfa(dashboard.data.invoiced_month_fcfa)}
            hint="Factures émises − avoirs"
            icon="document"
          />
          <Metric
            tone="mint"
            label="Soldes à recevoir"
            value={formatFcfa(dashboard.data.receivables_fcfa)}
            hint="Réservations non annulées"
            icon="chart"
          />
          <Metric
            tone="red"
            label="Chambres occupées"
            value={`${occupied} / ${rooms.length}`}
            hint="Séjours en cours maintenant"
            icon="rooms"
          />
        </section>
      ) : null}

      <PendingOperationsPanel />
      {can('offline.manage') && <OfflineAdminCard />}

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
            <Icon name="calendar" size={17} />
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
      <details>
        <summary>Données des encaissements</summary>
        <LocalTable
          label="encaissements quotidiens"
          rows={days}
          searchText={(r) => `${formatDay(r.date)} ${r.net_fcfa}`}
        >
          {(visibleRows) => (
            <div className="table-wrap">
              {' '}
              <table>
                <caption>Encaissé net par jour</caption>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Encaissé net</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((day) => (
                    <tr key={day.date}>
                      <th scope="row">{formatDay(day.date)}</th>
                      <td>{formatFcfa(day.net_fcfa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </LocalTable>
      </details>
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
    <LocalTable
      label={timeKey === 'start_time' ? 'arrivées du jour' : 'départs du jour'}
      rows={rows}
      searchText={(r) =>
        `${r.customer} ${r.room.number} ${r.room.type} ${r[timeKey] ?? 'Heure libre'}`
      }
    >
      {(visibleRows) => (
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
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Person name={row.customer} sub={row.room.type} />
                  </td>
                  <td>{row.room.number}</td>
                  <td>{row[timeKey] ?? 'Heure libre'}</td>
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
      )}
    </LocalTable>
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
    <LocalTable
      label="réservations récentes"
      rows={rows}
      searchText={(r) =>
        `${r.customer} ${r.room.number} ${r.room.type} ${r.status_label} ${formatDay(r.start_date)} ${r.net_fcfa}`
      }
    >
      {(visibleRows) => (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Client</th>
                <th scope="col">Chambre</th>
                <th scope="col">Arrivée</th>
                <th scope="col">Statut</th>
                <th scope="col" className="num">
                  Montant dû
                </th>
                <th scope="col">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Person name={row.customer} sub={row.room.type} />
                  </td>
                  <td>{row.room.number}</td>
                  <td>{formatDay(row.start_date)}</td>
                  <td>
                    <ReservationStatusBadge status={row.status} label={row.status_label} />
                  </td>
                  <td className="num">
                    {formatFcfa(row.amount_due_fcfa)}
                    {row.status === 'CANCELLED' && (
                      <small style={{ display: 'block' }}>
                        annulée · prix {formatFcfa(row.net_fcfa)}
                      </small>
                    )}
                  </td>
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
      )}
    </LocalTable>
  )
}
