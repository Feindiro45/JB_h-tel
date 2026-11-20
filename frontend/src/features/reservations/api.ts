import { queryOptions } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import type {
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

export const reservationQuery = (id: string) =>
  queryOptions({
    queryKey: reservationKeys.detail(id),
    queryFn: async ({ signal }) =>
      (await api.get<Envelope<Reservation>>(`/api/v1/reservations/${id}`, { signal })).data,
  })

export const historyQuery = (id: string) =>
  queryOptions({
    queryKey: reservationKeys.history(id),
    queryFn: async ({ signal }) =>
      (await api.get<Envelope<HistoryEntry[]>>(`/api/v1/reservations/${id}/history`, { signal }))
        .data,
  })

export const planningQuery = (from: string, days: number, roomTypeId: string) =>
  queryOptions({
    queryKey: ['planning', from, days, roomTypeId],
    queryFn: ({ signal }) =>
      api.get<Planning>('/api/v1/planning', {
        query: { from, days, room_type_id: roomTypeId },
        signal,
      }),
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

export const occupancyQuery = queryOptions({
  queryKey: ['occupancy'],
  queryFn: ({ signal }) =>
    api.get<{ at: string; data: OccupancyRow[] }>('/api/v1/occupancy', { signal }),
  refetchInterval: 30_000,
  refetchOnWindowFocus: true,
})

export async function freeRooms(params: {
  start_date: string
  end_date: string
  start_time?: string | null
  end_time?: string | null
  min_capacity: number
}): Promise<AvailabilityRow[]> {
  const response = await api.get<{ data: AvailabilityRow[] }>('/api/v1/availability', {
    query: { ...params, only_free: 1 },
  })
  return response.data
}

export const quoteReservation = async (input: ReservationInput) =>
  (await api.post<Envelope<Quote>>('/api/v1/reservations/quote', input)).data

export const createReservation = async (input: ReservationInput) =>
  (await api.post<Envelope<Reservation>>('/api/v1/reservations', input)).data

const action = (path: string) => async (id: string, body?: unknown) =>
  (await api.post<Envelope<Reservation>>(`/api/v1/reservations/${id}/${path}`, body)).data

export const confirmReservation = action('confirm')
export const checkIn = action('check-in')
export const checkOut = action('check-out')
/** D-053 : `refund_fcfa` confirme le remboursement de l'encaissé net (0 si rien n'a été encaissé). */
export interface CancellationInput {
  reason: string
  refund_fcfa: number
  refund_method: string | null
}
export const cancelReservation = (id: string, input: CancellationInput) =>
  action('cancel')(id, input)

export const replaceOccupants = async (
  id: string,
  occupants: { name: string; is_primary?: boolean }[],
) =>
  (await api.put<Envelope<Reservation>>(`/api/v1/reservations/${id}/occupants`, { occupants })).data

export const previewExtension = async (id: string, input: ExtensionInput) =>
  (
    await api.post<Envelope<ExtensionPreview>>(
      `/api/v1/reservations/${id}/extension/preview`,
      input,
    )
  ).data

/** D-053 : si le séjour était facturé, le serveur émet dans la même opération la facture de remplacement. */
export async function extendReservation(id: string, input: ExtensionInput) {
  const response = await api.post<
    Envelope<Reservation> & { meta?: { replacement_invoice_number: string | null } }
  >(`/api/v1/reservations/${id}/extension`, { ...input, confirm: true })
  return {
    reservation: response.data,
    replacementInvoiceNumber: response.meta?.replacement_invoice_number ?? null,
  }
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
}

export const previewModification = async (id: string, input: ModificationInput) =>
  (
    await api.post<Envelope<Quote & { current_net_fcfa: number }>>(
      `/api/v1/reservations/${id}/modification/preview`,
      input,
    )
  ).data

export async function modifyReservation(id: string, input: ModificationInput) {
  const response = await api.post<
    Envelope<Reservation> & { meta?: { replacement_invoice_number: string | null } }
  >(`/api/v1/reservations/${id}/modification`, input)
  return {
    reservation: response.data,
    replacementInvoiceNumber: response.meta?.replacement_invoice_number ?? null,
  }
}
