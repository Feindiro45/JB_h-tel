import { RESERVATION_STATUS_LABELS, ROOM_STATE_LABELS } from './statusLabels'

export type BadgeTone = 'green' | 'blue' | 'amber' | 'red' | 'neutral'

/** Pastille + libellé : le statut n'est jamais porté par la seule couleur (charte 05). */
export function Badge({ tone = 'neutral', label }: { tone?: BadgeTone; label: string }) {
  return (
    <span className={`badge badge--${tone}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  )
}

const RESERVATION_TONES: Record<string, BadgeTone> = {
  PENDING: 'amber',
  CONFIRMED: 'blue',
  IN_PROGRESS: 'green',
  COMPLETED: 'neutral',
  CANCELLED: 'red',
}

export function ReservationStatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <Badge
      tone={RESERVATION_TONES[status] ?? 'neutral'}
      label={label ?? RESERVATION_STATUS_LABELS[status] ?? status}
    />
  )
}

const ROOM_TONES: Record<string, BadgeTone> = {
  FREE: 'green',
  RESERVED: 'blue',
  OCCUPIED: 'red',
  MAINTENANCE: 'amber',
}

export function RoomStateBadge({ state }: { state: string }) {
  return <Badge tone={ROOM_TONES[state] ?? 'neutral'} label={ROOM_STATE_LABELS[state] ?? state} />
}
