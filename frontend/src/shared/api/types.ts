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

/** D-072 : chambre d'hébergement ou salle de conférence (choisie à la création de la catégorie). */
export type RoomKind = 'ROOM' | 'CONFERENCE'

/** Vrai pour une salle de conférence ; une nature absente (ancienne copie locale) est une chambre. */
export function isConferenceRoom(room: { room_type?: { kind?: RoomKind } } | null | undefined) {
  return room?.room_type?.kind === 'CONFERENCE'
}

export interface RoomType {
  id: string
  code: string
  label: string
  /** Absente d'une copie locale gardée avant D-072 : c'est alors une chambre. */
  kind?: RoomKind
  kind_label?: string
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
  room_type: { code: string; label: string; kind?: RoomKind }
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

/** Type d'occupant d'une salle de conférence (D-072, liste validée par l'utilisateur). */
export type OrganizerType =
  | 'NGO'
  | 'INTERNATIONAL_ORGANIZATION'
  | 'COMPANY'
  | 'PUBLIC_ADMINISTRATION'
  | 'ASSOCIATION'
  | 'INDIVIDUAL'
  | 'OTHER'

export interface ReservationEvent {
  name: string
  organizer_type: OrganizerType
  organizer_type_label: string
  organizer_type_other: string | null
  organization_name: string | null
  contact_name: string | null
  contact_phone: string | null
}

export interface Reservation {
  id: string
  status: string
  status_label: string
  departure_overdue?: boolean
  room: RoomBrief | null
  customer: { id: string; full_name: string; phone: string | null } | null
  period: {
    start_date: string
    end_date: string
    start_time: string | null
    end_time: string | null
  } & BlockedPeriodView
  price: {
    billing_unit: 'HALF_DAY' | 'DAY'
    billing_unit_label: string
    /** 0 pour une réservation annulée (D-053) ; le prix reste affiché pour mémoire. */
    amount_due_fcfa: number
  } & PriceView
  occupants: { id: string; name: string; is_primary: boolean }[] | null
  /** D-072 : réservation d'une salle de conférence ; `null` pour une chambre. */
  event?: ReservationEvent | null
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
  /** 0 pour une réservation annulée (D-053). */
  amount_due_fcfa: number
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

/** Réservation, client et chambre d'un mouvement de caisse (contrats publics des modules). */
export interface PartyContext {
  reservation: { id: string; status: string; status_label: string } | null
  customer: { id: string; full_name: string } | null
  room: { id: string; number: string; room_type: string } | null
}

export type PaymentRow = Payment & PartyContext

export interface CashMovement extends PartyContext {
  type: 'PAYMENT' | 'REFUND'
  type_label: string
  id: string
  payment_id: string
  receipt_number: string
  at: string
  amount_fcfa: number
  /** + encaissement compté, − remboursement, 0 pour un encaissement annulé. */
  signed_amount_fcfa: number
  counted: boolean
  method: string
  method_label: string
  agent: { id: string; name: string }
  status: string
  status_label: string
  reason: string | null
  refundable_fcfa: number
  has_refunds: boolean
}

export interface CashBreakdown {
  label: string
  collected_fcfa: number
  refunded_fcfa: number
  net_fcfa: number
}

export interface CashJournal {
  from: string
  to: string
  totals: {
    collected_fcfa: number
    refunded_fcfa: number
    cancelled_fcfa: number
    payments_count: number
    refunds_count: number
    net_fcfa: number
  }
  by_method: (CashBreakdown & { method: string })[]
  by_agent: (CashBreakdown & { id: string })[]
  movements: CashMovement[]
}

/** Période d'un séjour telle que réservée (heures facultatives). */
export interface StayPeriod {
  start_date: string
  start_time: string | null
  end_date: string
  end_time: string | null
}

export interface Receipt extends Payment {
  reservation: { id: string; status_label: string }
  /** Période du séjour, imprimée sur le ticket 80 mm (D-061). */
  stay: (StayPeriod & { billing_unit_label: string; quantity: number }) | null
  customer: { id: string; full_name: string } | null
  room: { id: string; number: string; room_type: string } | null
  summary: AccountSummary
  summary_at: string
  hotel: Record<string, string | null>
}

export interface Receivable extends DashboardRow {
  phone: string | null
  paid_net_fcfa: number
  balance_fcfa: number
}

/** Réservation annulée avant D-053 dont l'encaissé reste à rendre au client. */
export interface RefundDue extends DashboardRow {
  phone: string | null
  paid_net_fcfa: number
  to_refund_fcfa: number
}

/**
 * Instantané figé d'une facture ou d'un avoir (`snapshot_json`, InvoiceSnapshotBuilder) : seule
 * source des montants réimprimés, jamais les tarifs actuels.
 */
export interface InvoiceSnapshot {
  document: { type: 'INVOICE' | 'CREDIT_NOTE'; label: string; number: string; issued_at: string }
  hotel: Record<string, string | null>
  customer: {
    full_name: string
    phone: string | null
    email: string | null
    address: string | null
  } | null
  /** `kind` absent des factures émises avant D-072 : c'était une chambre. */
  room: { number: string; type: string | null; kind?: RoomKind } | null
  /** D-072 : salle de conférence ; absent ou `null` pour une chambre. */
  event?: {
    name: string
    organizer: string
    organization_name: string | null
    contact_name: string | null
    contact_phone: string | null
  } | null
  stay: StayPeriod & { reservation_uuid?: string; period_is_estimated?: boolean }
  lines: {
    kind: string
    label: string
    billing_unit: string
    quantity: number
    unit_price_fcfa: number
    amount_fcfa: number
  }[]
  totals: {
    gross_fcfa: number
    discount_label: string | null
    discount_reason: string | null
    discount_fcfa: number
    net_fcfa: number
  }
  payments: {
    lines: {
      receipt_number: string
      received_at: string
      method: string
      amount_fcfa: number
      refunded_fcfa: number
    }[]
    paid_fcfa: number
    refunded_fcfa: number
    net_paid_fcfa: number
    balance_fcfa: number
  }
  issued_by: { name: string } | null
  credit?: { credited_invoice_number: string; credited_invoice_issued_at: string; reason: string }
  replaces?: { invoice_number: string; reason?: string | null }
}

export interface InvoiceDetail extends InvoiceSummary {
  snapshot: InvoiceSnapshot
  /** QR code de vérification (PNG en `data:`), imprimé sur le ticket (D-065). */
  verification_qr?: string
}

export interface InvoiceRow extends InvoiceSummary {
  reservation: { id: string } | null
  customer: { full_name: string } | null
  room: { number: string; type: string | null } | null
}

export interface InvoiceTotals {
  invoices_fcfa: number
  credit_notes_fcfa: number
  net_invoiced_fcfa: number
  count: number
}
