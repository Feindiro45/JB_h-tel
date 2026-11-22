import { ExportButton } from '../../shared/ui/ExportButton'
import { LocalTable } from '../../shared/ui/LocalTable'
import { PageOverview } from '../../shared/ui/PageOverview'
import { Icon } from '../../shared/ui/Icon'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Room, RoomType } from '../../shared/api/types'
import { SelectField, TextField } from '../../shared/ui/fields'
import { EmptyState, LoadingBlock, PageHeading, Panel } from '../../shared/ui/layout'
import { Pagination } from '../../shared/ui/Pagination'
import { useTable } from '../../shared/ui/useTable'
import { roomsQuery, roomTypesQuery } from '../catalog'
import { useCurrentUser } from '../auth'
import { occupancyQuery } from '../reservations'
import { RoomStateBadge } from '../../shared/ui/Badge'
import { DeleteDialog } from '../../shared/ui/DeleteDialog'
import { EditDialog, type EditField } from './EditDialog'

export function RoomsPage() {
  const { can } = useCurrentUser()
  const occupancy = useQuery({ ...occupancyQuery, enabled: can('reservations.view') })
  const states = new Map(occupancy.data?.data.map((row) => [row.room.id, row.state]))
  const rooms = useQuery(roomsQuery)
  const types = useQuery(roomTypesQuery)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [occupation, setOccupation] = useState('')
  const [deleting, setDeleting] = useState<{ path: string; title: string; text: string } | null>(
    null,
  )
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<{
    kind: 'room' | 'type' | 'maintenance'
    room?: Room
    category?: RoomType
  } | null>(null)
  const table = useTable(
    (rooms.data ?? []).filter(
      (r) =>
        r.number.toLowerCase().includes(search.toLowerCase()) &&
        (!type || r.room_type.id === type) &&
        (!status || r.maintenance_status === status) &&
        (!occupation || states.get(r.id) === occupation),
    ),
  )
  const typeFields: EditField[] = [
    {
      name: 'code',
      label: 'Code',
      required: true,
      pattern: '[A-Z0-9_]{2,30}',
      hint: 'Majuscules, chiffres ou « _ », 2 à 30 caractères (ex. VIP). Il ne pourra plus être modifié.',
    },
    { name: 'label', label: 'Libellé', required: true, maxLength: 100 },
    { name: 'description', label: 'Description', type: 'textarea', maxLength: 2000 },
  ]
  // Le code d'une catégorie existante est figé côté serveur (`prohibited`) : on ne le renvoie pas.
  const typeEditFields = typeFields.filter((field) => field.name !== 'code')
  const roomFields: EditField[] = [
    { name: 'number', label: 'Numéro', required: true, pattern: '[A-Za-z0-9-]{1,30}' },
    {
      name: 'room_type_id',
      label: 'Catégorie',
      required: true,
      options: (types.data ?? []).map((t) => ({ value: t.id, label: t.label })),
    },
    { name: 'capacity', label: 'Capacité', type: 'number', min: 1, max: 50, required: true },
    { name: 'notes', label: 'Notes', type: 'textarea', maxLength: 2000 },
  ]
  return (
    <>
      <PageHeading
        icon="rooms"
        eyebrow="Administration"
        title="Chambres et catégories"
        actions={
          <>
            <ExportButton path="/api/v1/room-catalog/export" module="chambres-tarifs" />
            <button className="secondary" onClick={() => setDialog({ kind: 'type' })}>
              <Icon name="plus" size={17} />
              <span className="sr-only">+</span> Catégorie
            </button>
            <button className="primary" onClick={() => setDialog({ kind: 'room' })}>
              <Icon name="plus" size={17} />
              <span className="sr-only">+</span> Chambre
            </button>
          </>
        }
      />
      <PageOverview
        items={[
          {
            label: 'Chambres',
            value: rooms.data?.length,
            hint: 'Ensemble du catalogue',
            icon: 'rooms',
          },
          {
            label: 'Libres maintenant',
            value: can('reservations.view')
              ? occupancy.data?.data.filter((r) => r.state === 'FREE').length
              : 'Accès limité',
            hint: 'Occupation calculée à cet instant',
            icon: 'check',
          },
          {
            label: 'Occupées',
            value: can('reservations.view')
              ? occupancy.data?.data.filter((r) => r.state === 'OCCUPIED').length
              : 'Accès limité',
            hint: 'Séjours en cours maintenant',
            icon: 'rooms',
            tone: 'red',
          },
          {
            label: 'Maintenance',
            value: rooms.data?.filter((r) => r.maintenance_status === 'MAINTENANCE').length,
            hint: 'Chambres retirées du service',
            icon: 'tool',
          },
        ]}
      />
      <Panel title="Chambres">
        <div className="filterbar">
          <TextField
            label="Recherche"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <SelectField label="Catégorie" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Toutes</option>
            {types.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Maintenance"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Tous les états</option>
            <option value="AVAILABLE">Disponible</option>
            <option value="MAINTENANCE">En maintenance</option>
          </SelectField>
          {can('reservations.view') && (
            <SelectField
              label="Occupation"
              value={occupation}
              onChange={(e) => {
                setOccupation(e.target.value)
                table.onPage(1)
              }}
            >
              <option value="">Tous les états</option>
              <option value="FREE">Libres</option>
              <option value="RESERVED">Réservées</option>
              <option value="OCCUPIED">Occupées</option>
              <option value="MAINTENANCE">Maintenance</option>
            </SelectField>
          )}
        </div>
        {rooms.isPending ? (
          <LoadingBlock />
        ) : table.rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Chambre</th>
                  <th>Catégorie</th>
                  <th>Capacité</th>
                  <th>État</th>
                  {can('reservations.view') && <th>Occupation actuelle</th>}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.number}</td>
                    <td>{r.room_type.label}</td>
                    <td>{r.capacity}</td>
                    <td>
                      {r.maintenance_label}
                      <small>{r.maintenance_note}</small>
                    </td>
                    {can('reservations.view') && (
                      <td>
                        {states.get(r.id) ? <RoomStateBadge state={states.get(r.id)!} /> : '—'}
                      </td>
                    )}
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setDialog({ kind: 'room', room: r })}
                      >
                        <Icon name="edit" size={17} />
                        Modifier
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setDialog({ kind: 'maintenance', room: r })}
                      >
                        <Icon name="tool" size={17} />
                        Maintenance
                      </button>
                      {can('records.delete') && (
                        <button
                          className="text-button text-button--danger"
                          onClick={() =>
                            setDeleting({
                              path: `/api/v1/rooms/${r.id}`,
                              title: 'Supprimer la chambre',
                              text: `La chambre ${r.number} sera supprimée. Seule une chambre jamais réservée peut l’être ; sinon, mettez-la en maintenance.`,
                            })
                          }
                          aria-label={`Supprimer la chambre ${r.number}`}
                        >
                          <Icon name="trash" size={17} />
                          Supprimer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination {...table} />
      </Panel>
      <Panel title="Catégories">
        <LocalTable
          label="catégories"
          rows={types.data ?? []}
          searchText={(r) => `${r.code} ${r.label} ${r.description ?? ''}`}
        >
          {(visibleRows) => (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Libellé</th>
                    <th>Chambres</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((t) => (
                    <tr key={t.id}>
                      <td>{t.code}</td>
                      <td>{t.label}</td>
                      <td>{t.rooms_count ?? 0}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => setDialog({ kind: 'type', category: t })}
                        >
                          <Icon name="edit" size={17} />
                          Modifier
                        </button>
                        {can('records.delete') && (
                          <button
                            className="text-button text-button--danger"
                            onClick={() =>
                              setDeleting({
                                path: `/api/v1/room-types/${t.id}`,
                                title: 'Supprimer la catégorie',
                                text: `La catégorie ${t.label} sera supprimée. Seule une catégorie sans chambre ni tarif publié peut l’être.`,
                              })
                            }
                            aria-label={`Supprimer la catégorie ${t.label}`}
                          >
                            <Icon name="trash" size={17} />
                            Supprimer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </LocalTable>
      </Panel>
      {dialog && (
        <EditDialog
          title={
            dialog.kind === 'maintenance'
              ? `Maintenance · chambre ${dialog.room?.number}`
              : dialog.kind === 'type'
                ? dialog.category
                  ? `Catégorie ${dialog.category.code}`
                  : 'Nouvelle catégorie de chambre'
                : dialog.room
                  ? `Chambre ${dialog.room.number}`
                  : 'Nouvelle chambre'
          }
          path={
            dialog.kind === 'maintenance'
              ? `rooms/${dialog.room!.id}/maintenance`
              : dialog.kind === 'type'
                ? `room-types${dialog.category ? `/${dialog.category.id}` : ''}`
                : `rooms${dialog.room ? `/${dialog.room.id}` : ''}`
          }
          method={
            dialog.kind === 'maintenance'
              ? 'put'
              : dialog.room || dialog.category
                ? 'patch'
                : 'post'
          }
          fields={
            dialog.kind === 'type'
              ? dialog.category
                ? typeEditFields
                : typeFields
              : dialog.kind === 'room'
                ? roomFields
                : [
                    {
                      name: 'status',
                      label: 'État',
                      required: true,
                      options: [
                        { value: 'AVAILABLE', label: 'Disponible' },
                        { value: 'MAINTENANCE', label: 'En maintenance' },
                      ],
                    },
                    {
                      name: 'note',
                      label: 'Note de maintenance',
                      type: 'textarea',
                      maxLength: 255,
                    },
                  ]
          }
          initial={
            dialog.kind === 'maintenance'
              ? {
                  status: dialog.room!.maintenance_status,
                  note: dialog.room!.maintenance_note ?? '',
                }
              : dialog.category
                ? {
                    label: dialog.category.label,
                    description: dialog.category.description ?? '',
                  }
                : dialog.room
                  ? {
                      number: dialog.room.number,
                      room_type_id: dialog.room.room_type.id,
                      capacity: String(dialog.room.capacity),
                      notes: dialog.room.notes ?? '',
                    }
                  : { capacity: '2' }
          }
          transform={(v) =>
            dialog.kind === 'room'
              ? { ...v, capacity: Number(v.capacity), notes: v.notes || null }
              : v
          }
          onClose={() => setDialog(null)}
        />
      )}
      {deleting && (
        <DeleteDialog
          title={deleting.title}
          path={deleting.path}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            void queryClient.invalidateQueries({ queryKey: ['catalog'] })
            setDeleting(null)
          }}
        >
          {deleting.text}
        </DeleteDialog>
      )}
    </>
  )
}
