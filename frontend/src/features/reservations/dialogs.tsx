import { Icon } from '../../shared/ui/Icon'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { paymentMethodsQuery } from '../../shared/api/lookups'
import type { ExtensionPreview, Reservation } from '../../shared/api/types'
import { SelectField, TextAreaField, TextField } from '../../shared/ui/fields'
import { Pair } from '../../shared/ui/layout'
import { Modal } from '../../shared/ui/Modal'
import { formatDateTime, formatFcfa } from '../../shared/utils/format'
import {
  extendReservation,
  previewExtension,
  replaceOccupants,
  type CancellationInput,
  type ExtensionInput,
} from './api'

/** Confirmation simple d'une opération tracée (arrivée, départ, confirmation, facture). */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
  pending,
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
  pending: boolean
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      onSubmit={onConfirm}
      submitLabel={confirmLabel}
      submitting={pending}
      size="small"
    >
      {children}
    </Modal>
  )
}

/**
 * Annulation (D-053) : une réservation annulée ne doit plus rien. Ce qui a été encaissé est
 * remboursé dans la même opération (droit de rembourser exigé) et la facture active est annulée
 * par un avoir. Le serveur vérifie de nouveau le montant et le droit.
 */
export function CancelDialog({
  collected,
  canRefund,
  activeInvoiceNumber,
  onConfirm,
  onClose,
  pending,
}: {
  /** Encaissé net du séjour ; `undefined` pendant le chargement. */
  collected: number | undefined
  canRefund: boolean
  activeInvoiceNumber: string | null
  onConfirm: (input: CancellationInput) => void
  onClose: () => void
  pending: boolean
}) {
  const methods = useQuery(paymentMethodsQuery)
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState('')
  const [error, setError] = useState<string>()
  const toRefund = collected ?? 0
  const blocked = toRefund > 0 && !canRefund
  return (
    <Modal
      title="Annuler la réservation"
      subtitle="L’annulation est définitive et tracée dans le journal."
      onClose={onClose}
      onSubmit={() =>
        reason.trim()
          ? onConfirm({
              reason: reason.trim(),
              refund_fcfa: toRefund,
              refund_method: toRefund > 0 ? method || null : null,
            })
          : setError('Le motif est obligatoire.')
      }
      submitLabel={
        toRefund > 0 ? `Annuler et rembourser ${formatFcfa(toRefund)}` : 'Annuler la réservation'
      }
      submitting={pending}
      submitDisabled={collected === undefined || blocked}
      danger
      size="small"
    >
      <div className="fields">
        <TextAreaField
          className="full"
          label="Motif d’annulation"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={error}
          required
        />
        {toRefund > 0 && canRefund && (
          <SelectField
            className="full"
            label="Moyen de remboursement"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="">Comme chaque versement</option>
            {(methods.data ?? []).map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </SelectField>
        )}
      </div>
      {blocked ? (
        <p className="notice" role="alert" style={{ marginTop: 12 }}>
          Cette réservation a déjà {formatFcfa(toRefund)} encaissés. Son annulation rembourse cette
          somme au client : demandez à un administrateur de l’effectuer.
        </p>
      ) : toRefund > 0 ? (
        <p className="notice" style={{ marginTop: 12 }}>
          {formatFcfa(toRefund)} déjà encaissés seront remboursés intégralement au client avec
          l’annulation. Les reçus d’origine restent dans l’historique.
        </p>
      ) : null}
      <p className="caption" style={{ marginTop: 8 }}>
        Une réservation annulée ne doit plus rien : elle ne compte plus dans la caisse ni dans les
        soldes.
        {activeInvoiceNumber && ` La facture ${activeInvoiceNumber} sera annulée par un avoir.`}
      </p>
    </Modal>
  )
}

export function OccupantsDialog({
  reservation,
  onDone,
  onClose,
}: {
  reservation: Reservation
  onDone: () => void
  onClose: () => void
}) {
  const [text, setText] = useState((reservation.occupants ?? []).map((o) => o.name).join('\n'))
  const [error, setError] = useState<string>()
  const mutation = useMutation({
    mutationFn: (names: string[]) =>
      replaceOccupants(
        reservation.id,
        names.map((name, index) => ({ name, is_primary: index === 0 })),
      ),
    onSuccess: onDone,
  })
  return (
    <Modal
      title="Modifier les occupants"
      subtitle={`Capacité de la chambre ${reservation.room?.number} : ${reservation.room?.capacity} personne(s). Le prix ne change pas.`}
      onClose={onClose}
      onSubmit={() => {
        const names = text
          .split('\n')
          .map((name) => name.trim())
          .filter(Boolean)
        if (names.length === 0) return setError('Indiquez au moins un occupant.')
        mutation.mutate(names)
      }}
      submitting={mutation.isPending}
      size="small"
    >
      <TextAreaField
        label="Occupants, un par ligne (le premier est le titulaire)"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        error={error}
      />
    </Modal>
  )
}

/**
 * Prolongation en deux temps (règles validées) : aperçu du supplément et des conflits, puis
 * validation explicite. Aucune conversion automatique en journée.
 */
export function ExtendDialog({
  reservation,
  activeInvoiceNumber,
  onDone,
  onClose,
}: {
  reservation: Reservation
  /** D-053 : facture active, remplacée dans la même opération par une facture détaillée. */
  activeInvoiceNumber: string | null
  onDone: (replacementInvoiceNumber: string | null) => void
  onClose: () => void
}) {
  const [input, setInput] = useState<ExtensionInput>({
    end_date: reservation.period.end_date,
    end_time: reservation.period.end_time,
    additional_quantity: 1,
  })
  const [preview, setPreview] = useState<ExtensionPreview | null>(null)
  const previewMutation = useMutation({
    mutationFn: () => previewExtension(reservation.id, input),
    onSuccess: setPreview,
  })
  const extendMutation = useMutation({
    mutationFn: () => extendReservation(reservation.id, input),
    onSuccess: (result) => onDone(result.replacementInvoiceNumber),
  })

  if (preview) {
    return (
      <Modal
        title="Valider la prolongation"
        subtitle="Le prix unitaire de la réservation est conservé. Confirmez le supplément."
        onClose={onClose}
        onSubmit={() => extendMutation.mutate()}
        submitLabel={`Valider (+ ${formatFcfa(preview.supplement_fcfa)})`}
        submitting={extendMutation.isPending}
        submitDisabled={!preview.possible}
        size="small"
      >
        <div className="pairs grid-pairs">
          <Pair label="Nouveau départ">{formatDateTime(preview.new_period.blocked_until)}</Pair>
          <Pair label="Montant actuel">{formatFcfa(preview.current_price.net_fcfa)}</Pair>
          <Pair label="Supplément">{formatFcfa(preview.supplement_fcfa)}</Pair>
          <Pair label="Nouveau total">{formatFcfa(preview.proposed_price.net_fcfa)}</Pair>
        </div>
        {!preview.possible && (
          <p className="notice" role="alert" style={{ marginTop: 12 }}>
            La chambre n’est pas libre sur la prolongation demandée.
          </p>
        )}
        {preview.possible && activeInvoiceNumber && (
          <p className="notice" style={{ marginTop: 12 }}>
            La facture {activeInvoiceNumber} sera annulée par un avoir et remplacée par une nouvelle
            facture qui détaille le séjour initial et la prolongation.
          </p>
        )}
        <button
          type="button"
          className="text-button"
          style={{ marginTop: 10 }}
          onClick={() => setPreview(null)}
        >
          <Icon name="back" size={17} />
          <span className="sr-only">←</span> Modifier la demande
        </button>
      </Modal>
    )
  }

  return (
    <Modal
      title="Prolonger le séjour"
      subtitle="Un aperçu du supplément est affiché avant toute validation."
      onClose={onClose}
      onSubmit={() => previewMutation.mutate()}
      submitLabel="Calculer le supplément"
      submitting={previewMutation.isPending}
      size="small"
    >
      <div className="fields">
        <TextField
          label="Nouvelle date de départ"
          type="date"
          min={reservation.period.end_date}
          value={input.end_date}
          onChange={(e) => setInput({ ...input, end_date: e.target.value })}
          required
        />
        <TextField
          label="Nouvelle heure de départ"
          type="time"
          value={input.end_time ?? ''}
          onChange={(e) => setInput({ ...input, end_time: e.target.value || null })}
        />
        <TextField
          className="full"
          label={`${reservation.price.billing_unit_label}(s) à ajouter`}
          type="number"
          min={0}
          step={1}
          value={String(input.additional_quantity)}
          onChange={(e) => setInput({ ...input, additional_quantity: Number(e.target.value) })}
          hint={`Quantité actuelle : ${reservation.price.quantity}. Une demi-journée couvre 12 h au plus.`}
        />
      </div>
    </Modal>
  )
}
