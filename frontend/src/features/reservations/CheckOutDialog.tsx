import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import type { Reservation } from '../../shared/api/types'
import { TextAreaField } from '../../shared/ui/fields'
import { Icon } from '../../shared/ui/Icon'
import { LoadingBlock } from '../../shared/ui/layout'
import { Modal } from '../../shared/ui/Modal'
import { formatDay, formatFcfa } from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import { PaymentDialog, reservationPaymentsQuery } from '../cashier'
import { checkOut } from './api'
import { refreshStay } from './stayRefresh'
import './reservationJourney.css'

/**
 * Départ guidé (D-071, décision de l'utilisateur). Le solde du séjour est affiché : s'il reste à
 * payer, la caissière encaisse d'abord, ou déclare explicitement que le client part sans tout
 * régler, avec un motif que le serveur exige et écrit au journal. Utilisée par la fiche et par la
 * fenêtre « Départs à enregistrer ».
 */
export function CheckOutDialog({
  reservation: r,
  onClose,
  onDone,
}: {
  reservation: Reservation
  onClose: () => void
  onDone: () => void
}) {
  const { can } = useCurrentUser()
  const queryClient = useQueryClient()
  const reasonId = useId()
  const payments = useQuery({
    ...reservationPaymentsQuery(r.id),
    enabled: can('payments.view'),
  })
  const balance = payments.data?.summary.balance_fcfa
  const owes = balance !== undefined && balance > 0
  // Sans droit de consulter la caisse, le solde est inconnu : le motif reste proposé et le
  // serveur dira s'il est nécessaire.
  const balanceUnknown = !can('payments.view')
  const [paying, setPaying] = useState(false)
  const [leavesUnpaid, setLeavesUnpaid] = useState(false)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<{ choice?: string; reason?: string }>({})

  const mutation = useMutation({
    mutationFn: () =>
      checkOut(r.id, {
        unpaid_reason: (owes && leavesUnpaid) || balanceUnknown ? reason.trim() || null : null,
      }),
    onSuccess: () => {
      refreshStay(queryClient, r.id)
      onDone()
    },
    // Solde changé entre-temps (encaissement annulé ailleurs…) : la fenêtre se met à jour.
    onError: () => void payments.refetch(),
  })

  function submit() {
    if (owes && !leavesUnpaid) {
      return setErrors({
        choice:
          'Encaissez le solde, ou cochez « Le client part sans tout payer » et indiquez le motif.',
      })
    }
    if (owes && leavesUnpaid && !reason.trim()) {
      return setErrors({ reason: 'Indiquez pourquoi le client part sans tout payer.' })
    }
    setErrors({})
    mutation.mutate()
  }

  if (paying && owes) {
    return <PaymentDialog reservationId={r.id} balance={balance} onClose={() => setPaying(false)} />
  }

  const end = `${formatDay(r.period.end_date)} · ${r.period.end_time ?? 'fin de journée'}`

  return (
    <Modal
      title="Enregistrer le départ"
      subtitle={[r.room && `Chambre ${r.room.number}`, r.customer?.full_name]
        .filter(Boolean)
        .join(' · ')}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Enregistrer le départ"
      submitIcon="logout"
      submitting={mutation.isPending}
      submitDisabled={can('payments.view') && payments.isPending}
      size="small"
    >
      <p>
        Départ prévu : <strong>{end}</strong>
        {r.departure_overdue && <strong className="checkout-overdue"> · dépassé</strong>}
      </p>
      {can('payments.view') && payments.isPending && (
        <LoadingBlock lines={2} label="Lecture du solde…" />
      )}
      {balance !== undefined && !owes && (
        <p className="notice notice--success" role="status">
          <Icon name="check" size={17} /> Le séjour est soldé : rien à encaisser.
        </p>
      )}
      {owes && (
        <div className="checkout-balance">
          <p className="notice" role="status">
            Il reste <strong>{formatFcfa(balance)}</strong> à encaisser sur ce séjour.
          </p>
          {can('payments.record') && (
            <button type="button" className="primary" onClick={() => setPaying(true)}>
              <Icon name="wallet" size={17} />
              Encaisser le solde
            </button>
          )}
          <label className="wizard-confirm">
            <input
              type="checkbox"
              checked={leavesUnpaid}
              onChange={(e) => setLeavesUnpaid(e.target.checked)}
              aria-invalid={errors.choice ? true : undefined}
              aria-describedby={errors.choice ? `${reasonId}-choice` : undefined}
            />
            Le client part sans tout payer
          </label>
          {errors.choice && (
            <span id={`${reasonId}-choice`} className="field-error">
              {errors.choice}
            </span>
          )}
          {leavesUnpaid && (
            <TextAreaField
              label="Motif du départ avec solde impayé"
              value={reason}
              maxLength={255}
              rows={2}
              onChange={(e) => setReason(e.target.value)}
              error={errors.reason}
              hint="Enregistré dans le journal avec le montant restant dû."
              required
            />
          )}
        </div>
      )}
      {balanceUnknown && (
        <TextAreaField
          label="Motif si le client part sans tout payer (facultatif)"
          value={reason}
          maxLength={255}
          rows={2}
          onChange={(e) => setReason(e.target.value)}
          hint="Le serveur l’exige seulement s’il reste un solde."
        />
      )}
      <p className="caption">Le séjour sera clôturé et la chambre libérée.</p>
    </Modal>
  )
}
