import { describe, expect, it } from 'vitest'
import { eventRoomMismatch, eventView, organizerLabel } from './organizers'

const hall = { number: 'SALLE-A', room_type: { kind: 'CONFERENCE' as const } }
const bedroom = { number: '101', room_type: { kind: 'ROOM' as const } }
const event = {
  name: 'Atelier',
  organizer_type: 'NGO' as const,
  organization_name: 'Santé pour tous',
}

describe('Salle de conférence hors ligne (D-072)', () => {
  it('applique la même règle que le serveur : événement pour une salle, occupants pour une chambre', () => {
    expect(eventRoomMismatch(hall, null)?.fieldErrors).toHaveProperty('event.name')
    expect(eventRoomMismatch(bedroom, event)?.fieldErrors).toHaveProperty('event')
    expect(eventRoomMismatch(hall, event)).toBeNull()
    expect(eventRoomMismatch(bedroom, null)).toBeNull()
    // Une copie locale gardée avant D-072 n'a pas la nature : c'est une chambre.
    expect(eventRoomMismatch({ number: '102' }, null)).toBeNull()
  })

  it('affiche l’événement provisoire comme le serveur', () => {
    expect(organizerLabel('OTHER', 'Coopérative agricole')).toBe('Coopérative agricole')
    expect(organizerLabel('INTERNATIONAL_ORGANIZATION')).toBe('Organisation internationale')
    expect(
      eventView({ ...event, organizer_type: 'INDIVIDUAL', contact_phone: '+236 75 11 22 33' }),
    ).toEqual({
      name: 'Atelier',
      organizer_type: 'INDIVIDUAL',
      organizer_type_label: 'Particulier',
      organizer_type_other: null,
      organization_name: null,
      contact_name: null,
      contact_phone: '+236 75 11 22 33',
    })
  })
})
