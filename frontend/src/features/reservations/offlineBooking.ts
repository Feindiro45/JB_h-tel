import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'
import type {
  AccountSummary,
  Customer,
  ExtensionPreview,
  PriceView,
  OccupancyRow,
  Planning,
  Quote,
  Reservation,
  ReservationBrief,
  Room,
  RoomBrief,
  RoomState,
  RoomType,
} from '../../shared/api/types'
import { config } from '../../shared/config'
import { registerOfflineEssential } from '../../shared/offline/essentials'
import { formatDateTime, formatFcfa } from '../../shared/utils/format'
import { roomsQuery } from '../catalog'
import { calendarDaysBetween } from './calendarDays'
import { eventView, type EventInput } from './organizers'

/**
 * Réservation sans réseau (lot 4, 4.5) : le poste calcule chambres libres, prix et conflits à
 * partir des tarifs, des chambres et des réservations gardés, avec les règles du serveur
 * (intervalle bloqué D-009, départ dépassé D-056, demi-journée D-007, remise D-008, jours D-055).
 * Le serveur revérifie tout à l'envoi : son refus éventuel est gardé avec sa cause (D-064).
 */
type Unit = 'DAY' | 'HALF_DAY'

interface RateView {
  id: string
  amount_fcfa: number
  effective_from: string
  effective_to: string | null
}

export interface RateGridRow {
  room_type: RoomType
  rates: Partial<Record<Unit, { current: RateView | null; next: RateView | null }>>
}

/** Grille des tarifs en vigueur et à venir, gardée sur le poste pour les devis hors ligne. */
export const rateGridQuery = queryOptions({
  queryKey: ['rates', 'grid'],
  queryFn: async ({ signal }) =>
    (await api.get<{ data: RateGridRow[] }>('/api/v1/room-rates/grid', { signal })).data,
  staleTime: 5 * 60_000,
})
registerOfflineEssential('rates.view', () => rateGridQuery)

export const UNIT_LABELS: Record<Unit, string> = { DAY: 'Journée', HALF_DAY: 'Demi-journée' }
const BLOCKING = ['PENDING', 'CONFIRMED', 'IN_PROGRESS']
/** Durée couverte par une demi-journée (D-007, règle validée). */
const HALF_DAY_MINUTES = 12 * 60

// ---------- Heures de l'hôtel (fuseau configuré, Africa/Bangui par défaut)

function offsetAt(epoch: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(epoch))
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return asUtc - Math.floor(epoch / 60_000) * 60_000
}

/** Instant d'une date et d'une heure locales de l'hôtel. */
export function hotelTime(date: string, time: string, timeZone = config.timeZone): number {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  const guess = Date.UTC(y!, m! - 1, d!, h!, min!)
  const first = guess - offsetAt(guess, timeZone)
  return guess - offsetAt(first, timeZone)
}

/** ISO 8601 avec le décalage de l'hôtel, comme le serveur (« 2026-12-01T10:00:00+01:00 »). */
export function hotelIso(epoch: number, timeZone = config.timeZone): string {
  const offset = offsetAt(epoch, timeZone)
  const local = new Date(epoch + offset).toISOString().slice(0, 19)
  const minutes = Math.round(Math.abs(offset) / 60_000)
  const sign = offset < 0 ? '-' : '+'
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
  const mm = String(minutes % 60).padStart(2, '0')
  return `${local}${sign}${hh}:${mm}`
}

