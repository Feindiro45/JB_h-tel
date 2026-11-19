/**
 * Contrats de l'API JB Hôtel (backend/). Tous les identifiants sont des UUID publics (D-026).
 * Montants en entiers FCFA.
 */

export interface Envelope<T> {
  data: T
}

export interface Paginated<T> {
  data: T[]
  meta: { total: number; current_page: number; last_page: number }
}

export interface CurrentUser {
  id: string
  name: string
  email: string
  active: boolean
  role: 'admin' | 'caissiere' | null
  role_label: string | null
  permissions: string[]
  last_login_at: string | null
}

export interface RoomType {
  id: string
  code: string
  label: string
  description: string | null
  rooms_count?: number
}

export interface Room {
  id: string
  number: string
  capacity: number
  room_type: RoomType
  maintenance_status: 'AVAILABLE' | 'MAINTENANCE'
  maintenance_label: string
  maintenance_note: string | null
  notes: string | null
}

export interface RoomBrief {
  id: string
  number: string
  room_type: { code: string; label: string }
  capacity: number
  under_maintenance: boolean
}

export interface Customer {
  id: string
  name: string
  first_name: string | null
  full_name: string
  phone: string | null
  email: string | null
  email_notifications: boolean
  origin_city: string | null
  origin_country: string | null
  address: string | null
  identification_type: string | null
  identification_number: string | null
  notes: string | null
  created_at: string | null
}

export interface BlockedPeriodView {
  blocked_from: string
  blocked_until: string
  is_estimated: boolean
}

export interface PriceView {
  unit_price_fcfa: number
  quantity: number
  gross_fcfa: number
  discount: { type: 'PERCENT' | 'FIXED'; type_label: string; value: string; reason: string } | null
  discount_fcfa: number
  net_fcfa: number
}

export interface ReservationBrief extends BlockedPeriodView {
  id: string
  status: string
  status_label: string
}

export interface Reservation {
  id: string
  status: string
  status_label: string
  room: RoomBrief | null
  customer: { id: string; full_name: string; phone: string | null } | null
  period: {
    start_date: string
    end_date: string
    start_time: string | null
    end_time: string | null
  } & BlockedPeriodView
  price: { billing_unit: 'HALF_DAY' | 'DAY'; billing_unit_label: string } & PriceView
  occupants: { id: string; name: string; is_primary: boolean }[] | null
  notes: string | null
  checked_in_at: string | null
  checked_out_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string | null
}

export interface Quote {
  room: RoomBrief
  period: BlockedPeriodView
  price: {
    billing_unit: string
    billing_unit_label: string
    rate_effective_from: string
  } & PriceView
  available: boolean
  conflicts: ReservationBrief[]
}

export interface ExtensionPreview {
  current_period: BlockedPeriodView
  new_period: BlockedPeriodView
  current_price: PriceView
  proposed_price: PriceView
  supplement_fcfa: number
  possible: boolean
  conflicts: ReservationBrief[]
  requires_confirmation: boolean
}

export interface HistoryEntry {
  id: string
  action: string
  label: string
  actor: { id: string; name: string } | null
  occurred_at: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

export interface AccountSummary {
  amount_due_fcfa: number
  paid_fcfa: number
  refunded_fcfa: number
  net_paid_fcfa: number
  balance_fcfa: number
  status: 'TO_REFUND' | 'NOTHING_DUE' | 'UNPAID' | 'PARTIALLY_PAID' | 'PAID'
  status_label: string
}

export interface Payment {
  id: string
  receipt_number: string
  amount_fcfa: number
  refunded_fcfa: number
  method: string
  method_label: string
  reference: string | null
  received_at: string
  cashier: { id: string; name: string }
  status: 'VALID' | 'CANCELLED'
  status_label: string
  cancelled_at: string | null
  cancellation_reason: string | null
  refunds: {
    id: string
    amount_fcfa: number
    method_label: string | null
    reason: string
    processed_at: string
    processed_by: { id: string; name: string }
  }[]
}

export interface InvoiceSummary {
  id: string
  type: 'INVOICE' | 'CREDIT_NOTE'
  type_label: string
  number: string
  issued_at: string
  status: 'ISSUED' | 'CREDITED'
  status_label: string
  credited_invoice: { id: string; number: string } | null
  gross_fcfa: number
  discount_fcfa: number
  net_fcfa: number
  verification_url: string
}

export interface DashboardRow {
  id: string
  customer: string
  room: { number: string; type: string }
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  status: string
  status_label: string
  net_fcfa: number
}

export interface Dashboard {
  date: string
  collected_today_fcfa: number
  collected_last_7_days: { date: string; net_fcfa: number }[]
  invoiced_month_fcfa: number
  receivables_fcfa: number
  arrivals_today: DashboardRow[]
  departures_today: DashboardRow[]
  recent_reservations: DashboardRow[]
}

export type RoomState = 'FREE' | 'RESERVED' | 'OCCUPIED' | 'MAINTENANCE'

export interface OccupancyRow {
  room: RoomBrief
  state: RoomState
  state_label: string
  current: (ReservationBrief & { expected_departure: string }) | null
  next: ReservationBrief | null
  reserved_later: boolean
}

export interface Planning {
  from: string
  days: string[]
  labels: Record<RoomState, string>
  data: { room: RoomBrief; days: Record<string, RoomState> }[]
}
