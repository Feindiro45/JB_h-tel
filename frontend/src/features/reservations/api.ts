import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'
import { getConnectivity } from '../../shared/offline/connectivity'
import {
  registerOfflineEssential,
  registerOfflineCoverage,
  registerOfflinePreparation,
} from '../../shared/offline/essentials'
import { isLocalId, localQuery } from '../../shared/offline/localRefs'
import { runOrQueue } from '../../shared/offline/offlineWrite'
import { OUTBOX_QUERY_KEY, type QueuedOperation } from '../../shared/offline/outbox'
import { getQueryClientRef } from '../../shared/offline/queryClientRef'
import { addDays, formatDay, todayIso } from '../../shared/utils/format'
import { reservationPaymentsQuery } from '../cashier'
import { roomsQuery } from '../catalog'
import { cacheAutomaticInvoice, reservationInvoicesQuery } from '../invoices'
import {
  belowCollectedError,
  conflictsFor,
  emptySummary,
  hotelIso,
  keptCustomer,
  localExtensionPreview,
  localFreeRooms,
  localOccupancy,
  localPlanning,
  localModificationPreview,
  localQuote,
  PENDING_SUFFIX,
  provisionalStay,
  roomTakenError,
} from './offlineBooking'
import type {
  AccountSummary,
  CurrentUser,
  InvoiceSummary,
  Room,
  Envelope,
  ExtensionPreview,
  HistoryEntry,
  OccupancyRow,
  Paginated,
  Planning,
  Quote,
  Reservation,
  ReservationBrief,
  RoomBrief,
  RoomState,
} from '../../shared/api/types'

export interface ReservationFilters {
  search?: string
  room_type_id?: string
  billing_unit?: string
  status?: string
  room_id?: string
  customer_id?: string
  from?: string
  to?: string
  per_page?: number
  page?: number
}

export interface ReservationInput {
  room_id: string
  customer_id?: string | null
  start_date: string
  end_date: string
  start_time?: string | null
  end_time?: string | null
  billing_unit: 'HALF_DAY' | 'DAY'
  quantity: number
  occupants: { name: string; is_primary?: boolean }[]
  discount?: { type: 'PERCENT' | 'FIXED'; value: string | number; reason: string } | null
  notes?: string | null
  confirm?: boolean
  expected_unit_price_fcfa?: number
}

export interface ExtensionInput {
  end_date: string
  end_time?: string | null
  additional_quantity: number
  confirm?: boolean
}

export interface AvailabilityRow {
  room: RoomBrief
  state: RoomState
  state_label: string
  reservations: ReservationBrief[]
}

export const reservationKeys = {
  all: ['reservations'] as const,
  list: (filters: ReservationFilters) => ['reservations', 'list', filters] as const,
  detail: (id: string) => ['reservations', id] as const,
  history: (id: string) => ['reservations', id, 'history'] as const,
}

export const reservationsQuery = (filters: ReservationFilters) =>
  queryOptions({
    queryKey: reservationKeys.list(filters),
    queryFn: ({ signal }) =>
      api.get<Paginated<Reservation>>('/api/v1/reservations', { query: { ...filters }, signal }),
    placeholderData: (previous) => previous,
  })

// Une réservation créée hors ligne (`local-…`) n'existe que sur le poste jusqu'à son envoi.
export const reservationQuery = (id: string) =>
  queryOptions({
    queryKey: reservationKeys.detail(id),
    queryFn: async ({ signal }) =>
      (await api.get<Envelope<Reservation>>(`/api/v1/reservations/${id}`, { signal })).data,
    ...(isLocalId(id) ? localQuery<Reservation>(reservationKeys.detail(id)) : {}),
  })

export const historyQuery = (id: string) =>
  queryOptions({
    queryKey: reservationKeys.history(id),
    queryFn: async ({ signal }) =>
      (await api.get<Envelope<HistoryEntry[]>>(`/api/v1/reservations/${id}/history`, { signal }))
        .data,
    ...(isLocalId(id) ? localQuery<HistoryEntry[]>(reservationKeys.history(id), []) : {}),
  })

