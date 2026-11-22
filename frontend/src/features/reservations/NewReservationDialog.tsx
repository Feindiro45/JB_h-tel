import { Icon } from '../../shared/ui/Icon'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { paymentMethodsQuery } from '../../shared/api/lookups'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toUserError } from '../../shared/api/errors'
import { newIdempotencyKey } from '../../shared/api/idempotency'
import { useConnectivity } from '../../shared/offline/connectivity'
import { isLocalId } from '../../shared/offline/localRefs'
import type { Customer } from '../../shared/api/types'
import { useErrorModal } from '../../shared/ui/errorModalContext'
import { SelectField, TextAreaField, TextField } from '../../shared/ui/fields'
import { Modal } from '../../shared/ui/Modal'
import { useToast } from '../../shared/ui/toastContext'
import { formatFcfa, todayIso } from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import { calendarDaysBetween } from './calendarDays'
import { recordPayment } from '../cashier'
import { createCustomer, customersQuery } from '../customers'
import {
  createReservation,
  freeRooms,
  quoteReservation,
  reservationKeys,
  type ReservationInput,
} from './api'

type DiscountType = 'NONE' | 'PERCENT' | 'FIXED'
type PaymentMode = 'deferred' | 'full' | 'partial'

/**
 * Réservation guidée (document 03) : client → occupants → période → chambre compatible →
 * prix et remise → paiement → confirmation. Les chambres proposées sont **réellement libres**
 * sur la période ; le prix est un devis du serveur (seule source d'autorité).
 */
