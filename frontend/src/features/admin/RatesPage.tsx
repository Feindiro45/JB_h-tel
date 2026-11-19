import { LocalTable } from '../../shared/ui/LocalTable'
import { PageOverview } from '../../shared/ui/PageOverview'
import { Icon } from '../../shared/ui/Icon'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { SelectField } from '../../shared/ui/fields'
import { EmptyState, LoadingBlock, PageHeading, Panel } from '../../shared/ui/layout'
import { Pagination } from '../../shared/ui/Pagination'
import { useTable } from '../../shared/ui/useTable'
import { formatDateTime, formatFcfa } from '../../shared/utils/format'
import { roomTypesQuery } from '../catalog'
import { adminQuery, type Rate, type Rates } from './api'
import { EditDialog } from './EditDialog'

export function RatesPage() {
  const types = useQuery(roomTypesQuery)
  const [category, setCategory] = useState('')
  const [unit, setUnit] = useState('')
  const [status, setStatus] = useState('')
  const rates = useQuery(
    adminQuery<Rates>('room-rates', { room_type_id: category, billing_unit: unit }),
  )
  const grid = useQuery(
    adminQuery<{
      data: {
        room_type: { id: string; label: string }
        rates: Record<string, { current: Rate | null; next: Rate | null }>
      }[]
    }>('room-rates/grid'),
  )
  const [publishing, setPublishing] = useState(false)
  const [withdraw, setWithdraw] = useState<Rate | null>(null)
  const table = useTable((rates.data?.data ?? []).filter((r) => !status || r.status === status))
  return (
    <>
      <PageHeading
        icon="cash"
        eyebrow="Administration"
        title="Tarifs"
        description="Les nouvelles versions préservent les prix des séjours et des factures existants."
        actions={
          <button className="primary" onClick={() => setPublishing(true)}>
            <Icon name="plus" size={17} />
            Publier un tarif
          </button>
        }
      />
      <PageOverview
        items={[
          {
            label: 'Tarifs en vigueur',
            value: grid.data
              ? grid.data.data.reduce(
                  (n, g) => n + Object.values(g.rates).filter((r) => r.current).length,
                  0,
                )
              : undefined,
            hint: 'Ensemble de la grille actuelle',
            icon: 'cash',
          },
          {
            label: 'Programmés',
            value: grid.data
              ? grid.data.data.reduce(
                  (n, g) => n + Object.values(g.rates).filter((r) => r.next).length,
                  0,
                )
              : undefined,
            hint: 'Prochain tarif par catégorie et forfait',
            icon: 'calendar',
          },
          {
            label: 'Catégories',
            value: grid.data?.data.length,
            hint: 'Catégories de la grille',
            icon: 'layers',
          },
          {
            label: 'Versions filtrées',
            value: rates.data ? table.meta.total : undefined,
            hint: 'Historique selon les filtres actifs',
            icon: 'document',
          },
        ]}
      />
      <Panel title="Grille tarifaire">
        <LocalTable
          label="grille tarifaire"
          rows={
            grid.data?.data.flatMap((g) =>
              Object.entries(g.rates).map(([unit, cell]) => ({
                category: g.room_type.label,
                unit,
                cell,
                id: `${g.room_type.id}-${unit}`,
              })),
            ) ?? []
          }
          searchText={(r) =>
            `${r.category} ${r.unit === 'DAY' ? 'Journée' : 'Demi-journée'} ${r.cell.current?.amount_fcfa ?? 'Non défini'} ${r.cell.next?.amount_fcfa ?? ''}`
          }
        >
          {(visibleRows) => (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Catégorie</th>
                    <th>Forfait</th>
                    <th>En vigueur</th>
                    <th>Prochain tarif</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(({ category, unit, cell, id }) => (
                    <tr key={id}>
                      <td>{category}</td>
                      <td>{unit === 'DAY' ? 'Journée' : 'Demi-journée'}</td>
                      <td>{cell.current ? formatFcfa(cell.current.amount_fcfa) : 'Non défini'}</td>
                      <td>
                        {cell.next
                          ? `${formatFcfa(cell.next.amount_fcfa)} · ${formatDateTime(cell.next.effective_from)}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </LocalTable>
      </Panel>
      <Panel title="Historique des versions">
        <div className="filterbar">
          <SelectField
            label="Catégorie"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Toutes</option>
            {types.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </SelectField>
          <SelectField label="Forfait" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="">Tous</option>
            <option value="HALF_DAY">Demi-journée</option>
            <option value="DAY">Journée</option>
          </SelectField>
          <SelectField label="Statut" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tous</option>
            <option value="ACTIVE">En vigueur</option>
            <option value="SCHEDULED">Programmé</option>
            <option value="EXPIRED">Expiré</option>
          </SelectField>
        </div>
        {rates.isPending ? (
          <LoadingBlock />
        ) : table.rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Catégorie</th>
                  <th>Forfait</th>
                  <th>Ancien tarif</th>
                  <th>Nouveau tarif</th>
                  <th>Effet</th>
                  <th>État</th>
                  <th>Motif / auteur</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.room_type.label}</td>
                    <td>{r.billing_unit_label}</td>
                    <td>
                      {r.previous_amount_fcfa === null ? '—' : formatFcfa(r.previous_amount_fcfa)}
                    </td>
                    <td>{formatFcfa(r.amount_fcfa)}</td>
                    <td>{formatDateTime(r.effective_from)}</td>
                    <td>{r.status_label}</td>
                    <td>
                      {r.reason}
                      <small>{r.created_by?.name}</small>
                    </td>
                    <td>
                      {r.withdrawable && (
                        <button
                          className="text-button text-button--danger"
                          onClick={() => setWithdraw(r)}
                        >
                          <Icon name="trash" size={17} />
                          Retirer
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
      {publishing && (
        <EditDialog
          title="Publier une version tarifaire"
          path="room-rates"
          fields={[
            {
              name: 'room_type_id',
              label: 'Catégorie',
              required: true,
              options: (types.data ?? []).map((t) => ({ value: t.id, label: t.label })),
            },
            {
              name: 'billing_unit',
              label: 'Forfait',
              required: true,
              options: [
                { value: 'HALF_DAY', label: 'Demi-journée' },
                { value: 'DAY', label: 'Journée' },
              ],
            },
            {
              name: 'amount_fcfa',
              label: 'Montant (FCFA)',
              type: 'number',
              required: true,
              min: 0,
              max: 1000000000,
            },
            {
              name: 'effective_from',
              label: 'Date d’effet (heure de l’hôtel)',
              type: 'datetime-local',
              hint: 'Laisser vide pour une application immédiate.',
            },
            { name: 'reason', label: 'Motif', required: true, maxLength: 255 },
          ]}
          transform={(v) => ({
            ...v,
            amount_fcfa: Number(v.amount_fcfa),
            effective_from: v.effective_from || null,
          })}
          onClose={() => setPublishing(false)}
        />
      )}
      {withdraw && (
        <EditDialog
          title={`Retirer le tarif programmé de ${formatFcfa(withdraw.amount_fcfa)} ?`}
          path={`room-rates/${withdraw.id}`}
          method="delete"
          fields={[]}
          onClose={() => setWithdraw(null)}
        />
      )}
    </>
  )
}