function nextDay(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`) + 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

export interface Interval {
  from: number
  until: number
  estimated: boolean
}

/** D-009 : sans heure d'arrivée, 00:00 du premier jour ; sans heure de départ, fin du dernier jour. */
export function stayInterval(
  startDate: string,
  endDate: string,
  startTime: string | null,
  endTime: string | null,
): Interval {
  return {
    from: hotelTime(startDate, startTime ?? '00:00'),
    until: endTime === null ? hotelTime(nextDay(endDate), '00:00') : hotelTime(endDate, endTime),
    estimated: startTime === null || endTime === null,
  }
}

const view = (interval: Interval) => ({
  blocked_from: hotelIso(interval.from),
  blocked_until: hotelIso(interval.until),
  is_estimated: interval.estimated,
})

// ---------- Données gardées sur le poste

/** Séjours connus du poste : fiches (les plus récentes) puis lignes des listes. */
export function knownStays(client: QueryClient): Reservation[] {
  const byId = new Map<string, Reservation>()
  const lists: Reservation[] = []
  for (const query of client.getQueryCache().findAll({ queryKey: ['reservations'] })) {
    const key = query.queryKey
    const data = query.state.data
    if (key.length === 2 && key[1] !== 'list' && data && typeof data === 'object' && 'id' in data) {
      byId.set((data as Reservation).id, data as Reservation)
    } else if (key[1] === 'list' && data && typeof data === 'object') {
      lists.push(...((data as { data?: Reservation[] }).data ?? []))
    }
  }
  for (const stay of lists) if (!byId.has(stay.id)) byId.set(stay.id, stay)
  return [...byId.values()]
}

function keptRooms(client: QueryClient): Room[] {
  const rooms = client.getQueryData<Room[]>(roomsQuery.queryKey)
  if (!rooms) {
    throw new ApiError(
      409,
      'Chambres absentes de ce poste',
      'La liste des chambres n’est pas gardée sur ce poste : faites « Tout télécharger pour le hors ligne » au retour du réseau.',
      {},
      'offline_data_missing',
    )
  }
  return rooms
}

export function roomBrief(room: Room): RoomBrief {
  return {
    id: room.id,
    number: room.number,
    room_type: { code: room.room_type.code, label: room.room_type.label },
    capacity: room.capacity,
    under_maintenance: room.maintenance_status === 'MAINTENANCE',
  }
}

const brief = (stay: Reservation): ReservationBrief => ({
  id: stay.id,
  status: stay.status,
  status_label: stay.status_label,
  blocked_from: stay.period.blocked_from,
  blocked_until: stay.period.blocked_until,
  is_estimated: stay.period.is_estimated,
})

/**
 * Séjours qui bloquent la chambre sur `[from, until[` (même règle que `overlapping()` du serveur) :
 * statuts bloquants, chevauchement, et séjour en cours au départ dépassé, bloquant jusqu'au départ.
 */
export function conflictsFor(
  client: QueryClient,
  roomId: string,
  from: number,
  until: number,
  exceptId: string | null = null,
  now = Date.now(),
): Reservation[] {
  return knownStays(client).filter((stay) => {
    if (stay.id === exceptId || stay.room?.id !== roomId || !BLOCKING.includes(stay.status))
      return false
    const stayFrom = Date.parse(stay.period.blocked_from)
    const stayUntil = Date.parse(stay.period.blocked_until)
    const overdue = stay.status === 'IN_PROGRESS' && stayUntil <= now
    return stayFrom < until && (stayUntil > from || overdue)
  })
}

/** Tarif en vigueur à l'instant donné : la version suivante prend le relais à sa date. */
export function rateAt(
  grid: RateGridRow[],
  roomTypeId: string,
  unit: Unit,
  at: number,
): RateView | null {
  const cell = grid.find((row) => row.room_type.id === roomTypeId)?.rates[unit]
  if (!cell) return null
  if (cell.next && Date.parse(cell.next.effective_from) <= at) return cell.next
  const current = cell.current
  if (current && (!current.effective_to || Date.parse(current.effective_to) > at)) return current
  return null
}

// ---------- Prix (entiers FCFA, D-008)

export interface DiscountInput {
  type: 'PERCENT' | 'FIXED'
  value: string | number
  reason: string
}

function basisPoints(value: string | number): number {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(String(value).trim())
  if (!match) {
    throw new ApiError(
      422,
      'Réduction invalide',
      'Le pourcentage doit avoir au plus deux décimales.',
    )
  }
  return Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'))
}

export function computePrice(
  unitPrice: number,
  quantity: number,
  discount: DiscountInput | null | undefined,
): PriceView {
  const gross = unitPrice * quantity
  let discountFcfa = 0
  let stored: PriceView['discount'] = null
  if (discount) {
    if (discount.type === 'PERCENT') {
      const bp = basisPoints(discount.value)
      discountFcfa = Math.floor((gross * bp + 5000) / 10000)
      stored = {
        type: 'PERCENT',
        type_label: 'Pourcentage',
        value: `${Math.floor(bp / 100)}.${String(bp % 100).padStart(2, '0')}`,
        reason: discount.reason,
      }
    } else {
      discountFcfa = Math.round(Number(discount.value))
      stored = {
        type: 'FIXED',
        type_label: 'Montant fixe',
        value: String(discountFcfa),
        reason: discount.reason,
      }
    }
    if (discountFcfa > gross) {
      throw new ApiError(
        422,
        'Réduction invalide',
        `La réduction (${formatFcfa(discountFcfa)}) dépasse le montant brut (${formatFcfa(gross)}).`,
        {},
        'discount_exceeds_amount',
      )
    }
  }
  return {
    unit_price_fcfa: unitPrice,
    quantity,
    gross_fcfa: gross,
    discount: stored,
    discount_fcfa: discountFcfa,
    net_fcfa: gross - discountFcfa,
  }
}

/** D-007 : une durée connue au-delà des demi-journées prévues est refusée, supplément explicite. */
function assertDuration(unit: Unit, quantity: number, interval: Interval, unitPrice: number): void {
  if (unit !== 'HALF_DAY' || interval.estimated) return
  const minutes = Math.round((interval.until - interval.from) / 60_000)
  const covered = quantity * HALF_DAY_MINUTES
  if (minutes <= covered) return
  const needed = Math.ceil(minutes / HALF_DAY_MINUTES)
  const hours = (value: number) =>
    `${Math.floor(value / 60)} h ${String(value % 60).padStart(2, '0')}`
  throw new ApiError(
    422,
    'Dépassement de la demi-journée',
    `La période dépasse la durée couverte par ${quantity} demi-journée(s). Aucune conversion automatique n'est faite : validez explicitement le supplément en portant la quantité à ${needed}, ou choisissez une autre unité.`,
    {},
    'half_day_overrun',
    [
      `Durée de la période : ${hours(minutes)}.`,
      `Durée couverte : ${hours(covered)} (${quantity} demi-journée(s)).`,
      `Quantité nécessaire : ${needed}.`,
      `Supplément proposé : +${formatFcfa((needed - quantity) * unitPrice)} (brut ${formatFcfa(needed * unitPrice)}).`,
    ],
  )
}

// ---------- Devis, chambres libres, prolongation

export interface BookingInput {
  room_id: string
  start_date: string
  end_date: string
  start_time?: string | null
  end_time?: string | null
  billing_unit: Unit
  quantity: number
  occupants: { name: string; is_primary?: boolean }[]
  discount?: DiscountInput | null
}

/** Devis calculé sur le poste, de même forme que celui du serveur. */
export function localQuote(
  client: QueryClient,
  input: BookingInput,
  now = Date.now(),
  /** Réservation corrigée elle-même, exclue des conflits (modification D-058). */
  exceptId: string | null = null,
): Quote {
  const room = keptRooms(client).find((item) => item.id === input.room_id)
  if (!room) throw new ApiError(404, 'Chambre introuvable', 'La chambre demandée n’existe pas.')
  const interval = stayInterval(
    input.start_date,
    input.end_date,
    input.start_time ?? null,
    input.end_time ?? null,
  )
  if (interval.until <= interval.from) {
    throw new ApiError(
      422,
      'Période invalide',
      'La fin du séjour doit être postérieure à son début. Vérifiez les dates et les heures d’arrivée et de départ.',
      {},
      'invalid_period',
    )
  }
  if (input.occupants.length > room.capacity) {
    throw new ApiError(
      422,
      'Capacité dépassée',
      `La chambre ${room.number} accepte au maximum ${room.capacity} occupant(s) : ${input.occupants.length} ont été saisis. Choisissez une chambre plus grande ou réduisez le nombre d’occupants.`,
      {},
      'capacity_exceeded',
    )
  }
  const grid = client.getQueryData<RateGridRow[]>(rateGridQuery.queryKey)
  if (!grid) {
    throw new ApiError(
      409,
      'Tarifs absents de ce poste',
      'Les tarifs ne sont pas gardés sur ce poste : faites « Tout télécharger pour le hors ligne » au retour du réseau.',
      {},
      'offline_data_missing',
    )
  }
  const rate = rateAt(grid, room.room_type.id, input.billing_unit, now)
  if (!rate) {
    throw new ApiError(
      409,
      'Tarif non défini',
      `Aucun tarif « ${UNIT_LABELS[input.billing_unit]} » en vigueur pour la catégorie ${room.room_type.label}.`,
      {},
      'rate_not_defined',
    )
  }
  assertDuration(input.billing_unit, input.quantity, interval, rate.amount_fcfa)
  const price = computePrice(rate.amount_fcfa, input.quantity, input.discount)
  const conflicts = conflictsFor(client, room.id, interval.from, interval.until, exceptId, now)
  return {
    room: roomBrief(room),
    period: view(interval),
    price: {
      billing_unit: input.billing_unit,
      billing_unit_label: UNIT_LABELS[input.billing_unit],
      rate_effective_from: rate.effective_from,
      ...price,
    },
    available: conflicts.length === 0,
    conflicts: conflicts.map(brief),
  }
}

/** Chambres libres sur la période, hors maintenance et de capacité suffisante. */
export function localFreeRooms(
  client: QueryClient,
  params: {
    start_date: string
    end_date: string
    start_time?: string | null
    end_time?: string | null
    min_capacity: number
  },
  now = Date.now(),
) {
  const interval = stayInterval(
    params.start_date,
    params.end_date,
    params.start_time ?? null,
    params.end_time ?? null,
  )
  return keptRooms(client)
    .filter(
      (room) =>
        room.maintenance_status !== 'MAINTENANCE' &&
        room.capacity >= params.min_capacity &&
        conflictsFor(client, room.id, interval.from, interval.until, null, now).length === 0,
    )
    .sort((a, b) => a.number.localeCompare(b.number, 'fr', { numeric: true }))
    .map((room) => ({
      room: roomBrief(room),
      state: 'FREE' as const,
      state_label: 'Libre',
      reservations: [] as ReservationBrief[],
    }))
}

export interface ModificationRequest {
  room_id: string
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  billing_unit: Unit
  quantity: number
}

/**
 * Correction avant le séjour (D-058), calculée sur le poste : réservation en attente ou confirmée,
 * jamais prolongée, facturée seulement par un administrateur ; tarif en vigueur et même remise ;
 * la réservation elle-même est exclue des conflits.
 */
export function localModificationPreview(
  client: QueryClient,
  stay: Reservation,
  input: ModificationRequest,
  context: { invoiced: boolean; canCreditInvoices: boolean; extended: boolean },
  now = Date.now(),
): Quote & { current_net_fcfa: number } {
  if (!['PENDING', 'CONFIRMED'].includes(stay.status)) {
    throw new ApiError(
      409,
      'Modification impossible',
      'Seule une réservation en attente ou confirmée, dont le séjour n’a pas commencé, peut être modifiée. Pour un séjour en cours, utilisez la prolongation.',
      {},
      'reservation_not_modifiable',
    )
  }
  if (context.extended) {
    throw new ApiError(
      409,
      'Modification impossible',
      'Cette réservation a déjà été prolongée : pour la corriger, annulez-la puis créez-en une nouvelle.',
      {},
      'reservation_extended',
    )
  }
  if (context.invoiced && !context.canCreditInvoices) {
    throw new ApiError(
      403,
      'Modification réservée',
      'Cette réservation est déjà facturée : seul un administrateur peut la modifier. La facture sera alors remplacée par un avoir et une nouvelle facture.',
      {},
      'modification_requires_admin',
    )
  }
  const quote = localQuote(
    client,
    {
      ...input,
      occupants: (stay.occupants ?? []).map((o) => ({ name: o.name, is_primary: o.is_primary })),
      discount: stay.price.discount,
    },
    now,
    stay.id,
  )
  return { ...quote, current_net_fcfa: stay.price.net_fcfa }
}

/** Le nouveau montant ne descend jamais sous ce qui est déjà encaissé (D-058). */
export function belowCollectedError(net: number, collected: number): ApiError {
  return new ApiError(
    422,
    'Modification impossible',
    `Le nouveau montant (${formatFcfa(net)}) serait inférieur à ce qui est déjà encaissé (${formatFcfa(collected)}).`,
    {},
    'modification_below_collected',
    [
      'Faites d’abord rembourser la différence par un administrateur, ou choisissez une période plus longue.',
    ],
  )
}

export interface ExtensionRequest {
  end_date: string
  end_time?: string | null
  additional_quantity: number
}

/** Aperçu de prolongation calculé sur le poste (prix unitaire et remise du séjour conservés). */
export function localExtensionPreview(
  client: QueryClient,
  stay: Reservation,
  input: ExtensionRequest,
  now = Date.now(),
): ExtensionPreview {
  if (!BLOCKING.includes(stay.status)) {
    throw new ApiError(
      409,
      'Opération impossible',
      `La réservation est « ${stay.status_label} » : impossible de prolonger le séjour.`,
      {},
      'invalid_status',
    )
  }
  const current = {
    from: Date.parse(stay.period.blocked_from),
    until: Date.parse(stay.period.blocked_until),
    estimated: stay.period.is_estimated,
  }
  const next = stayInterval(
    stay.period.start_date,
    input.end_date,
    stay.period.start_time,
    input.end_time ?? null,
  )
  if (next.until <= current.until) {
    throw new ApiError(
      422,
      'Prolongation invalide',
      `La nouvelle fin de séjour doit être postérieure à la fin actuelle (${formatDateTime(new Date(current.until))}).`,
      {},
      'extension_not_later',
    )
  }
  const unit = stay.price.billing_unit
  if (unit === 'DAY') {
    const days = calendarDaysBetween(stay.period.end_date, input.end_date)
    if (days !== input.additional_quantity) {
      throw new ApiError(
        422,
        'Nombre de jours incohérent',
        `Le nombre de jours à ajouter calculé entre les dates de départ est de ${days ?? 0}.`,
        {},
        'day_quantity_mismatch',
      )
    }
  }
  const quantity = stay.price.quantity + input.additional_quantity
  assertDuration(unit, quantity, next, stay.price.unit_price_fcfa)
  const proposed = computePrice(stay.price.unit_price_fcfa, quantity, stay.price.discount)
  const conflicts = stay.room
    ? conflictsFor(client, stay.room.id, current.until, next.until, stay.id, now)
    : []
  const {
    billing_unit: _unit,
    billing_unit_label: _label,
    amount_due_fcfa: _due,
    ...currentPrice
  } = stay.price
  return {
    current_period: view(current),
    new_period: view(next),
    current_price: currentPrice,
    proposed_price: proposed,
    supplement_fcfa: proposed.net_fcfa - stay.price.net_fcfa,
    possible: conflicts.length === 0,
    conflicts: conflicts.map(brief),
    requires_confirmation: true,
  }
}

/** Refus immédiat sur le poste : la chambre y est déjà prise. */
export function roomTakenError(quote: Quote): ApiError {
  return new ApiError(
    409,
    'Chambre indisponible',
    `La chambre ${quote.room.number} est déjà réservée sur cette période d’après les données de ce poste.`,
    {},
    'room_unavailable',
    quote.conflicts.map(
      (c) =>
        `${c.status_label} du ${formatDateTime(c.blocked_from)} au ${formatDateTime(c.blocked_until)}.`,
    ),
  )
}

// ---------- Éléments provisoires (affichés en attendant l'envoi)

export const PENDING_SUFFIX = ' — en attente d’envoi'

export function emptySummary(due: number): AccountSummary {
  return {
    amount_due_fcfa: due,
    paid_fcfa: 0,
    refunded_fcfa: 0,
    net_paid_fcfa: 0,
    balance_fcfa: due,
    status: due > 0 ? 'UNPAID' : 'NOTHING_DUE',
    status_label: due > 0 ? 'Non payé' : 'Rien à payer',
  }
}

/** Fiche client gardée sur le poste : fiche ouverte, sinon ligne d'une liste ou d'une recherche. */
export function keptCustomer(client: QueryClient, id: string): Customer | undefined {
  const detail = client.getQueryData<Customer>(['customers', id])
  if (detail) return detail
  for (const query of client.getQueryCache().findAll({ queryKey: ['customers', 'list'] })) {
    const rows = (query.state.data as { data?: Customer[] } | undefined)?.data
    const found = rows?.find((customer) => customer.id === id)
    if (found) return found
  }
  return undefined
}

export function provisionalStay(
  client: QueryClient,
  localId: string,
  input: BookingInput & {
    customer_id?: string | null
    notes?: string | null
    confirm?: boolean
    /** D-072 : salle de conférence. */
    event?: EventInput | null
  },
  quote: Quote,
  createdAt: number,
): Reservation {
  const customer = input.customer_id ? keptCustomer(client, input.customer_id) : undefined
  const { billing_unit, billing_unit_label, rate_effective_from: _from, ...price } = quote.price
  return {
    id: localId,
    status: input.confirm ? 'CONFIRMED' : 'PENDING',
    status_label: `${input.confirm ? 'Confirmée' : 'En attente'}${PENDING_SUFFIX}`,
    room: quote.room,
    customer: customer
      ? { id: customer.id, full_name: customer.full_name, phone: customer.phone }
      : null,
    period: {
      start_date: input.start_date,
      end_date: input.end_date,
      start_time: input.start_time ?? null,
      end_time: input.end_time ?? null,
      ...quote.period,
    },
    price: {
      billing_unit: billing_unit as Unit,
      billing_unit_label,
      amount_due_fcfa: price.net_fcfa,
      ...price,
    },
    occupants: input.occupants.map((occupant, index) => ({
      id: `${localId}-occupant-${index}`,
      name: occupant.name,
      is_primary: Boolean(occupant.is_primary),
    })),
    event: input.event ? eventView(input.event) : null,
    notes: input.notes ?? null,
    checked_in_at: null,
    checked_out_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    created_at: hotelIso(createdAt),
  }
}

// ---------- Planning et occupation calculés sur le poste (toute période, réservations hors ligne comprises)

/** Libellés des états (mêmes que `RoomOccupancy::LABELS` du serveur). */
const STATE_LABELS: Record<RoomState, string> = {
  FREE: 'Libre',
  RESERVED: 'Réservée',
  OCCUPIED: 'Occupée',
  MAINTENANCE: 'En maintenance',
}

/** Même règle que `RoomOccupancy::state()` : séjour en cours, puis maintenance, puis réservé. */
function stateOf(room: Room, stays: Reservation[]): RoomState {
  if (stays.some((stay) => stay.status === 'IN_PROGRESS')) return 'OCCUPIED'
  if (room.maintenance_status === 'MAINTENANCE') return 'MAINTENANCE'
  return stays.length > 0 ? 'RESERVED' : 'FREE'
}

const byNumber = (a: Room, b: Room) => a.number.localeCompare(b.number, 'fr', { numeric: true })

/** Planning : état de chaque chambre pour chaque jour `[jour 00:00, lendemain 00:00[`. */
export function localPlanning(
  client: QueryClient,
  from: string,
  days: number,
  roomTypeId: string,
  now = Date.now(),
): Planning {
  const dates = Array.from({ length: days }).reduce<string[]>(
    (list) => [...list, list.length === 0 ? from : nextDay(list.at(-1)!)],
    [],
  )
  const rooms = keptRooms(client)
    .filter((room) => !roomTypeId || room.room_type.id === roomTypeId)
    .sort(byNumber)
  return {
    from,
    days: dates,
    labels: STATE_LABELS,
    data: rooms.map((room) => ({
      room: roomBrief(room),
      days: Object.fromEntries(
        dates.map((date) => {
          const stays = conflictsFor(
            client,
            room.id,
            hotelTime(date, '00:00'),
            hotelTime(nextDay(date), '00:00'),
            null,
            now,
          )
          return [date, stateOf(room, stays)]
        }),
      ),
    })),
  }
}

/** Occupation à l'instant (même règle que `RoomOccupancy::at()`). */
export function localOccupancy(
  client: QueryClient,
  now = Date.now(),
): { at: string; data: OccupancyRow[] } {
  const open = knownStays(client)
    .filter(
      (stay) =>
        BLOCKING.includes(stay.status) &&
        (Date.parse(stay.period.blocked_until) > now || stay.status === 'IN_PROGRESS'),
    )
    .sort((a, b) => Date.parse(a.period.blocked_from) - Date.parse(b.period.blocked_from))
  return {
    at: hotelIso(now),
    data: keptRooms(client)
      .sort(byNumber)
      .map((room) => {
        const mine = open.filter((stay) => stay.room?.id === room.id)
        const current =
          mine.find((stay) => stay.status === 'IN_PROGRESS') ??
          mine.find(
            (stay) =>
              Date.parse(stay.period.blocked_from) <= now &&
              Date.parse(stay.period.blocked_until) > now,
          ) ??
          null
        const next =
          mine.find(
            (stay) => Date.parse(stay.period.blocked_from) > now && stay.id !== current?.id,
          ) ?? null
        const state = stateOf(room, current ? [current] : [])
        return {
          room: roomBrief(room),
          state,
          state_label: STATE_LABELS[state],
          current: current
            ? { ...brief(current), expected_departure: current.period.blocked_until }
            : null,
          next: next ? brief(next) : null,
          reserved_later: next !== null,
        }
      }),
  }
}
