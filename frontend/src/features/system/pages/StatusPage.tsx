import { useQuery } from '@tanstack/react-query'
import { toUserError } from '../../../shared/api/errors'
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
    <section className="card" aria-labelledby="status-title">
      <h1 id="status-title">État du système</h1>
      <p className="muted">
        Socle technique (phase 1). Les modules métier arrivent aux phases suivantes.
      </p>
      <dl className="status-list" aria-live="polite">
        <div>
          <dt>API</dt>
          <dd>{apiBadge}</dd>
        </div>
        <div>
          <dt>Base de données</dt>
          <dd>{databaseBadge}</dd>
        </div>
        <div>
          <dt>Heure du serveur</dt>
          <dd>{health.data ? formatDateTime(health.data.server_time) : '—'}</dd>
        </div>
      </dl>
      <button
        type="button"
        className="button button--secondary"
        onClick={() => void health.refetch()}
        disabled={health.isFetching}
      >
        {health.isFetching ? 'Vérification…' : 'Vérifier à nouveau'}
      </button>
    </section>
  )
}
