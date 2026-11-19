import { useQuery } from '@tanstack/react-query'
import { toUserError } from '../../../shared/api/errors'
import { PageHeading, Pair, Panel } from '../../../shared/ui/layout'
import { StatusBadge } from '../../../shared/ui/StatusBadge'
import { formatDateTime } from '../../../shared/utils/format'
import { healthQueryOptions } from '../api/health'

export function StatusPage() {
  const health = useQuery(healthQueryOptions)

  const apiBadge = health.isPending ? (
    <StatusBadge tone="neutral" label="Vérification…" />
  ) : health.isError ? (
    <StatusBadge
      tone="error"
      label={toUserError(health.error).isNetworkError ? 'Injoignable' : 'En erreur'}
    />
  ) : (
    <StatusBadge tone="success" label="Opérationnelle" />
  )

  const databaseBadge = health.data ? (
    health.data.database === 'ok' ? (
      <StatusBadge tone="success" label="Disponible" />
    ) : (
      <StatusBadge tone="error" label="Indisponible" />
    )
  ) : (
    <StatusBadge tone="neutral" label="Inconnue" />
  )

  return (
    <>
      <PageHeading
        eyebrow="Administration"
        title="État du système"
        description="Disponibilité de l’API et de la base de données."
        actions={
          <button
            type="button"
            className="secondary"
            onClick={() => void health.refetch()}
            disabled={health.isFetching}
          >
            {health.isFetching ? 'Vérification…' : 'Vérifier à nouveau'}
          </button>
        }
      />
      <Panel title="Services">
        <div className="panel-body pairs grid-pairs" aria-live="polite">
          <Pair label="API">{apiBadge}</Pair>
          <Pair label="Base de données">{databaseBadge}</Pair>
          <Pair label="Heure du serveur">
            {health.data ? formatDateTime(health.data.server_time) : '—'}
          </Pair>
        </div>
      </Panel>
    </>
  )
}
