import { Icon } from '../../shared/ui/Icon'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { paymentMethodsQuery } from '../../shared/api/lookups'
import { useState } from 'react'
import { Link } from 'react-router'
import { SelectField, TextAreaField, TextField } from '../../shared/ui/fields'
import { Modal } from '../../shared/ui/Modal'
import { useToast } from '../../shared/ui/toastContext'
import { config } from '../../shared/config'
import { formatFcfa, todayIso } from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import { CASH_KEYS, cancelPayment, refundPayment } from './api'

export interface PaymentActionTarget {
  id: string
  receipt_number: string
  amount_fcfa: number
  status: string
  method_label: string
  /** Montant encore remboursable (versement − remboursements déjà faits). */
  refundable_fcfa: number
  has_refunds: boolean
  /** Auteur et date du versement : la caissière annule ses propres saisies du jour (D-058). */
  cashier_id?: string
  received_at?: string
}

/** Annulation permise : administrateur, ou caissière pour son propre versement d'aujourd'hui. */
function canCancel(
  payment: PaymentActionTarget,
  userId: string | undefined,
  can: (permission: string) => boolean,
): boolean {
  if (can('payments.cancel')) return true
  return (
    can('payments.record') &&
    payment.cashier_id !== undefined &&
    payment.cashier_id === userId &&
    payment.received_at !== undefined &&
    todayIso(config.timeZone, new Date(payment.received_at)) === todayIso()
  )
}

/** Après un mouvement, tous les écrans de caisse et la fiche du séjour sont rechargés. */
function useCashRefresh() {
  const queryClient = useQueryClient()
  return () => {
    for (const key of [...CASH_KEYS, ['reservations']]) {
      void queryClient.invalidateQueries({ queryKey: key })
    }
  }
}

/**
 * Actions d'un encaissement : reçu imprimable, remboursement et annulation (droits
 * `refunds.create` et `payments.cancel`, réservés à l'administrateur par défaut, D-035).
 */
export function PaymentActions({ payment }: { payment: PaymentActionTarget }) {
  const { can, user } = useCurrentUser()
  const [dialog, setDialog] = useState<'refund' | 'cancel' | null>(null)
  const valid = payment.status === 'VALID'

  return (
    <span className="compact-actions">
      <Link
        className="text-button"
        to={`/documents/recus/${payment.id}`}
        aria-label={`Reçu ${payment.receipt_number}`}
      >
        <Icon name="document" size={17} />
        Reçu
      </Link>
      <Link
        className="text-button"
        to={`/documents/recus/${payment.id}/ticket`}
        aria-label={`Ticket 80 mm du reçu ${payment.receipt_number}`}
      >
        <Icon name="print" size={17} />
        Ticket
      </Link>
      {valid && payment.refundable_fcfa > 0 && can('refunds.create') && (
        <button
          type="button"
          className="text-button"
          onClick={() => setDialog('refund')}
          aria-label={`Rembourser le reçu ${payment.receipt_number}`}
        >
          <Icon name="undo" size={17} />
          Rembourser
        </button>
      )}
      {valid && !payment.has_refunds && canCancel(payment, user?.id, can) && (
        <button
          type="button"
          className="text-button text-button--danger"
          onClick={() => setDialog('cancel')}
          aria-label={`Annuler le reçu ${payment.receipt_number}`}
        >
          <Icon name="close" size={17} />
          Annuler
        </button>
      )}
      {dialog === 'refund' && <RefundDialog payment={payment} onClose={() => setDialog(null)} />}
      {dialog === 'cancel' && (
        <CancelPaymentDialog payment={payment} onClose={() => setDialog(null)} />
      )}
    </span>
  )
}

export function RefundDialog({
  payment,
  onClose,
}: {
  payment: PaymentActionTarget
  onClose: () => void
}) {
  const methods = useQuery(paymentMethodsQuery)
  const refresh = useCashRefresh()
  const { notify } = useToast()
  const [amount, setAmount] = useState(String(payment.refundable_fcfa))
  const [method, setMethod] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({})

  const mutation = useMutation({
    mutationFn: () =>
      refundPayment(payment.id, {
        amount_fcfa: Number(amount),
        method: method || null,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      refresh()
      notify(`Remboursement de ${formatFcfa(Number(amount))} enregistré`)
      onClose()
    },
  })

  function submit() {
    const value = Number(amount)
    const next: typeof errors = {}
    if (!Number.isInteger(value) || value < 1) next.amount = 'Montant entier en FCFA, au moins 1.'
    else if (value > payment.refundable_fcfa)
      next.amount = `Au plus ${formatFcfa(payment.refundable_fcfa)} sur ce versement.`
    if (!reason.trim()) next.reason = 'Le motif est obligatoire.'
    setErrors(next)
    if (Object.keys(next).length === 0) mutation.mutate()
  }

  return (
    <Modal
      title="Rembourser"
      subtitle={`Reçu ${payment.receipt_number} · ${formatFcfa(payment.amount_fcfa)} · le versement d’origine reste intact.`}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Enregistrer le remboursement"
      submitIcon="undo"
      submitting={mutation.isPending}
      danger
      size="small"
    >
      <div className="fields">
        <TextField
          label="Montant remboursé (FCFA)"
          type="number"
          min={1}
          max={payment.refundable_fcfa}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={errors.amount}
          hint={`Remboursable : ${formatFcfa(payment.refundable_fcfa)}`}
          required
        />
        <SelectField
          label="Moyen de remboursement"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          <option value="">Comme le versement ({payment.method_label})</option>
          {(methods.data ?? []).map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </SelectField>
        <TextAreaField
          className="full"
          label="Motif du remboursement"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={errors.reason}
          required
        />
      </div>
    </Modal>
  )
}

export function CancelPaymentDialog({
  payment,
  onClose,
}: {
  payment: PaymentActionTarget
  onClose: () => void
}) {
  const refresh = useCashRefresh()
  const { notify } = useToast()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()
  const mutation = useMutation({
    mutationFn: () => cancelPayment(payment.id, reason.trim()),
    onSuccess: () => {
      refresh()
      notify(`Encaissement ${payment.receipt_number} annulé`)
      onClose()
    },
  })

  return (
    <Modal
      title="Annuler l’encaissement"
      subtitle={`Reçu ${payment.receipt_number} · ${formatFcfa(payment.amount_fcfa)}`}
      onClose={onClose}
      onSubmit={() =>
        reason.trim() ? mutation.mutate() : setError('Le motif d’annulation est obligatoire.')
      }
      submitLabel="Annuler l’encaissement"
      submitting={mutation.isPending}
      danger
      size="small"
    >
      <p style={{ marginBottom: 10 }}>
        L’encaissement reste dans l’historique avec la mention « Annulé » et n’est plus compté dans
        la caisse. Pour rendre de l’argent au client, utilisez plutôt un remboursement.
      </p>
      <TextAreaField
        label="Motif d’annulation"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={error}
        required
      />
    </Modal>
  )
}
