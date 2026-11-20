import { Icon } from '../../shared/ui/Icon'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { paymentMethodsQuery } from '../../shared/api/lookups'
import type { ExtensionPreview, Quote, Reservation } from '../../shared/api/types'
import { SelectField, TextAreaField, TextField } from '../../shared/ui/fields'
import { Pair } from '../../shared/ui/layout'
import { Modal } from '../../shared/ui/Modal'
import { addDays, formatDateTime, formatDay, formatFcfa } from '../../shared/utils/format'
import { calendarDaysBetween } from './calendarDays'
import {
  extendReservation,
  modifyReservation,
  previewExtension,
  previewModification,
  replaceOccupants,
  type CancellationInput,
  type ExtensionInput,
  type ModificationInput,
} from './api'
import { roomsQuery } from '../catalog'

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
    end_date:
      reservation.price.billing_unit === 'DAY'
        ? addDays(reservation.period.end_date, 1)
        : reservation.period.end_date,
    end_time: reservation.period.end_time,
    additional_quantity: 1,
  })
  const isDay = reservation.price.billing_unit === 'DAY'
  const addedDays = calendarDaysBetween(reservation.period.end_date, input.end_date)
  const extensionInput = isDay ? { ...input, additional_quantity: addedDays ?? 0 } : input
  const [preview, setPreview] = useState<ExtensionPreview | null>(null)
  const previewMutation = useMutation({
    mutationFn: () => previewExtension(reservation.id, extensionInput),
    onSuccess: setPreview,
  })
  const extendMutation = useMutation({
    mutationFn: () => extendReservation(reservation.id, extensionInput),
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
      submitDisabled={isDay && (addedDays === null || addedDays > 365)}
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
          label={isDay ? 'Jours à ajouter' : `${reservation.price.billing_unit_label}(s) à ajouter`}
          type="number"
          min={0}
          step={1}
          value={
            isDay
              ? addedDays === null
                ? ''
                : String(addedDays)
              : String(input.additional_quantity)
          }
          readOnly={isDay}
          onChange={(e) => setInput({ ...input, additional_quantity: Number(e.target.value) })}
          hint={
            isDay
              ? `Calcul automatique depuis le départ actuel (${formatDay(reservation.period.end_date)}). Quantité déjà enregistrée : ${reservation.price.quantity}.`
              : `Quantité actuelle : ${reservation.price.quantity}. Une demi-journée couvre 12 h au plus.`
          }
        />
      </div>
    </Modal>
  )
}

/**
 * Correction d'une réservation avant le séjour (D-058) : chambre, dates, heures et forfait. Le
 * serveur recalcule le prix au tarif en vigueur (même remise), revérifie la disponibilité et
 * exige un motif. Une réservation facturée n'est modifiable que par l'administrateur ; la facture
 * est alors remplacée.
 */
