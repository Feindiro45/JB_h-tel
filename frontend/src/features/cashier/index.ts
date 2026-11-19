// API publique de la feature cashier (caisse).
export {
  CASH_KEYS,
  PAYMENT_METHODS,
  paymentsKey,
  paymentsListQuery,
  recordPayment,
  reservationPaymentsQuery,
  type PaymentFilters,
} from './api'
export { CashierPage } from './CashierPage'
export { PaymentActions, type PaymentActionTarget } from './PaymentActions'
export { PaymentDialog } from './PaymentDialog'
export { ReceiptsPanel } from './ReceiptsPanel'
export { ReceiptPage } from './ReceiptPage'
