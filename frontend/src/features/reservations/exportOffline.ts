import type { QueryClient } from '@tanstack/react-query'
import type { Reservation, RoomType } from '../../shared/api/types'
import { groupRows, monthlyRows, type LocalWorkbookSpec } from '../../shared/export/localWorkbook'
import { formatDate } from '../../shared/utils/format'
import type { ReservationFilters } from './api'
import { knownStays } from './offlineBooking'

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmée',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Mêmes filtres que la liste du serveur (`ReservationSearch`), sur les séjours gardés. */
export function filterKeptStays(
  stays: Reservation[],
  filters: ReservationFilters,
  types: RoomType[] = [],
): Reservation[] {
  const typeCode = filters.room_type_id
    ? types.find((type) => type.id === filters.room_type_id)?.code
    : undefined
  const search = filters.search ? normalize(filters.search.trim()) : ''
  return (
    stays
      .filter((s) => !filters.status || s.status === filters.status)
      .filter((s) => !filters.room_id || s.room?.id === filters.room_id)
      .filter((s) => !filters.customer_id || s.customer?.id === filters.customer_id)
      .filter((s) => !filters.billing_unit || s.price.billing_unit === filters.billing_unit)
      .filter((s) => !filters.room_type_id || s.room?.room_type.code === typeCode)
      .filter(
        (s) =>
          !search ||
          normalize(`${s.customer?.full_name ?? ''} ${s.customer?.phone ?? ''}`).includes(search),
      )
      // Période qui chevauche `from`–`to` (comme le serveur).
      .filter((s) => !filters.from || s.period.end_date >= filters.from)
      .filter((s) => !filters.to || s.period.start_date <= filters.to)
      .sort((a, b) => b.period.blocked_from.localeCompare(a.period.blocked_from))
  )
}

