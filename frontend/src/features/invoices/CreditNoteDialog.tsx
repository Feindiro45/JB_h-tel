import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TextAreaField } from '../../shared/ui/fields'
import { Modal } from '../../shared/ui/Modal'
import { useToast } from '../../shared/ui/toastContext'
import { formatFcfa } from '../../shared/utils/format'
import { creditInvoice } from './api'

/**
 * Avoir motivé : la facture émise n'est jamais modifiée ; elle passe « annulée par avoir » et
 * une nouvelle facture peut ensuite être émise depuis la réservation (D-037).
 */
export function CreditNoteDialog({
  invoice,
  onClose,
}: {
  invoice: { id: string; number: string; net_fcfa: number }
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()
  const mutation = useMutation({
    mutationFn: () => creditInvoice(invoice.id, reason.trim()),
    onSuccess: (credit) => {
      for (const key of [['invoices'], ['dashboard'], ['reservations']]) {
        void queryClient.invalidateQueries({ queryKey: key })
      }
      notify(`Avoir ${credit.number} émis`)
      onClose()
    },
  })

  return (
    <Modal
      title="Émettre un avoir"
      subtitle={`Facture ${invoice.number} · ${formatFcfa(invoice.net_fcfa)}`}
      onClose={onClose}
      onSubmit={() =>
        reason.trim() ? mutation.mutate() : setError('Le motif de l’avoir est obligatoire.')
      }
      submitLabel="Émettre l’avoir"
      submitting={mutation.isPending}
      danger
      size="small"
    >
      <p style={{ marginBottom: 10 }}>
        L’avoir annule la facture pour son montant total. La facture reste consultable, et une
        nouvelle facture pourra être émise depuis la réservation.
      </p>
      <TextAreaField
        label="Motif de l’avoir"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={error}
        required
      />
    </Modal>
  )
}
