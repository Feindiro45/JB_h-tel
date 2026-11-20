import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Icon } from '../../shared/ui/Icon'
import { useCurrentUser } from '../auth'
import { alertSummaryQuery } from './alerts'

/** Compteur réel, commun au menu d'alertes et à la page ; aucune donnée sans permission. */
export function AlertLink() {
  const { can } = useCurrentUser()
  const summary = useQuery({ ...alertSummaryQuery, enabled: can('reservations.view') })
  if (!can('reservations.view')) return null
  const total = summary.data?.total
  return (
    <Link
      to="/alertes"
      className="alert-link"
      aria-label={
        total === undefined
          ? 'Alertes — chargement'
          : `Alertes : ${total} départ${total > 1 ? 's' : ''} dépassé${total > 1 ? 's' : ''}`
      }
    >
      <Icon name="bell" size={21} />
      <span className="alert-link__label">Alertes</span>
      {total !== undefined && total > 0 && (
        <span className="alert-link__count">{total > 99 ? '99+' : total}</span>
      )}
      {summary.isError && <span className="sr-only"> — indisponibles</span>}
    </Link>
  )
}
