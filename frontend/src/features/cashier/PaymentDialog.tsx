import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useIdempotencyKey } from '../../shared/api/idempotency'
import { paymentMethodsQuery } from '../../shared/api/lookups'
import { useState } from 'react'
import { SelectField, TextField } from '../../shared/ui/fields'
import { Modal } from '../../shared/ui/Modal'
import { useToast } from '../../shared/ui/toastContext'
import { formatFcfa } from '../../shared/utils/format'
import { CASH_KEYS, recordPayment } from './api'

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
  const methods = useQuery(paymentMethodsQuery)
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const [amount, setAmount] = useState(String(Math.max(0, balance)))
  const [method, setMethod] = useState('CASH')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string>()

  // Même clé pour tous les essais de ce dialogue : un double clic n’encaisse qu’une fois (lot 3).
  const idempotencyKey = useIdempotencyKey()
  const mutation = useMutation({
    mutationFn: () =>
      recordPayment(
        reservationId,
        {
          amount_fcfa: Number(amount),
          method: methods.data?.some((m) => m.value === method)
            ? method
            : (methods.data?.[0]?.value ?? ''),
          reference: reference.trim() || null,
        },
        idempotencyKey,
      ),
    onSuccess: (payment) => {
      // Fiche du séjour, caisse, liste des reçus, soldes et tableau de bord.
      for (const key of [...CASH_KEYS, ['reservations', reservationId]]) {
        void queryClient.invalidateQueries({ queryKey: key })
      }
      notify(
        payment.receipt_number.startsWith('LOC-')
          ? `Encaissement gardé sur ce poste — reçu provisoire ${payment.receipt_number}, envoyé au retour du réseau`
          : `Encaissement enregistré — reçu ${payment.receipt_number}`,
      )
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
      submitIcon="wallet"
      submitting={mutation.isPending}
      submitDisabled={!methods.data?.length}
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
          value={
            methods.data?.some((m) => m.value === method)
              ? method
              : (methods.data?.[0]?.value ?? '')
          }
          onChange={(e) => setMethod(e.target.value)}
        >
          {(methods.data ?? []).map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </SelectField>
        <TextField
          className="full"
          label="Référence (facultative)"
          placeholder="N° de transaction mobile money, virement…"
          hint="Jamais de numéro de carte bancaire ni de code secret : ce champ est imprimé sur le reçu."
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </div>
    </Modal>
  )
}
