import { ApiError } from '../../shared/api/errors'
import { isConferenceRoom, type OrganizerType, type ReservationEvent } from '../../shared/api/types'

/** Types d'occupant d'une salle de conférence (D-072), dans l'ordre du serveur (`OrganizerType`). */
export const ORGANIZER_TYPES: { value: OrganizerType; label: string }[] = [
  { value: 'NGO', label: 'ONG' },
  { value: 'INTERNATIONAL_ORGANIZATION', label: 'Organisation internationale' },
  { value: 'COMPANY', label: 'Entreprise' },
  { value: 'PUBLIC_ADMINISTRATION', label: 'Administration publique' },
  { value: 'ASSOCIATION', label: 'Association / confession religieuse' },
  { value: 'INDIVIDUAL', label: 'Particulier' },
  { value: 'OTHER', label: 'Autre' },
]

/** Saisie de l'événement envoyée avec la réservation d'une salle (`event` de l'API). */
export interface EventInput {
  name: string
  organizer_type: OrganizerType
  organizer_type_other?: string | null
  organization_name?: string | null
  contact_name?: string | null
  contact_phone?: string | null
}

/** Libellé lisible du type d'occupant (« Autre » remplacé par sa précision), comme le serveur. */
export function organizerLabel(type: OrganizerType, other?: string | null): string {
  if (type === 'OTHER' && other) return other
  return ORGANIZER_TYPES.find((item) => item.value === type)?.label ?? type
}

/** Événement affiché sur une réservation gardée sur le poste, en attendant le serveur. */
export function eventView(input: EventInput): ReservationEvent {
  const individual = input.organizer_type === 'INDIVIDUAL'
  return {
    name: input.name,
    organizer_type: input.organizer_type,
    organizer_type_label: organizerLabel(input.organizer_type, input.organizer_type_other),
    organizer_type_other:
      input.organizer_type === 'OTHER' ? (input.organizer_type_other ?? null) : null,
    organization_name: individual ? null : (input.organization_name ?? null),
    contact_name: input.contact_name ?? null,
    contact_phone: input.contact_phone ?? null,
  }
}

/**
 * Même règle que le serveur (`ReservationBookingService::assertEventMatchesRoom`) : une salle de
 * conférence se réserve pour un événement, une chambre pour des occupants. Sert hors ligne.
 */
export function eventRoomMismatch(
  room: { number: string; room_type?: { kind?: 'ROOM' | 'CONFERENCE' } },
  event: EventInput | null | undefined,
): ApiError | null {
  if (isConferenceRoom(room) && !event) {
    return new ApiError(
      422,
      'Événement manquant',
      `La salle ${room.number} est une salle de conférence : indiquez l’événement, son type d’occupant et l’organisation.`,
      { 'event.name': ['Indiquez le nom de l’événement.'] },
      null,
    )
  }
  if (!isConferenceRoom(room) && event) {
    return new ApiError(
      422,
      'Chambre et événement',
      `La chambre ${room.number} n’est pas une salle de conférence : indiquez ses occupants, sans événement.`,
      { event: ['Les informations d’événement concernent seulement les salles de conférence.'] },
      null,
    )
  }
  return null
}
