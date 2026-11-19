export type StatusTone = 'success' | 'warning' | 'error' | 'neutral'

const SYMBOLS: Record<StatusTone, string> = {
  success: '✓',
  warning: '!',
  error: '✕',
  neutral: '…',
}

/** Badge de statut : le libellé et le symbole portent le sens, la couleur n'est qu'un renfort. */
export function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span className={`badge badge--${tone}`}>
      <span aria-hidden="true">{SYMBOLS[tone]}</span> {label}
    </span>
  )
}