export function ModifyDialog({
  reservation,
  activeInvoiceNumber,
  onDone,
  onClose,
}: {
  reservation: Reservation
  activeInvoiceNumber: string | null
  onDone: (replacementInvoiceNumber: string | null) => void
  onClose: () => void
}) {
  const rooms = useQuery(roomsQuery)
  const [input, setInput] = useState({
    room_id: reservation.room?.id ?? '',
    start_date: reservation.period.start_date,
    end_date: reservation.period.end_date,
    start_time: reservation.period.start_time ?? '',
    end_time: reservation.period.end_time ?? '',
    billing_unit: reservation.price.billing_unit,
    half_days: String(reservation.price.quantity),
  })
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string>()
  const [preview, setPreview] = useState<(Quote & { current_net_fcfa: number }) | null>(null)
  const days = calendarDaysBetween(input.start_date, input.end_date)
  const quantity =
    input.billing_unit === 'DAY' ? Math.max(1, days ?? 1) : Number(input.half_days) || 0
  const payload: ModificationInput = {
    room_id: input.room_id,
    start_date: input.start_date,
    end_date: input.end_date,
    start_time: input.start_time || null,
    end_time: input.end_time || null,
    billing_unit: input.billing_unit,
    quantity,
  }
  const change = (patch: Partial<typeof input>) => {
    setInput({ ...input, ...patch })
    setPreview(null)
  }
  const previewMutation = useMutation({
    mutationFn: () => previewModification(reservation.id, payload),
    onSuccess: setPreview,
  })
  const save = useMutation({
    mutationFn: () => modifyReservation(reservation.id, { ...payload, reason: reason.trim() }),
    onSuccess: (result) => onDone(result.replacementInvoiceNumber),
  })

  return (
    <Modal
      title="Modifier la réservation"
      subtitle="Correction avant le séjour : la disponibilité et le prix sont recalculés par le serveur."
      onClose={onClose}
      onSubmit={() => {
        if (!preview) return previewMutation.mutate()
        if (!reason.trim()) return setReasonError('Le motif de la modification est obligatoire.')
        save.mutate()
      }}
      submitLabel={preview ? 'Enregistrer la modification' : 'Calculer le nouveau prix'}
      submitIcon={preview ? 'check' : 'refresh'}
      submitting={previewMutation.isPending || save.isPending}
      submitDisabled={Boolean(preview && !preview.available) || days === null}
    >
      <div className="fields">
        <SelectField
          className="full"
          label="Chambre"
          value={input.room_id}
          onChange={(event) => change({ room_id: event.target.value })}
          required
        >
          {(rooms.data ?? []).map((room) => (
            <option key={room.id} value={room.id}>
              {room.number} · {room.room_type.label} · {room.capacity} pers.
              {room.maintenance_status === 'MAINTENANCE' ? ' · en maintenance' : ''}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Arrivée"
          type="date"
          value={input.start_date}
          onChange={(event) => change({ start_date: event.target.value })}
          required
        />
        <TextField
          label="Départ"
          type="date"
          min={input.start_date}
          value={input.end_date}
          onChange={(event) => change({ end_date: event.target.value })}
          required
        />
        <TextField
          label="Heure d’arrivée"
          type="time"
          value={input.start_time}
          onChange={(event) => change({ start_time: event.target.value })}
        />
        <TextField
          label="Heure de départ"
          type="time"
          value={input.end_time}
          onChange={(event) => change({ end_time: event.target.value })}
        />
        <SelectField
          label="Forfait"
          value={input.billing_unit}
          onChange={(event) => change({ billing_unit: event.target.value as 'DAY' | 'HALF_DAY' })}
        >
          <option value="DAY">Journée</option>
          <option value="HALF_DAY">Demi-journée</option>
        </SelectField>
        {input.billing_unit === 'DAY' ? (
          <TextField
            label="Journées"
            value={days === null ? '' : String(quantity)}
            readOnly
            hint="Calculées à partir des dates (une journée minimum)."
          />
        ) : (
          <TextField
            label="Demi-journées"
            type="number"
            min={1}
            max={365}
            step={1}
            value={input.half_days}
            onChange={(event) => change({ half_days: event.target.value })}
          />
        )}
      </div>
      {preview && (
        <>
          <div className="pairs grid-pairs" style={{ marginTop: 12 }}>
            <Pair label="Chambre">
              {preview.room.number} · {preview.room.room_type.label}
            </Pair>
            <Pair label="Période bloquée">
              {formatDateTime(preview.period.blocked_from)} →{' '}
              {formatDateTime(preview.period.blocked_until)}
            </Pair>
            <Pair label="Montant actuel">{formatFcfa(preview.current_net_fcfa)}</Pair>
            <Pair label="Nouveau montant">{formatFcfa(preview.price.net_fcfa)}</Pair>
          </div>
          {!preview.available ? (
            <p className="notice" role="alert" style={{ marginTop: 12 }}>
              La chambre {preview.room.number} n’est pas libre sur cette période : choisissez une
              autre chambre ou d’autres dates.
            </p>
          ) : (
            <TextAreaField
              className="full"
              label="Motif de la modification"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              error={reasonError}
              maxLength={255}
              required
            />
          )}
          {activeInvoiceNumber && preview.available && (
            <p className="caption" style={{ marginTop: 8 }}>
              La facture {activeInvoiceNumber} sera annulée par un avoir et remplacée
              (administrateur seulement).
            </p>
          )}
        </>
      )}
    </Modal>
  )
}