export const planningQuery = (from: string, days: number, roomTypeId: string) =>
  queryOptions({
    queryKey: ['planning', from, days, roomTypeId],
    // Hors ligne : calculé sur le poste, pour n'importe quelle période (réservations hors ligne comprises).
    queryFn: ({ signal }) =>
      serverOrLocal(
        () =>
          api.get<Planning>('/api/v1/planning', {
            query: { from, days, room_type_id: roomTypeId },
            signal,
          }),
        keptOr(['planning', from, days, roomTypeId], (client) =>
          localPlanning(client, from, days, roomTypeId),
        ),
      ),
    networkMode: 'always',
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

export const occupancyQuery = queryOptions({
  queryKey: ['occupancy'],
  queryFn: ({ signal }) =>
    serverOrLocal(
      () => api.get<{ at: string; data: OccupancyRow[] }>('/api/v1/occupancy', { signal }),
      keptOr(['occupancy'], (client) => localOccupancy(client)),
    ),
  networkMode: 'always',
  refetchInterval: 30_000,
  refetchOnWindowFocus: true,
})

/**
 * Serveur d'abord ; sans lui (hors ligne ou coupure pendant l'appel), calcul sur le poste avec les
 * données gardées (lot 4, 4.5). Le serveur revérifie tout à l'envoi de l'opération.
 */
/** Calcul sur le poste ; s'il manque des données (chambres jamais téléchargées), la copie gardée. */
function keptOr<T>(key: readonly unknown[], compute: (client: QueryClient) => T) {
  return (client: QueryClient): T => {
    try {
      return compute(client)
    } catch (error) {
      const kept = client.getQueryData<T>(key)
      if (kept !== undefined) return kept
      throw error
    }
  }
}

async function serverOrLocal<T>(
  server: () => Promise<T>,
  local: (client: QueryClient) => T,
  forceLocal = false,
): Promise<T> {
  const client = getQueryClientRef()
  if (client && (forceLocal || !getConnectivity().online)) return local(client)
  try {
    return await server()
  } catch (error) {
    if (client && error instanceof ApiError && error.isNetworkError) return local(client)
    throw error
  }
}

export async function freeRooms(params: {
  start_date: string
  end_date: string
  start_time?: string | null
  end_time?: string | null
  min_capacity: number
}): Promise<AvailabilityRow[]> {
  return serverOrLocal(
    async () =>
      (
        await api.get<{ data: AvailabilityRow[] }>('/api/v1/availability', {
          query: { ...params, only_free: 1 },
        })
      ).data,
    (client) => localFreeRooms(client, params),
  )
}

export const quoteReservation = (input: ReservationInput) =>
  serverOrLocal(
    async () => (await api.post<Envelope<Quote>>('/api/v1/reservations/quote', input)).data,
    (client) => localQuote(client, input),
  )

/** « chambre 101 · NGUEMA Paul · du 22/11/2026 au 24/11/2026 » (libellé de la file d'attente). */
function describeBooking(client: QueryClient | null, input: ReservationInput): string {
  const room = client
    ?.getQueryData<Room[]>(roomsQuery.queryKey)
    ?.find((r) => r.id === input.room_id)
  const customer = client && input.customer_id ? keptCustomer(client, input.customer_id) : undefined
  return [
    room && `chambre ${room.number}`,
    customer?.full_name ?? input.occupants[0]?.name,
    `du ${formatDay(input.start_date)} au ${formatDay(input.end_date)}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Une nouvelle réservation provisoire apparaît en tête des listes non filtrées. */
function prependToLists(client: QueryClient, stay: Reservation): void {
  for (const query of client.getQueryCache().findAll({ queryKey: ['reservations', 'list'] })) {
    const filters = (query.queryKey[2] ?? {}) as ReservationFilters
    const filtered = Object.entries(filters).some(
      ([key, value]) => !['page', 'per_page'].includes(key) && value !== undefined && value !== '',
    )
    if (filtered || (filters.page ?? 1) !== 1) continue
    client.setQueryData<Paginated<Reservation>>(query.queryKey, (old) =>
      old
        ? { ...old, data: [stay, ...old.data], meta: { ...old.meta, total: old.meta.total + 1 } }
        : old,
    )
  }
}

/**
 * Création « comme en ligne » (D-064, lot 4) : envoyée au serveur s'il répond ; sinon, le poste
 * vérifie la chambre et calcule le prix, garde l'opération et affiche la réservation provisoire
 * (`local-…`), à laquelle on peut déjà encaisser une avance.
 */
export const createReservation = async (input: ReservationInput, idempotencyKey?: string) => {
  input = { ...input, confirm: input.confirm ?? true }
  let quote: Quote | null = null
  return runOrQueue<Reservation>({
    kind: 'reservation.create',
    label: `Réservation — ${describeBooking(getQueryClientRef(), input)}`,
    path: '/api/v1/reservations',
    body: input,
    idempotencyKey,
    numbered: input.confirm,
    numberPrefix: 'FAC-',
    validate: (client) => {
      quote = localQuote(client, input)
      if (!quote.available) throw roomTakenError(quote)
      input.expected_unit_price_fcfa = quote.price.unit_price_fcfa
    },
    provisional: (operation, client) => {
      const stay = provisionalStay(client, operation.localId!, input, quote!, operation.createdAt)
      client.setQueryData(reservationKeys.detail(stay.id), stay)
      client.setQueryData(reservationKeys.history(stay.id), [])
      client.setQueryData(reservationPaymentsQuery(stay.id).queryKey, {
        data: [],
        summary: emptySummary(stay.price.amount_due_fcfa),
      })
      prependToLists(client, stay)
      cacheAutomaticInvoice(client, stay, operation)
      return stay
    },
  })
}

/**
 * Confirmation « comme en ligne » (lot 4, 4.13) : hors ligne, le poste revérifie que la chambre
 * reste libre (la réservation elle-même exclue) ; le serveur refait la vérification à l'envoi.
 */
export const confirmReservation = (id: string) => {
  const body: { expected_unit_price_fcfa?: number } = {}
  return runOrQueue<Reservation>({
    kind: 'reservation.confirm',
    label: `Confirmation — ${describeStay(id)}`,
    path: `/api/v1/reservations/${id}/confirm`,
    body,
    numbered: true,
    numberPrefix: 'FAC-',
    validate: (client) => {
      const stay = keptStay(client, id)
      body.expected_unit_price_fcfa = stay.price.unit_price_fcfa
      if (stay.status !== 'PENDING') {
        throw new ApiError(
          409,
          'Opération impossible',
          `La réservation est « ${stay.status_label} » : seule une réservation en attente peut être confirmée.`,
          {},
          'invalid_status',
        )
      }
      const taken = stay.room
        ? conflictsFor(
            client,
            stay.room.id,
            Date.parse(stay.period.blocked_from),
            Date.parse(stay.period.blocked_until),
            stay.id,
          )
        : []
      if (taken.length > 0) {
        throw new ApiError(
          409,
          'Chambre indisponible',
          `La chambre ${stay.room!.number} est déjà réservée sur cette période d’après les données de ce poste.`,
          {},
          'room_unavailable',
        )
      }
    },
    provisional: (operation, client) => {
      const stay = updateStay(client, id, (stay) => ({
        ...stay,
        status: 'CONFIRMED',
        status_label: 'Confirmée',
      }))
      cacheAutomaticInvoice(client, stay, operation)
      return stay
    },
  })
}

/** « chambre 101 · NGUEMA Paul », d'après la fiche gardée sur le poste (libellé de la file d'attente). */
export function describeStay(id: string): string {
  const stay = getQueryClientRef()?.getQueryData<Reservation>(reservationKeys.detail(id))
  if (!stay) return 'réservation'
  return [stay.room && `chambre ${stay.room.number}`, stay.customer?.full_name]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Arrivée et départ « comme en ligne » (D-064) : envoyés au serveur s'il répond, sinon gardés sur
 * le poste ; la fiche change aussitôt d'état, marquée « en attente d'envoi » (lot 4).
 */
const transition =
  (path: 'check-in' | 'check-out', status: 'IN_PROGRESS' | 'COMPLETED', label: string) =>
  async (id: string): Promise<Reservation> => {
    const url = `/api/v1/reservations/${id}/${path}`
    return runOrQueue({
      kind: path === 'check-in' ? 'reservation.check-in' : 'reservation.check-out',
      label: `${path === 'check-in' ? 'Arrivée' : 'Départ'} — ${describeStay(id)}`,
      path: url,
      body: undefined,
      provisional: (operation, client) => {
        const now = new Date(operation.createdAt).toISOString()
        let updated: Reservation | undefined
        client.setQueryData<Reservation>(reservationKeys.detail(id), (old) => {
          if (!old) return old
          updated = {
            ...old,
            status,
            status_label: `${label} — en attente d’envoi`,
            checked_in_at: path === 'check-in' ? now : old.checked_in_at,
            checked_out_at: path === 'check-out' ? now : old.checked_out_at,
          }
          return updated
        })
        if (!updated) throw new Error('Réservation absente de la copie locale.')
        return updated
      },
    })
  }

export const checkIn = transition('check-in', 'IN_PROGRESS', 'En cours')
export const checkOut = transition('check-out', 'COMPLETED', 'Terminée')
/** D-053 : `refund_fcfa` confirme le remboursement de l'encaissé net (0 si rien n'a été encaissé). */
export interface CancellationInput {
  reason: string
  refund_fcfa: number
  refund_method: string | null
}
/** Fiche du poste modifiée en attendant l'envoi ; marquée « en attente d'envoi ». */
function updateStay(
  client: QueryClient,
  id: string,
  change: (stay: Reservation) => Reservation,
): Reservation {
  let updated: Reservation | undefined
  client.setQueryData<Reservation>(reservationKeys.detail(id), (old) => {
    if (!old) return old
    const next = change(old)
    updated = {
      ...next,
      status_label: `${next.status_label.replace(PENDING_SUFFIX, '')}${PENDING_SUFFIX}`,
    }
    return updated
  })
  if (!updated) throw new Error('Réservation absente de la copie locale.')
  return updated
}

/** Situation de caisse du séjour recalculée sur le poste (montant dû, remboursement). */
function updateSummary(
  client: QueryClient,
  id: string,
  change: (summary: AccountSummary) => AccountSummary,
): void {
  client.setQueryData<{ data: unknown[]; summary: AccountSummary }>(
    reservationPaymentsQuery(id).queryKey,
    (old) => (old ? { ...old, summary: change(old.summary) } : old),
  )
}

/**
 * Annulation « comme en ligne » (D-053, D-064) : hors ligne, la fiche passe « Annulée — en
 * attente d'envoi », plus rien n'est dû ; le serveur rembourse l'encaissé et crédite la facture
 * à l'envoi, après avoir tout revérifié.
 */
export const cancelReservation = (id: string, input: CancellationInput) =>
  runOrQueue<Reservation>({
    kind: 'reservation.cancel',
    label: `Annulation — ${describeStay(id)}`,
    path: `/api/v1/reservations/${id}/cancel`,
    body: input,
    provisional: (operation, client) => {
      updateSummary(client, id, (summary) => ({
        ...summary,
        amount_due_fcfa: 0,
        refunded_fcfa: summary.refunded_fcfa + input.refund_fcfa,
        net_paid_fcfa: summary.net_paid_fcfa - input.refund_fcfa,
        balance_fcfa: 0,
        status: 'NOTHING_DUE',
        status_label: 'Rien à payer',
      }))
      return updateStay(client, id, (stay) => ({
        ...stay,
        status: 'CANCELLED',
        status_label: 'Annulée',
        cancelled_at: hotelIso(operation.createdAt),
        cancellation_reason: input.reason,
        price: { ...stay.price, amount_due_fcfa: 0 },
      }))
    },
  })

/** Occupants « comme en ligne » (lot 4, 4.13) : capacité de la chambre vérifiée sur le poste. */
export const replaceOccupants = (id: string, occupants: { name: string; is_primary?: boolean }[]) =>
  runOrQueue<Reservation>({
    kind: 'reservation.occupants',
    method: 'PUT',
    label: `Occupants (${occupants.length}) — ${describeStay(id)}`,
    path: `/api/v1/reservations/${id}/occupants`,
    body: { occupants },
    validate: (client) => {
      const room = keptStay(client, id).room
      if (room && occupants.length > room.capacity) {
        throw new ApiError(
          422,
          'Capacité dépassée',
          `La chambre ${room.number} accepte au maximum ${room.capacity} occupant(s) : ${occupants.length} ont été saisis.`,
          {},
          'capacity_exceeded',
        )
      }
    },
    provisional: (operation, client) =>
      updateStay(client, id, (stay) => ({
        ...stay,
        occupants: occupants.map((occupant, index) => ({
          id: `${operation.localId}-occupant-${index}`,
          name: occupant.name,
          is_primary: Boolean(occupant.is_primary),
        })),
      })),
  })

/** Situation de caisse après un changement du montant dû (même règle que le serveur). */
function withAmountDue(summary: AccountSummary, due: number): AccountSummary {
  const balance = due - summary.net_paid_fcfa
  const status: AccountSummary['status'] =
    balance < 0
      ? 'TO_REFUND'
      : due === 0
        ? 'NOTHING_DUE'
        : balance === 0
          ? 'PAID'
          : summary.net_paid_fcfa > 0
            ? 'PARTIALLY_PAID'
            : 'UNPAID'
  const labels: Record<AccountSummary['status'], string> = {
    TO_REFUND: 'À rembourser',
    NOTHING_DUE: 'Rien à payer',
    UNPAID: 'Non payé',
    PARTIALLY_PAID: 'Partiellement payé',
    PAID: 'Soldé',
  }
  return {
    ...summary,
    amount_due_fcfa: due,
    balance_fcfa: balance,
    status,
    status_label: labels[status],
  }
}

function keptStay(client: QueryClient, id: string): Reservation {
  const stay = client.getQueryData<Reservation>(reservationKeys.detail(id))
  if (!stay) {
    throw new ApiError(
      409,
      'Réservation absente de ce poste',
      'Cette réservation n’est pas gardée sur ce poste : ouvrez sa fiche en ligne, ou faites « Tout télécharger pour le hors ligne ».',
      {},
      'offline_data_missing',
    )
  }
  return stay
}

export const previewExtension = (id: string, input: ExtensionInput) =>
  serverOrLocal(
    async () =>
      (
        await api.post<Envelope<ExtensionPreview>>(
          `/api/v1/reservations/${id}/extension/preview`,
          input,
        )
      ).data,
    (client) => localExtensionPreview(client, keptStay(client, id), input),
    isLocalId(id),
  )

/**
 * Prolongation « comme en ligne » (D-053, D-064) : hors ligne, le poste vérifie la chambre sur la
 * période ajoutée et recalcule le prix (prix unitaire et remise conservés). Si le séjour était
 * facturé, le serveur remplacera la facture à l'envoi.
 */
export async function extendReservation(id: string, input: ExtensionInput) {
  let preview: ExtensionPreview | null = null
  return runOrQueue<{ reservation: Reservation; replacementInvoiceNumber: string | null }>({
    kind: 'reservation.extend',
    label: `Prolongation jusqu’au ${formatDay(input.end_date)} — ${describeStay(id)}`,
    path: `/api/v1/reservations/${id}/extension`,
    body: { ...input, confirm: true },
    read: (response) => {
      const body = response as Envelope<Reservation> & {
        meta?: { replacement_invoice_number: string | null }
      }
      return {
        reservation: body.data,
        replacementInvoiceNumber: body.meta?.replacement_invoice_number ?? null,
      }
    },
    validate: (client) => {
      preview = localExtensionPreview(client, keptStay(client, id), input)
      if (!preview.possible) {
        throw new ApiError(
          409,
          'Prolongation impossible',
          'La chambre n’est pas libre sur la prolongation demandée, d’après les données de ce poste.',
          {},
          'room_unavailable',
        )
      }
    },
    provisional: (_operation, client) => {
      const next = preview!
      updateSummary(client, id, (summary) => withAmountDue(summary, next.proposed_price.net_fcfa))
      const reservation = updateStay(client, id, (stay) => ({
        ...stay,
        period: {
          ...stay.period,
          end_date: input.end_date,
          end_time: input.end_time ?? null,
          blocked_until: next.new_period.blocked_until,
          is_estimated: next.new_period.is_estimated,
        },
        price: {
          ...stay.price,
          ...next.proposed_price,
          amount_due_fcfa: next.proposed_price.net_fcfa,
        },
      }))
      return { reservation, replacementInvoiceNumber: null }
    },
  })
}

/** Correction avant le séjour (D-058) : chambre, période, forfait ; motif obligatoire à l'enregistrement. */
export interface ModificationInput {
  room_id: string
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  billing_unit: 'DAY' | 'HALF_DAY'
  quantity: number
  reason?: string
  expected_unit_price_fcfa?: number
}

/** Facture active, droit d'avoir, prolongation déjà faite : conditions de la modification (D-058). */
function modificationContext(client: QueryClient, id: string) {
  const invoices =
    client.getQueryData<InvoiceSummary[]>(reservationInvoicesQuery(id).queryKey) ?? []
  const me = client.getQueryData<CurrentUser | null>(['auth', 'me'])
  const history = client.getQueryData<HistoryEntry[]>(reservationKeys.history(id)) ?? []
  const outbox = client.getQueryData<QueuedOperation[]>(OUTBOX_QUERY_KEY) ?? []
  return {
    invoiced: invoices.some((invoice) => invoice.type === 'INVOICE' && invoice.status === 'ISSUED'),
    canCreditInvoices: Boolean(me?.permissions.includes('invoices.credit')),
    extended:
      history.some((entry) => entry.action === 'reservation.extended') ||
      outbox.some(
        (operation) =>
          operation.kind === 'reservation.extend' &&
          operation.status !== 'abandoned' &&
          operation.path.includes(`/reservations/${id}/`),
      ),
  }
}

export const previewModification = (id: string, input: ModificationInput) =>
  serverOrLocal(
    async () =>
      (
        await api.post<Envelope<Quote & { current_net_fcfa: number }>>(
          `/api/v1/reservations/${id}/modification/preview`,
          input,
        )
      ).data,
    (client) =>
      localModificationPreview(
        client,
        keptStay(client, id),
        input,
        modificationContext(client, id),
      ),
    isLocalId(id),
  )

/**
 * Modification « comme en ligne » (D-058, lot 4, 4.13) : hors ligne, le poste recalcule le prix au
 * tarif en vigueur (même remise), vérifie la chambre et le montant déjà encaissé. Si le séjour
 * était facturé, le serveur remplace la facture à l'envoi.
 */
export async function modifyReservation(id: string, input: ModificationInput) {
  let quote: (Quote & { current_net_fcfa: number }) | null = null
  return runOrQueue<{ reservation: Reservation; replacementInvoiceNumber: string | null }>({
    kind: 'reservation.modify',
    label: `Modification — ${describeStay(id)}`,
    path: `/api/v1/reservations/${id}/modification`,
    body: input,
    read: (response) => {
      const body = response as Envelope<Reservation> & {
        meta?: { replacement_invoice_number: string | null }
      }
      return {
        reservation: body.data,
        replacementInvoiceNumber: body.meta?.replacement_invoice_number ?? null,
      }
    },
    validate: (client) => {
      const preview = localModificationPreview(
        client,
        keptStay(client, id),
        input,
        modificationContext(client, id),
      )
      if (!preview.available) throw roomTakenError(preview)
      const collected =
        client.getQueryData<{ summary: AccountSummary }>(reservationPaymentsQuery(id).queryKey)
          ?.summary.net_paid_fcfa ?? 0
      if (preview.price.net_fcfa < collected) {
        throw belowCollectedError(preview.price.net_fcfa, collected)
      }
      quote = preview
      input.expected_unit_price_fcfa = preview.price.unit_price_fcfa
    },
    provisional: (_operation, client) => {
      const next = quote!
      const { billing_unit, billing_unit_label, rate_effective_from: _from, ...price } = next.price
      updateSummary(client, id, (summary) => withAmountDue(summary, price.net_fcfa))
      const reservation = updateStay(client, id, (stay) => ({
        ...stay,
        room: next.room,
        period: {
          start_date: input.start_date,
          end_date: input.end_date,
          start_time: input.start_time,
          end_time: input.end_time,
          ...next.period,
        },
        price: {
          billing_unit: billing_unit as 'DAY' | 'HALF_DAY',
          billing_unit_label,
          amount_due_fcfa: price.net_fcfa,
          ...price,
        },
      }))
      return { reservation, replacementInvoiceNumber: null }
    },
  })
}

// Gardés pour le travail sans réseau (lot 2) : clés identiques à celles des écrans par défaut.
registerOfflineEssential('reservations.view', () => occupancyQuery)
registerOfflineEssential('reservations.view', () => planningQuery(todayIso(), 7, ''))

// Liste par défaut de l’écran « Réservations » (mêmes filtres initiaux).
registerOfflineEssential('reservations.view', () => reservationsQuery({ page: 1, per_page: 25 }))

/** Séjours utiles sans réseau : en cours, à venir, et terminés depuis 30 jours (réimpressions). */
const preparedLists = (): ReservationFilters[] => [
  { status: 'IN_PROGRESS' },
  { status: 'CONFIRMED' },
  { status: 'PENDING' },
  { status: 'COMPLETED', from: addDays(todayIso(), -30) },
]

// « Tout télécharger pour le hors ligne » : chaque fiche vient de sa liste (même présentation
// côté serveur), seul l’historique demande une requête par séjour.
registerOfflinePreparation({
  order: 10,
  label: 'Réservations et leurs fiches',
  permission: 'reservations.view',
  run: async (context) => {
    const stays: Reservation[] = []
    for (const filters of preparedLists()) {
      for (let page = 1; ; page++) {
        const list = await context.fetch(reservationsQuery({ ...filters, page, per_page: 100 }))
        if (!list) break
        stays.push(...list.data)
        if (page >= list.meta.last_page) break
      }
    }
    for (const stay of stays) context.seed(reservationKeys.detail(stay.id), stay)
    context.share(
      'reservations',
      stays.map((stay) => stay.id),
    )
    context.share(
      'customers',
      stays.flatMap((stay) => (stay.customer ? [stay.customer.id] : [])),
    )
    await Promise.all(stays.map((stay) => context.fetch(historyQuery(stay.id))))
  },
})

// Comparaison « sur ce poste / en ligne » de la page Synchronisation.
registerOfflineCoverage({
  order: 10,
  label: 'Réservations',
  permission: 'reservations.view',
  match: (key) => key[0] === 'reservations' && (key[1] === 'list' || key.length === 2),
  serverTotal: async () =>
    (await api.get<Paginated<unknown>>('/api/v1/reservations', { query: { per_page: 10 } })).meta
      .total,
})
