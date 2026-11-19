import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { SelectField, TextField } from '../../shared/ui/fields'
import { Modal } from '../../shared/ui/Modal'
import { useToast } from '../../shared/ui/toastContext'
import { formatFcfa } from '../../shared/utils/format'
import { PAYMENT_METHODS, paymentsKey, recordPayment } from './api'

/** Encaissement (intégral, avance ou solde). Le serveur refuse tout trop-perçu (D-014). */
export function PaymentDialog({
  reservationId,
  balance,
  onClose,
}: {
  reservationId: string
  balance: number
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const [amount, setAmount] = useState(String(Math.max(0, balance)))
  const [method, setMethod] = useState('CASH')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string>()

  const mutation = useMutation({
    mutationFn: () =>
      recordPayment(reservationId, {
        amount_fcfa: Number(amount),
        method,
        reference: reference.trim() || null,
      }),
    onSuccess: (payment) => {
      void queryClient.invalidateQueries({ queryKey: paymentsKey(reservationId) })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['reservations', reservationId, 'history'] })
      notify(`Encaissement enregistré — reçu ${payment.receipt_number}`)
      onClose()
    },
  })

  function submit() {
    const value = Number(amount)
    if (!Number.isInteger(value) || value < 1)
      return setError('Montant entier en FCFA, au moins 1.')
    if (value > balance)
      return setError(`Le montant dépasse le solde restant (${formatFcfa(balance)}).`)
    setError(undefined)
    mutation.mutate()
  }

  return (
    <Modal
      title="Encaisser"
      subtitle={`Solde restant : ${formatFcfa(balance)}`}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Enregistrer l’encaissement"
      submitting={mutation.isPending}
      size="small"
    >
      <div className="fields">
        <TextField
          label="Montant (FCFA)"
          type="number"
          min={1}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={error}
          required
        />
        <SelectField
          label="Moyen de paiement"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          {PAYMENT_METHODS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </SelectField>
        <TextField
          className="full"
          label="Référence (facultative)"
          placeholder="N° de transaction mobile money, virement…"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </div>
    </Modal>
  )
}
