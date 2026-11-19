import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { RoomStateBadge } from '../../shared/ui/Badge'
import { SelectField, TextField } from '../../shared/ui/fields'
import { EmptyState, LoadingBlock, PageHeading, Panel } from '../../shared/ui/layout'
import { formatWeekday, todayIso } from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import { roomTypesQuery } from '../catalog'
import { planningQuery } from './api'
import { NewReservationDialog } from './NewReservationDialog'

/** Disponibilités : état calculé de chaque chambre, jour par jour (jamais un booléen saisi à la main). */
export function PlanningPage() {
  const { can } = useCurrentUser()
  const today = todayIso()
  const [from, setFrom] = useState(today)
  const [days, setDays] = useState(7)
  const [typeId, setTypeId] = useState('')
  const [creating, setCreating] = useState(false)
  const types = useQuery(roomTypesQuery)
  const planning = useQuery(planningQuery(from || today, days, typeId))

  return (
    <>
      <PageHeading
        eyebrow="Exploitation"
        title="Disponibilités"
        description="Consultez l’état de chaque chambre et préparez les arrivées."
        actions={
          can('reservations.create') && (
            <button type="button" className="primary" onClick={() => setCreating(true)}>
              + Nouvelle réservation
            </button>
          )
        }
      />
      <Panel
        title="Planning par chambre"
        subtitle="Libre, réservée, occupée ou en maintenance, pour chaque journée"
      >
        <div className="filterbar">
          <TextField
            label="À partir du"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <SelectField
            label="Durée"
            value={String(days)}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value="7">7 jours</option>
            <option value="14">14 jours</option>
          </SelectField>
          <SelectField label="Catégorie" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">Toutes</option>
            {types.data?.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </SelectField>
        </div>
        {planning.isPending ? (
          <LoadingBlock />
        ) : planning.data && planning.data.data.length > 0 ? (
          <div className="table-wrap">
            <table className="planning">
              <thead>
                <tr>
                  <th scope="col">Chambre</th>
                  {planning.data.days.map((day) => (
                    <th key={day} scope="col" className={day === today ? 'today' : undefined}>
                      {formatWeekday(day)}
                      {day === today && <span className="sr-only"> (aujourd’hui)</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {planning.data.data.map(({ room, days: states }) => (
                  <tr key={room.id}>
                    <th scope="row">
                      <strong>{room.number}</strong>
                      <small style={{ display: 'block' }}>
                        {room.room_type.label} · {room.capacity} pers.
                      </small>
                    </th>
                    {planning.data.days.map((day) => (
                      <td key={day}>
                        <RoomStateBadge state={states[day]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Aucune chambre">Aucune chambre ne correspond à ce filtre.</EmptyState>
        )}
      </Panel>
      {creating && <NewReservationDialog onClose={() => setCreating(false)} />}
    </>
  )
}
