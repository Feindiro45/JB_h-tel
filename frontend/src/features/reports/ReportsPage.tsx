import { LocalTable } from '../../shared/ui/LocalTable'
import { useAutoFilters } from '../../shared/ui/useAutoFilters'
import { AutoFilterStatus } from '../../shared/ui/AutoFilterStatus'
import { Icon } from '../../shared/ui/Icon'
import { useQuery } from '@tanstack/react-query'
import { apiUrl } from '../../shared/api/client'
import { SelectField, TextField } from '../../shared/ui/fields'
import { LoadingBlock, Metric, PageHeading, Panel } from '../../shared/ui/layout'
import { formatFcfa, todayIso } from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import { roomsQuery, roomTypesQuery } from '../catalog'
import { defaultReportFilters, reportAgentsQuery, reportQuery } from './api'

interface Report {
  totals: {
    collected_fcfa: number
    refunded_fcfa: number
    net_collected_fcfa: number
    net_invoiced_fcfa: number
    discount_fcfa: number
    stays_count: number
    booked_fcfa: number
    receivables_fcfa: number
  }
  daily: { date: string; collected_fcfa: number; refunded_fcfa: number; net_fcfa: number }[]
  by_type: {
    id: string
    label: string
    collected_fcfa: number
    refunded_fcfa: number
    net_fcfa: number
  }[]
  reconciliation: { difference_fcfa: number }
  definitions: string[]
  occupancy: { at: string; occupied: number; reserved: number; maintenance: number; free: number }
}
export function ReportsPage() {
  const today = todayIso()
  const { can } = useCurrentUser()
  const { filters, draft, change, pending, valid } = useAutoFilters(defaultReportFilters(today), {
    requiredPeriod: true,
    maxDays: 366,
  })
  const rooms = useQuery(roomsQuery)
  const types = useQuery(roomTypesQuery)
  const agents = useQuery(reportAgentsQuery)
  const report = useQuery(reportQuery<Report>(filters))
  const data = report.data
  const exportUrl = (format: string) =>
    apiUrl(`/api/v1/reports/financial?${new URLSearchParams({ ...filters, format })}`)
  const max = Math.max(1, ...(data?.daily.map((d) => Math.abs(d.net_fcfa)) ?? []))
  return (
    <>
      <PageHeading
        icon="chart"
        eyebrow="Finances"
        title="Rapports"
        description="Facturé, encaissé et montants des séjours : des indicateurs distincts."
        actions={
          can('reports.export') && (
            <>
              <a className="secondary" href={exportUrl('csv')}>
                <Icon name="download" size={17} />
                Exporter CSV
              </a>
              <a className="secondary" href={exportUrl('pdf')}>
                <Icon name="download" size={17} />
                Exporter PDF
              </a>
            </>
          )
        }
      />
      <form
        className="filterbar"
        onSubmit={(e) => e.preventDefault()}
        aria-label="Filtrer les rapports"
      >
        <TextField
          label="Du"
          type="date"
          value={draft.from}
          required
          onChange={(e) => change({ from: e.target.value })}
        />
        <TextField
          label="Au"
          type="date"
          min={draft.from}
          value={draft.to}
          required
          onChange={(e) => change({ to: e.target.value })}
        />
        <SelectField
          label="Catégorie"
          value={draft.room_type_id}
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
          label="Chambre"
          value={draft.room_id}
          onChange={(e) => change({ room_id: e.target.value })}
        >
          <option value="">Toutes</option>
          {rooms.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.number}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Agent"
          value={draft.agent_id}
          onChange={(e) => change({ agent_id: e.target.value })}
        >
          <option value="">Tous</option>
          {agents.data?.data.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>
        <AutoFilterStatus pending={pending} valid={valid} />
      </form>
      {report.isPending ? (
        <LoadingBlock />
      ) : (
        data && (
          <>
            <div className="metrics">
              <Metric
                tone="green"
                icon="cash"
                label="Encaissé net"
                value={formatFcfa(data.totals.net_collected_fcfa)}
                hint="Versements valides − remboursements"
              />
              <Metric
                tone="blue"
                icon="document"
                label="Facturé net"
                value={formatFcfa(data.totals.net_invoiced_fcfa)}
                hint="Factures − avoirs émis sur la période"
              />
              <Metric
                tone="mint"
                icon="calendar"
                label="Montant réservé"
                value={formatFcfa(data.totals.booked_fcfa)}
                hint={`${data.totals.stays_count} séjours débutant sur la période`}
              />
              <Metric
                tone="amber"
                icon="cash"
                label="Remboursements"
                value={formatFcfa(data.totals.refunded_fcfa)}
                hint={`Remises des séjours : ${formatFcfa(data.totals.discount_fcfa)}`}
              />
            </div>
            <Panel title="Soldes et occupation au moment de la consultation">
              <div className="filterbar">
                <strong>
                  Soldes actuels des séjours sélectionnés :{' '}
                  {formatFcfa(data.totals.receivables_fcfa)}
                </strong>
                <span>
                  Chambres occupées : {data.occupancy.occupied} · libres : {data.occupancy.free} ·
                  réservées : {data.occupancy.reserved} · maintenance : {data.occupancy.maintenance}
                </span>
              </div>
            </Panel>
            <Panel title="Évolution de l’encaissé net">
              <div
                className="report-chart"
                role="img"
                aria-label="Encaissé net par jour ; les valeurs détaillées figurent dans le tableau suivant."
              >
                {data.daily.map((d) => (
                  <div key={d.date} title={`${d.date} : ${formatFcfa(d.net_fcfa)}`}>
                    <span
                      style={{
                        height: `${(Math.abs(d.net_fcfa) / max) * 48}%`,
                        bottom: d.net_fcfa >= 0 ? '50%' : undefined,
                        top: d.net_fcfa < 0 ? '50%' : undefined,
                        background:
                          d.net_fcfa < 0 ? 'var(--danger, #a12e37)' : 'var(--primary, #1c5546)',
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="filterbar caption">
                <span>{filters.from}</span>
                <span>
                  Au-dessus de l’axe : encaissé net positif · au-dessous : remboursements nets
                </span>
                <span>{filters.to}</span>
              </div>
              <details>
                <summary>Données quotidiennes</summary>
                <LocalTable
                  label="données quotidiennes"
                  rows={data.daily}
                  searchText={(r) =>
                    `${r.date} ${r.collected_fcfa} ${r.refunded_fcfa} ${r.net_fcfa}`
                  }
                >
                  {(visibleRows) => (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Encaissé</th>
                            <th>Remboursé</th>
                            <th>Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleRows.map((d) => (
                            <tr key={d.date}>
                              <td>{d.date}</td>
                              <td>{formatFcfa(d.collected_fcfa)}</td>
                              <td>{formatFcfa(d.refunded_fcfa)}</td>
                              <td>{formatFcfa(d.net_fcfa)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </LocalTable>
              </details>
            </Panel>
            <Panel title="Ventilation par catégorie">
              <LocalTable
                label="ventilation par catégorie"
                rows={data.by_type}
                searchText={(r) =>
                  `${r.label} ${r.collected_fcfa} ${r.refunded_fcfa} ${r.net_fcfa}`
                }
              >
                {(visibleRows) => (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Catégorie</th>
                          <th>Encaissé</th>
                          <th>Remboursé</th>
                          <th>Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((t) => (
                          <tr key={t.id}>
                            <td>{t.label}</td>
                            <td>{formatFcfa(t.collected_fcfa)}</td>
                            <td>{formatFcfa(t.refunded_fcfa)}</td>
                            <td>{formatFcfa(t.net_fcfa)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </LocalTable>
            </Panel>
            <Panel title="Définitions et rapprochement">
              <p className="caption">
                Écart entre les transactions et la série quotidienne :{' '}
                {formatFcfa(data.reconciliation.difference_fcfa)}.
              </p>
              {data.definitions.map((d) => (
                <p className="caption" key={d}>
                  {d}
                </p>
              ))}
            </Panel>
          </>
        )
      )}
    </>
  )
}