/** Classeur simplifié des réservations gardées sur le poste (export sans réseau). */
export function reservationsOfflineWorkbook(
  client: QueryClient,
  filters: ReservationFilters,
): LocalWorkbookSpec {
  const types = client.getQueryData<RoomType[]>(['room-types']) ?? []
  const stays = filterKeptStays(knownStays(client), filters, types)
  const active = stays.filter((s) => s.status !== 'CANCELLED')
  const sum = (list: Reservation[], value: (s: Reservation) => number) =>
    list.reduce((total, s) => total + value(s), 0)
  const count = (status: string) => stays.filter((s) => s.status === status).length
  const cancelled = count('CANCELLED')
  const context = [
    filters.status && `Statut : ${STATUS_LABELS[filters.status] ?? filters.status}`,
    filters.from && `Du : ${formatDate(filters.from)}`,
    filters.to && `Au : ${formatDate(filters.to)}`,
    filters.search && `Recherche : ${filters.search}`,
    filters.billing_unit &&
      `Forfait : ${filters.billing_unit === 'DAY' ? 'Journée' : 'Demi-journée'}`,
  ].filter(Boolean) as string[]

  return {
    title: 'Réservations',
    module: 'reservations',
    context,
    kpis: [
      { label: 'Réservations', value: stays.length, format: 'int', hint: 'Gardées sur ce poste' },
      {
        label: 'Montant net des séjours',
        value: sum(active, (s) => s.price.net_fcfa),
        format: 'fcfa',
        hint: 'Hors réservations annulées',
      },
      {
        label: 'Remises accordées',
        value: sum(active, (s) => s.price.discount_fcfa),
        format: 'fcfa',
        hint: 'Sur les séjours non annulés',
      },
      {
        label: 'Forfaits vendus',
        value: sum(active, (s) => s.price.quantity),
        format: 'int',
        hint: 'Journées et demi-journées',
      },
      { label: 'En cours', value: count('IN_PROGRESS'), format: 'int', hint: 'Clients présents' },
      {
        label: 'À venir',
        value: count('CONFIRMED') + count('PENDING'),
        format: 'int',
        hint: 'Confirmées ou en attente',
      },
      { label: 'Terminées', value: count('COMPLETED'), format: 'int', hint: 'Départ enregistré' },
      {
        label: 'Taux d’annulation',
        value: stays.length === 0 ? 0 : cancelled / stays.length,
        format: 'percent',
        hint: `${cancelled} annulée(s)`,
      },
    ],
    summaries: [
      {
        heading: 'Réservations par statut',
        valueLabel: 'Réservations',
        rows: groupRows(stays, (s) => s.status_label),
      },
      {
        heading: 'Montant net par catégorie de chambre',
        valueLabel: 'Montant net',
        format: 'fcfa',
        rows: groupRows(
          active,
          (s) => s.room?.room_type.label ?? 'Sans chambre',
          (s) => s.price.net_fcfa,
        ),
      },
      {
        heading: 'Arrivées par mois',
        valueLabel: 'Réservations',
        rows: monthlyRows(stays, (s) => s.period.start_date),
      },
    ],
    note: 'Montants en FCFA entiers, tels qu’enregistrés à la confirmation (tarif figé). Une réservation annulée ne doit plus rien.',
    sheets: [
      {
        name: 'Réservations',
        description: 'Un séjour par ligne ; filtres et totaux automatiques',
        columns: [
          { label: 'Client', width: 26 },
          { label: 'Téléphone', width: 16 },
          { label: 'Chambre', width: 10 },
          { label: 'Catégorie', width: 14 },
          { label: 'Arrivée', type: 'date' },
          { label: 'Heure d’arrivée', width: 10 },
          { label: 'Départ', type: 'date' },
          { label: 'Heure de départ', width: 10 },
          { label: 'Forfait', width: 14 },
          { label: 'Quantité', type: 'int' },
          { label: 'Prix unitaire', type: 'fcfa', total: false },
          { label: 'Brut', type: 'fcfa' },
          { label: 'Remise', type: 'fcfa' },
          { label: 'Motif de la remise', width: 24 },
          { label: 'Net', type: 'fcfa' },
          { label: 'Montant dû', type: 'fcfa' },
          { label: 'Statut', width: 14 },
          { label: 'Arrivée réelle', type: 'datetime' },
          { label: 'Départ réel', type: 'datetime' },
          { label: 'Créée le', type: 'datetime' },
          { label: 'Motif d’annulation', width: 26 },
        ],
        rows: stays.map((s) => [
          s.customer?.full_name ?? '—',
          s.customer?.phone,
          s.room?.number,
          s.room?.room_type.label,
          s.period.start_date,
          s.period.start_time,
          s.period.end_date,
          s.period.end_time,
          s.price.billing_unit_label,
          s.price.quantity,
          s.price.unit_price_fcfa,
          s.price.gross_fcfa,
          s.price.discount_fcfa,
          s.price.discount?.reason,
          s.price.net_fcfa,
          s.price.amount_due_fcfa,
          s.status_label,
          s.checked_in_at,
          s.checked_out_at,
          s.created_at,
          s.cancellation_reason,
        ]),
      },
      {
        name: 'Occupants',
        description: 'Personnes hébergées par séjour',
        columns: [
          { label: 'Occupant', width: 26 },
          { label: 'Rôle', width: 12 },
          { label: 'Client du séjour', width: 26 },
          { label: 'Chambre', width: 10 },
          { label: 'Arrivée', type: 'date' },
          { label: 'Départ', type: 'date' },
          { label: 'Statut', width: 14 },
        ],
        rows: stays.flatMap((s) =>
          (s.occupants ?? []).map((o) => [
            o.name,
            o.is_primary ? 'Titulaire' : 'Occupant',
            s.customer?.full_name ?? '—',
            s.room?.number,
            s.period.start_date,
            s.period.end_date,
            s.status_label,
          ]),
        ),
      },
    ],
  }
}
