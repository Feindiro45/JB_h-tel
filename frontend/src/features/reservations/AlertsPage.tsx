import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { Badge } from '../../shared/ui/Badge'
import { AutoFilterStatus } from '../../shared/ui/AutoFilterStatus'
import { TextField, SelectField } from '../../shared/ui/fields'
import { Icon } from '../../shared/ui/Icon'
import { EmptyState, LoadingBlock, PageHeading, Panel } from '../../shared/ui/layout'
import { PageOverview } from '../../shared/ui/PageOverview'
import { Pagination } from '../../shared/ui/Pagination'
import { useAutoFilters } from '../../shared/ui/useAutoFilters'
import { formatDateTime } from '../../shared/utils/format'
import {
  ALERTS_KEY,
  alertSummaryQuery,
  departureAlertsQuery,
  overdueDuration,
  type AlertFilters,
} from './alerts'

export function AlertsPage() {
  const queryClient = useQueryClient()
  const { filters, draft, change, reset, pending } = useAutoFilters<AlertFilters>({
    page: 1,
    per_page: 25,
  })
  const summary = useQuery(alertSummaryQuery)
  const list = useQuery(departureAlertsQuery(filters))
  const meta = list.data?.meta
  useEffect(() => {
    if (meta && meta.current_page > meta.last_page) change({ page: meta.last_page })
  }, [meta, change])
  return (
    <>
      <PageHeading
        icon="bell"
        eyebrow="Exploitation"
        title="Alertes"
        description="Les départs prévus dépassés nécessitent une intervention de la réception."
        actions={
          <button
            type="button"
            className="secondary"
            disabled={list.isFetching}
            onClick={() => void queryClient.invalidateQueries({ queryKey: ALERTS_KEY })}
          >
            <Icon name="refresh" size={17} />
            Actualiser
          </button>
        }
      />
      <PageOverview
        items={[
          {
            label: 'Départs dépassés',
            value: summary.data?.total,
            hint: 'Tous les séjours encore en cours',
            icon: 'bell',
            tone: 'red',
          },
          {
            label: 'Chambres concernées',
            value: summary.data?.rooms,
            hint: 'Restent occupées jusqu’au départ réel',
            icon: 'rooms',
            tone: 'red',
          },
          {
            label: 'Forfait Journée',
            value: summary.data?.day,
            hint: 'Ensemble des alertes, hors filtres',
            icon: 'calendar',
            tone: 'blue',
          },
          {
            label: 'Forfait Demi-journée',
            value: summary.data?.half_day,
            hint: 'Ensemble des alertes, hors filtres',
            icon: 'clock',
            tone: 'amber',
          },
        ]}
      />
      <p className="notice alerts-guidance">
        Enregistrez le départ réel ou prolongez le séjour depuis sa fiche. Sans heure de départ, la
        fin de journée est retenue. Aucun supplément n’est appliqué sans validation.
      </p>
      <Panel
        title="Départs à traiter"
        subtitle={
          list.data
            ? `Mis à jour le ${formatDateTime(list.data.at)} · actualisation automatique toutes les 30 secondes`
            : undefined
        }
      >
        <form
          className="filterbar"
          aria-label="Filtrer les alertes"
          onSubmit={(e) => e.preventDefault()}
        >
          <TextField
            label="Client ou chambre"
            type="search"
            maxLength={160}
            value={draft.search ?? ''}
            onChange={(e) => change({ search: e.target.value }, true)}
          />
          <SelectField
            label="Forfait"
            value={draft.billing_unit ?? ''}
            onChange={(e) => change({ billing_unit: e.target.value })}
          >
            <option value="">Tous</option>
            <option value="DAY">Journée</option>
            <option value="HALF_DAY">Demi-journée</option>
          </SelectField>
          <button type="button" className="secondary" onClick={reset}>
            <Icon name="undo" size={17} />
            Réinitialiser
          </button>
          <AutoFilterStatus pending={pending} valid />
        </form>
        {list.isPending ? (
          <LoadingBlock />
        ) : list.isError ? (
          <p role="alert" className="notice">
            Impossible de charger les alertes. Utilisez « Actualiser » pour réessayer.
          </p>
        ) : !list.data?.data.length ? (
          <EmptyState title="Aucun départ à traiter">
            Aucun séjour ne correspond aux filtres actuels.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="departure-alerts-table">
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Chambre</th>
                  <th scope="col">Départ prévu</th>
                  <th scope="col">Dépassement</th>
                  <th scope="col">Forfait</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.customer?.full_name ?? '—'}</strong>
                      <small>{row.customer?.phone}</small>
                    </td>
                    <td>
                      <strong>{row.room?.number}</strong>
                      <small>{row.room?.room_type.label}</small>
                    </td>
                    <td>
                      {formatDateTime(row.period.blocked_until)}
                      {row.period.is_estimated && <small>Horaire estimé</small>}
                    </td>
                    <td>
                      <Badge tone="red" label={overdueDuration(row.overdue_minutes)} />
                    </td>
                    <td>{row.price.billing_unit_label}</td>
                    <td>
                      <Link className="text-button" to={`/reservations/${row.id}`}>
                        <Icon name="eye" size={17} />
                        Traiter le séjour
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
          perPage={filters.per_page}
          onPerPage={(per_page) => change({ per_page })}
        />
      </Panel>
    </>
  )
}
