import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Badge } from '../../shared/ui/Badge'
import { Icon } from '../../shared/ui/Icon'
import { Pair, Panel } from '../../shared/ui/layout'
import { formatDateTime, formatNumber } from '../../shared/utils/format'
import { offlineOverviewQuery } from './adminApi'

/**
 * Encart du tableau de bord de l'administrateur (lot 4A.1) : état du poste principal, dernière
 * synchronisation, opérations en attente déclarées et refus à examiner ; lien vers le module.
 */
export function OfflineAdminCard() {
  const overview = useQuery({ ...overviewQuery, meta: { silentError: true } })
  const data = overview.data
  if (!data) return null
  const main = data.main
  const report = main?.report

  return (
    <Panel
      title="Mode hors ligne"
      action={
        <Link className="text-button" to="/admin/hors-ligne">
          <Icon name="cloudOff" size={17} />
          Ouvrir le module →
        </Link>
      }
    >
      <div className="panel-body pairs grid-pairs">
        <Pair label="Poste principal">
          {main ? (
            <>
              {main.name}{' '}
              {main.silent ? (
                <Badge
                  tone="amber"
                  label={`Hors ligne depuis ${main.last_seen_at ? formatDateTime(main.last_seen_at) : '—'}`}
                />
              ) : (
                <Badge tone="green" label="En ligne" />
              )}
            </>
          ) : (
            'Aucun désigné'
          )}
        </Pair>
        <Pair label="Dernière synchronisation">
          {report?.last_sync_at ? formatDateTime(report.last_sync_at) : 'Aucune'}
        </Pair>
        <Pair label="En attente sur le poste">{formatNumber(report?.pending_operations ?? 0)}</Pair>
        <Pair label="Refus à examiner">
          {data.to_review > 0 ? (
            <Badge tone="red" label={`${data.to_review} à examiner`} />
          ) : (
            'Aucun'
          )}
        </Pair>
      </div>
    </Panel>
  )
}

const overviewQuery = offlineOverviewQuery
