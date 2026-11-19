import { PageOverview } from '../../../shared/ui/PageOverview'
import { Icon } from '../../../shared/ui/Icon'
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
        icon="settings"
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
            <Icon name="refresh" size={17} />
            {health.isFetching ? 'Vérification…' : 'Vérifier à nouveau'}
          </button>
        }
      />
      <PageOverview
        items={[
          {
            label: 'API',
            value: health.isPending
              ? undefined
              : health.isError
                ? toUserError(health.error).isNetworkError
                  ? 'Injoignable'
                  : 'En erreur'
                : 'Opérationnelle',
            hint: 'Dernier contrôle du service',
            icon: 'check',
          },
          {
            label: 'Base de données',
            value: health.data
              ? health.data.database === 'ok'
                ? 'Disponible'
                : 'Indisponible'
              : undefined,
            hint: 'Connexion vérifiée par le serveur',
            icon: 'layers',
          },
          {
            label: 'Heure du serveur',
            value: health.data ? formatDateTime(health.data.server_time) : undefined,
            hint: 'Horloge de l’application',
            icon: 'clock',
          },
          {
            label: 'Version API',
            value: health.data?.api_version,
            hint: health.data?.application ?? 'Service de l’application',
            icon: 'settings',
          },
        ]}
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