export function NewReservationDialog({ onClose }: { onClose: () => void }) {
  const methods = useQuery(paymentMethodsQuery)
  const { can } = useCurrentUser()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showError } = useErrorModal()
  const { notify } = useToast()
  const { online } = useConnectivity()
  const today = todayIso()

  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [search, setSearch] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [newCustomer, setNewCustomer] = useState({ name: '', first_name: '', phone: '', email: '' })
  const [primary, setPrimary] = useState('')
  const [others, setOthers] = useState('')
  const [period, setPeriod] = useState({
    start_date: today,
    end_date: today,
    start_time: '',
    end_time: '',
  })
  const [unit, setUnit] = useState<'DAY' | 'HALF_DAY'>('DAY')
  const [halfDayQuantity, setHalfDayQuantity] = useState('1')
  const dayDifference = calendarDaysBetween(period.start_date, period.end_date)
  const quantity =
    unit === 'DAY'
      ? dayDifference === null
        ? ''
        : String(Math.max(1, dayDifference))
      : halfDayQuantity
  const [chosenRoomId, setRoomId] = useState('')
  const [discount, setDiscount] = useState<{ type: DiscountType; value: string; reason: string }>({
    type: 'NONE',
    value: '',
    reason: '',
  })
  const [payment, setPayment] = useState<{ mode: PaymentMode; amount: string; method: string }>({
    mode: 'deferred',
    amount: '',
    method: 'CASH',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const occupants = [primary, ...others.split('\n')].map((name) => name.trim()).filter(Boolean)
  const periodValid =
    period.start_date !== '' && period.end_date !== '' && period.end_date >= period.start_date
  const periodParams = {
    start_date: period.start_date,
    end_date: period.end_date,
    start_time: period.start_time || null,
    end_time: period.end_time || null,
  }

  const matches = useQuery({
    ...customersQuery(search.trim()),
    enabled: mode === 'existing' && search.trim().length >= 2,
  })
  const rooms = useQuery({
    queryKey: ['free-rooms', periodParams, Math.max(1, occupants.length)],
    queryFn: () => freeRooms({ ...periodParams, min_capacity: Math.max(1, occupants.length) }),
    enabled: periodValid,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    // Hors ligne, les chambres libres sont calculées sur le poste (lot 4, 4.5).
    networkMode: 'always',
    meta: { silentError: true },
  })

  // Une chambre choisie qui n'est plus libre (dates modifiées) est désélectionnée d'office.
  const roomId = rooms.data?.some(({ room }) => room.id === chosenRoomId) ? chosenRoomId : ''

  const paymentMethod = methods.data?.some((m) => m.value === payment.method)
    ? payment.method
    : (methods.data?.[0]?.value ?? '')

  const payload: ReservationInput = {
    room_id: roomId,
    customer_id: customer?.id ?? null,
    ...periodParams,
    billing_unit: unit,
    quantity: Number(quantity),
    occupants: occupants.map((name, index) => ({ name, is_primary: index === 0 })),
    discount:
      discount.type === 'NONE'
        ? null
        : { type: discount.type, value: discount.value, reason: discount.reason },
    confirm: true,
  }
  const quoteReady =
    roomId !== '' &&
    periodValid &&
    Number(quantity) >= 1 &&
    Number(quantity) <= 365 &&
    occupants.length > 0 &&
    (discount.type === 'NONE' || (discount.value !== '' && discount.reason.trim() !== ''))
  const quote = useQuery({
    queryKey: ['quote', { ...payload, customer_id: null }],
    queryFn: () => quoteReservation({ ...payload, customer_id: null }),
    enabled: quoteReady,
    retry: false,
    networkMode: 'always',
    meta: { silentError: true },
  })

  // Une clé par écriture, gardée pour les nouveaux essais de ce dialogue (lot 3) : un double clic
  // ou une réponse perdue ne crée ni deuxième client, ni deuxième séjour, ni deuxième encaissement.
  const [keys] = useState(() => ({
    customer: newIdempotencyKey(),
    reservation: newIdempotencyKey(),
    payment: newIdempotencyKey(),
  }))
  const submit = useMutation({
    mutationFn: async () => {
      let customerId = customer?.id
      if (mode === 'new') {
        const created = await createCustomer(
          { ...newCustomer, email: newCustomer.email || null },
          keys.customer,
        )
        // Fiche conservée : une nouvelle tentative (chambre prise entre-temps…) ne crée pas de doublon.
        setCustomer(created)
        setMode('existing')
        customerId = created.id
      }
      const reservation = await createReservation(
        { ...payload, customer_id: customerId },
        keys.reservation,
      )
      let paymentError: unknown = null
      if (payment.mode !== 'deferred') {
        const amount = payment.mode === 'full' ? reservation.price.net_fcfa : Number(payment.amount)
        try {
          await recordPayment(
            reservation.id,
            { amount_fcfa: amount, method: paymentMethod },
            keys.payment,
          )
        } catch (error) {
          paymentError = error
        }
      }
      return { reservation, paymentError }
    },
    onSuccess: ({ reservation, paymentError }) => {
      void queryClient.invalidateQueries({ queryKey: reservationKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['occupancy'] })
      void queryClient.invalidateQueries({ queryKey: ['planning'] })
      if (paymentError) {
        showError(paymentError)
        notify('Réservation enregistrée. L’encaissement est à reprendre depuis la fiche.')
      } else if (isLocalId(reservation.id)) {
        notify('Réservation gardée sur ce poste — envoyée au serveur au retour du réseau')
      } else {
        notify('Réservation enregistrée')
      }
      onClose()
      navigate(`/reservations/${reservation.id}`)
    },
  })

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (mode === 'existing' && !customer) next.customer = 'Choisissez un client ou créez sa fiche.'
    if (mode === 'new') {
      if (!newCustomer.name.trim()) next.name = 'Le nom est obligatoire.'
      if (!newCustomer.phone.trim()) next.phone = 'Le téléphone est obligatoire.'
    }
    if (occupants.length === 0) next.primary = 'Indiquez le titulaire du séjour.'
    if (!periodValid) next.end_date = 'La date de départ doit suivre la date d’arrivée.'
    if (period.start_date < today) next.start_date = 'La date d’arrivée ne peut pas être passée.'
    if (!roomId) next.room = 'Choisissez une chambre libre.'
    if (!(Number(quantity) >= 1) || Number(quantity) > 365 || !Number.isInteger(Number(quantity)))
      next.quantity = 'La quantité doit être comprise entre 1 et 365.'
    if (discount.type !== 'NONE') {
      if (!(Number(discount.value) > 0)) next.discount_value = 'Saisissez la valeur de la remise.'
      if (!discount.reason.trim()) next.discount_reason = 'Le motif de la remise est obligatoire.'
    }
    if (payment.mode !== 'deferred' && !paymentMethod)
      next.payment = 'Choisissez un moyen de paiement accepté.'
    if (payment.mode === 'partial') {
      const amount = Number(payment.amount)
      if (!Number.isInteger(amount) || amount < 1) next.payment_amount = 'Montant entier en FCFA.'
      else if (quote.data && amount > quote.data.price.net_fcfa)
        next.payment_amount = 'L’avance dépasse le montant du séjour.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const quoteError = quote.error ? toUserError(quote.error) : null

  return (
    <Modal
      title="Nouvelle réservation"
      subtitle="Client, occupants, période, chambre, prix et règlement."
      onClose={onClose}
      onSubmit={() => validate() && submit.mutate()}
      submitIcon="calendar"
      submitLabel="Créer la réservation"
      submitting={submit.isPending}
    >
      {!online && (
        <p className="notice notice--info" role="status" style={{ marginBottom: 14 }}>
          Hors ligne : chambres libres et prix calculés sur ce poste. Le serveur revérifiera tout au
          retour du réseau.
        </p>
      )}
      <fieldset>
        <legend>Client</legend>
        <div
          className="segmented"
          role="radiogroup"
          aria-label="Type de client"
          style={{ marginBottom: 10 }}
        >
          <label>
            <input
              type="radio"
              name="mode"
              checked={mode === 'existing'}
              onChange={() => setMode('existing')}
            />{' '}
            Client existant
          </label>
          {can('customers.manage') && (
            <label>
              <input
                type="radio"
                name="mode"
                checked={mode === 'new'}
                onChange={() => {
                  setMode('new')
                  setCustomer(null)
                }}
              />{' '}
              Nouveau client
            </label>
          )}
        </div>
        {mode === 'existing' ? (
          customer ? (
            <div className="quote">
              <div className="total">
                <span>{customer.full_name}</span>
                <button type="button" className="text-button" onClick={() => setCustomer(null)}>
                  <Icon name="edit" size={17} />
                  Changer
                </button>
              </div>
              <span>{customer.phone}</span>
            </div>
          ) : (
            <>
              <TextField
                label="Rechercher un client"
                type="search"
                placeholder="Nom, téléphone, e-mail…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                error={errors.customer}
                hint="Au moins deux caractères."
              />
              {matches.data && (
                <ul className="pairs" style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
                  {matches.data.data.length === 0 && (
                    <li className="caption">Aucun client trouvé.</li>
                  )}
                  {matches.data.data.slice(0, 6).map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="secondary"
                        style={{ width: '100%', justifyContent: 'space-between' }}
                        onClick={() => {
                          setCustomer(item)
                          if (!primary) setPrimary(item.full_name)
                        }}
                      >
                        <Icon name="people" size={17} />
                        <span>{item.full_name}</span>
                        <small>{item.phone}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )
        ) : (
          <div className="fields">
            <TextField
              label="Nom"
              value={newCustomer.name}
              onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
              error={errors.name}
              required
            />
            <TextField
              label="Prénoms"
              value={newCustomer.first_name}
              onChange={(e) => setNewCustomer({ ...newCustomer, first_name: e.target.value })}
            />
            <TextField
              label="Téléphone"
              type="tel"
              value={newCustomer.phone}
              onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
              error={errors.phone}
              required
            />
            <TextField
              label="E-mail (facultatif)"
              type="email"
              value={newCustomer.email}
              onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
              hint="Le client recevra la confirmation, ses reçus et sa facture."
            />
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>Occupants</legend>
        <div className="fields">
          <TextField
            label="Titulaire du séjour"
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
            error={errors.primary}
            required
          />
          <TextAreaField
            label="Autres occupants (un par ligne)"
            value={others}
            onChange={(e) => setOthers(e.target.value)}
            rows={2}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>Période et chambre</legend>
        <div className="fields">
          <TextField
            label="Date d’arrivée"
            type="date"
            min={today}
            value={period.start_date}
            onChange={(e) => setPeriod({ ...period, start_date: e.target.value })}
            error={errors.start_date}
            required
          />
          <TextField
            label="Heure d’arrivée (facultative)"
            type="time"
            value={period.start_time}
            onChange={(e) => setPeriod({ ...period, start_time: e.target.value })}
          />
          <TextField
            label="Date de départ"
            type="date"
            min={period.start_date}
            value={period.end_date}
            onChange={(e) => setPeriod({ ...period, end_date: e.target.value })}
            error={errors.end_date}
            required
          />
          <TextField
            label="Heure de départ (facultative)"
            type="time"
            value={period.end_time}
            onChange={(e) => setPeriod({ ...period, end_time: e.target.value })}
          />
          <SelectField
            label="Forfait"
            value={unit}
            onChange={(e) => setUnit(e.target.value as 'DAY' | 'HALF_DAY')}
          >
            <option value="DAY">Journée</option>
            <option value="HALF_DAY">Demi-journée (12 h au plus)</option>
          </SelectField>
          <TextField
            label={unit === 'DAY' ? 'Nombre de jours' : 'Quantité de demi-journées'}
            type="number"
            min={1}
            max={365}
            step={1}
            value={quantity}
            readOnly={unit === 'DAY'}
            onChange={(e) => setHalfDayQuantity(e.target.value)}
            hint={
              unit === 'DAY'
                ? 'Calcul automatique entre les dates, avec une journée minimum pour un séjour le même jour.'
                : 'Chaque forfait couvre au plus 12 heures ; tout supplément doit être validé.'
            }
            error={errors.quantity}
            required
          />
          <SelectField
            className="full"
            label="Chambre"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            error={errors.room}
            hint={
              !period.start_time || !period.end_time
                ? 'Sans heure d’arrivée ou de départ, la chambre est bloquée sur la journée entière (règle prudente).'
                : undefined
            }
          >
            <option value="">
              {rooms.isFetching
                ? 'Recherche des chambres libres…'
                : rooms.data
                  ? `Choisir parmi ${rooms.data.length} chambre(s) libre(s)`
                  : 'Indiquez la période'}
            </option>
            {rooms.data?.map(({ room }) => (
              <option key={room.id} value={room.id}>
                {room.number} · {room.room_type.label} · {room.capacity} pers.
              </option>
            ))}
          </SelectField>
        </div>
      </fieldset>

      <fieldset>
        <legend>Remise</legend>
        <div className="fields">
          <SelectField
            label="Type de remise"
            value={discount.type}
            onChange={(e) => setDiscount({ ...discount, type: e.target.value as DiscountType })}
            disabled={!can('discounts.apply')}
          >
            <option value="NONE">Aucune</option>
            <option value="PERCENT">Pourcentage</option>
            <option value="FIXED">Montant fixe (FCFA)</option>
          </SelectField>
          <TextField
            label="Valeur"
            type="number"
            min={0}
            step={discount.type === 'PERCENT' ? 0.01 : 1}
            value={discount.value}
            disabled={discount.type === 'NONE'}
            onChange={(e) => setDiscount({ ...discount, value: e.target.value })}
            error={errors.discount_value}
          />
          <TextField
            className="full"
            label="Motif de la remise"
            value={discount.reason}
            disabled={discount.type === 'NONE'}
            onChange={(e) => setDiscount({ ...discount, reason: e.target.value })}
            error={errors.discount_reason}
          />
        </div>
      </fieldset>

      <div className="quote" aria-live="polite" style={{ marginBottom: 14 }}>
        {!quoteReady && <span>Choisissez une chambre pour obtenir le prix.</span>}
        {quoteReady && quote.isFetching && <span>Calcul du prix…</span>}
        {quoteReady && quoteError && (
          <>
            <strong>{quoteError.title}</strong>
            <span>{quoteError.message}</span>
            {quoteError.helpMessages.map((line) => (
              <small key={line}>{line}</small>
            ))}
          </>
        )}
        {quoteReady && quote.data && !quote.isFetching && !quoteError && (
          <>
            <span>
              {quote.data.price.billing_unit_label} × {quote.data.price.quantity} ·{' '}
              {formatFcfa(quote.data.price.unit_price_fcfa)} par forfait
            </span>
            {quote.data.price.discount_fcfa > 0 && (
              <span>Remise : − {formatFcfa(quote.data.price.discount_fcfa)}</span>
            )}
            <span className="total">
              <span>Total net</span>
              <span>{formatFcfa(quote.data.price.net_fcfa)}</span>
            </span>
            {!quote.data.available && (
              <strong>Cette chambre n’est plus libre sur la période.</strong>
            )}
          </>
        )}
      </div>

      {can('payments.record') && (
        <fieldset>
          <legend>Règlement</legend>
          <div
            className="segmented"
            role="radiogroup"
            aria-label="Mode de règlement"
            style={{ marginBottom: 10 }}
          >
            {(
              [
                ['deferred', 'Paiement différé'],
                ['full', 'Paiement intégral'],
                ['partial', 'Avance'],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="payment"
                  checked={payment.mode === value}
                  onChange={() => setPayment({ ...payment, mode: value })}
                />{' '}
                {label}
              </label>
            ))}
          </div>
          {payment.mode !== 'deferred' && (
            <div className="fields">
              <SelectField
                label="Moyen de paiement"
                value={paymentMethod}
                onChange={(e) => setPayment({ ...payment, method: e.target.value })}
              >
                {(methods.data ?? []).map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </SelectField>
              {payment.mode === 'partial' && (
                <TextField
                  label="Montant de l’avance (FCFA)"
                  type="number"
                  min={1}
                  step={1}
                  value={payment.amount}
                  onChange={(e) => setPayment({ ...payment, amount: e.target.value })}
                  error={errors.payment_amount}
                />
              )}
            </div>
          )}
        </fieldset>
      )}
    </Modal>
  )
}
