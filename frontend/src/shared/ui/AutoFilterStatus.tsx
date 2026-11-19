import { Icon } from './Icon'

export function AutoFilterStatus({ pending, valid }: { pending: boolean; valid: boolean }) {
  return (
    <p
      className={`auto-filter-status${valid ? '' : ' auto-filter-status--warning'}`}
      role="status"
      aria-live="polite"
    >
      <Icon
        name={valid ? (pending ? 'loader' : 'check') : 'calendar'}
        size={15}
        className={pending ? 'is-spinning' : undefined}
      />
      {!valid
        ? 'Complétez une période valide pour actualiser les résultats.'
        : pending
          ? 'Mise à jour après la saisie…'
          : 'Filtres appliqués automatiquement'}
    </p>
  )
}
