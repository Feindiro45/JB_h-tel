import { Icon } from '../../shared/ui/Icon'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { paymentMethodsQuery } from '../../shared/api/lookups'
import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { toUserError } from '../../shared/api/errors'
import { newIdempotencyKey } from '../../shared/api/idempotency'
import { useConnectivity } from '../../shared/offline/connectivity'
import { isLocalId } from '../../shared/offline/localRefs'
import {
  isConferenceRoom,
  type Customer,
  type OrganizerType,
  type RoomKind,
} from '../../shared/api/types'
import { useErrorModal } from '../../shared/ui/errorModalContext'
import { SelectField, TextAreaField, TextField } from '../../shared/ui/fields'
import { Modal } from '../../shared/ui/Modal'
import { useToast } from '../../shared/ui/toastContext'
import { formatDay, formatFcfa, todayIso } from '../../shared/utils/format'
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
import { ORGANIZER_TYPES, organizerLabel, type EventInput } from './organizers'
import './reservationJourney.css'

type DiscountType = 'NONE' | 'PERCENT' | 'FIXED'
type PaymentMode = 'deferred' | 'full' | 'partial'
type StepId = 'client' | 'stay' | 'recap' | 'payment'

function stepLabel(step: StepId, conference: boolean): string {
  return {
    client: conference ? 'Client et occupant de la salle' : 'Client et occupants',
    stay: conference ? 'Événement et salle' : 'Séjour et prix',
    recap: 'Récapitulatif',
    payment: 'Encaissement',
  }[step]
}

const PHONE = /^[0-9+().\s-]{6,30}$/

/** Étape où corriger un champ refusé par le serveur (fiche client, période, chambre, remise). */
const CLIENT_FIELDS = ['name', 'first_name', 'phone', 'email', 'customer_id']
function stepOfField(field: string): StepId {
  if (field === 'event' || field === 'event.name') return 'stay'
  return CLIENT_FIELDS.includes(field) ||
    field.startsWith('occupants') ||
    field.startsWith('event.')
    ? 'client'
    : 'stay'
}

/**
 * Réservation guidée en assistant (document 03, D-071) : une étape à la fois — client et
 * occupants → séjour et prix → récapitulatif que le client confirme → encaissement, dont le choix
 * est obligatoire (tout, avance ou plus tard). La réservation n'est créée, et sa facture émise
 * (D-067), qu'à la dernière étape. Les chambres proposées sont **réellement libres** sur la
 * période ; le prix est un devis du serveur (seule source d'autorité).
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
  const confirmId = useId()
  const paymentErrorId = useId()

  const steps: StepId[] = can('payments.record')
    ? ['client', 'stay', 'recap', 'payment']
    : ['client', 'stay', 'recap']
  const [stepIndex, setStepIndex] = useState(0)
  const current = steps[Math.min(stepIndex, steps.length - 1)]
  const last = stepIndex >= steps.length - 1

  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [search, setSearch] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [newCustomer, setNewCustomer] = useState({ name: '', first_name: '', phone: '', email: '' })
  const [primary, setPrimary] = useState('')
  const [others, setOthers] = useState('')
  // D-072 : une chambre (occupants) ou une salle de conférence (événement).
  const [kind, setKind] = useState<RoomKind>('ROOM')
  const conference = kind === 'CONFERENCE'
  const [event, setEvent] = useState({
    name: '',
    organizer_type: '' as OrganizerType | '',
    organizer_type_other: '',
    organization_name: '',
    contact_name: '',
    contact_phone: '',
  })
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
  // D-071 : aucun mode présélectionné, la caissière doit choisir.
  const [payment, setPayment] = useState<{
    mode: PaymentMode | null
    amount: string
    method: string
  }>({ mode: null, amount: '', method: 'CASH' })
  const [confirmed, setConfirmed] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const occupants = [primary, ...others.split('\n')].map((name) => name.trim()).filter(Boolean)
  const minCapacity = conference ? 1 : Math.max(1, occupants.length)
  const eventInput: EventInput | null =
    conference && event.organizer_type
      ? {
          name: event.name.trim(),
          organizer_type: event.organizer_type,
          organizer_type_other:
            event.organizer_type === 'OTHER' ? event.organizer_type_other.trim() || null : null,
          organization_name:
            event.organizer_type === 'INDIVIDUAL' ? null : event.organization_name.trim() || null,
          contact_name: event.contact_name.trim() || null,
          contact_phone: event.contact_phone.trim() || null,
        }
      : null
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
    queryKey: ['free-rooms', periodParams, minCapacity],
    queryFn: () => freeRooms({ ...periodParams, min_capacity: minCapacity }),
    enabled: periodValid && current !== 'client',
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    // Hors ligne, les chambres libres sont calculées sur le poste (lot 4, 4.5).
    networkMode: 'always',
    meta: { silentError: true },
  })

  // Seules les pièces de la nature choisie sont proposées : chambres ou salles (D-072).
  const offered = rooms.data?.filter(({ room: item }) => isConferenceRoom(item) === conference)
  // Une chambre choisie qui n'est plus libre (dates modifiées) est désélectionnée d'office.
  const roomId = offered?.some(({ room }) => room.id === chosenRoomId) ? chosenRoomId : ''
  const room = offered?.find((item) => item.room.id === roomId)?.room ?? null
  const place = conference ? 'salle' : 'chambre'

  const paymentMethod = methods.data?.some((m) => m.value === payment.method)
    ? payment.method
    : (methods.data?.[0]?.value ?? '')

  const payload: ReservationInput = {
    room_id: roomId,
    customer_id: customer?.id ?? null,
    ...periodParams,
    billing_unit: unit,
    quantity: Number(quantity),
    occupants: conference
      ? []
      : occupants.map((name, index) => ({ name, is_primary: index === 0 })),
    ...(conference ? { event: eventInput } : {}),
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
    (conference || occupants.length > 0) &&
    (discount.type === 'NONE' || (discount.value !== '' && discount.reason.trim() !== ''))
  const quote = useQuery({
    // Le devis ne dépend que de la pièce et de la période : l'événement n'y est pas envoyé.
    queryKey: ['quote', { ...payload, customer_id: null, event: undefined }],
    queryFn: () => quoteReservation({ ...payload, customer_id: null, event: undefined }),
    enabled: quoteReady,
    retry: false,
    networkMode: 'always',
    meta: { silentError: true },
  })
  const quoteError = quote.error ? toUserError(quote.error) : null
  const price = quote.data?.price ?? null

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
      if (payment.mode === 'full' || payment.mode === 'partial') {
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
    onError: (error) => {
      // Le serveur reste l'autorité : on revient à l'étape où se trouve la correction.
      const refusal = toUserError(error)
      const fields = Object.keys(refusal.fieldErrors)
      setErrors(
        Object.fromEntries(
          Object.entries(refusal.fieldErrors).map(([key, messages]) => [
            key === 'room_id' ? 'room' : key,
            messages[0] ?? '',
          ]),
        ),
      )
      const target: StepId | null =
        fields.length > 0
          ? stepOfField(fields[0])
          : refusal.code === 'room_unavailable'
            ? 'stay'
            : null
      if (target) setStepIndex(steps.indexOf(target))
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
      navigate(`/reservations/${reservation.id}`, { state: { reservationCreated: true } })
    },
  })

  function errorsOf(step: StepId): Record<string, string> {
    const next: Record<string, string> = {}
    if (step === 'client') {
      if (mode === 'existing' && !customer)
        next.customer = 'Choisissez un client ou créez sa fiche.'
      if (mode === 'new') {
        if (!newCustomer.name.trim()) next.name = 'Le nom est obligatoire.'
        if (!newCustomer.phone.trim()) next.phone = 'Le téléphone est obligatoire.'
      }
      if (!conference && occupants.length === 0) next.primary = 'Indiquez le titulaire du séjour.'
      if (conference) {
        if (!event.organizer_type) next['event.organizer_type'] = 'Choisissez le type d’occupant.'
        if (event.organizer_type === 'OTHER' && !event.organizer_type_other.trim())
          next['event.organizer_type_other'] = 'Précisez le type d’occupant.'
        if (
          event.organizer_type &&
          event.organizer_type !== 'INDIVIDUAL' &&
          !event.organization_name.trim()
        )
          next['event.organization_name'] = 'Indiquez le nom de l’organisation.'
        if (event.contact_phone.trim() && !PHONE.test(event.contact_phone.trim()))
          next['event.contact_phone'] = 'Chiffres, espaces et + ( ) . - seulement.'
      }
    }
    if (step === 'stay') {
      if (conference && !event.name.trim()) next['event.name'] = 'Indiquez le nom de l’événement.'
      if (!periodValid)
        next.end_date = conference
          ? 'La date de fin doit suivre la date de début.'
          : 'La date de départ doit suivre la date d’arrivée.'
      if (period.start_date < today)
        next.start_date = conference
          ? 'La date de début ne peut pas être passée.'
          : 'La date d’arrivée ne peut pas être passée.'
      if (!roomId) next.room = `Choisissez une ${place} libre.`
      if (!(Number(quantity) >= 1) || Number(quantity) > 365 || !Number.isInteger(Number(quantity)))
        next.quantity = 'La quantité doit être comprise entre 1 et 365.'
      if (discount.type !== 'NONE') {
        if (!(Number(discount.value) > 0)) next.discount_value = 'Saisissez la valeur de la remise.'
        if (!discount.reason.trim()) next.discount_reason = 'Le motif de la remise est obligatoire.'
      }
      if (Object.keys(next).length === 0) {
        if (quoteError) next.quote = quoteError.message
        else if (!price || quote.isFetching) next.quote = 'Attendez le calcul du prix.'
        else if (!quote.data?.available)
          next.room = `Cette ${place} n’est plus libre sur la période.`
      }
    }
    if (step === 'recap' && !confirmed) {
      next.confirm = 'Faites vérifier ces informations par le client, puis cochez la case.'
    }
    if (step === 'payment') {
      if (!payment.mode) {
        next.payment =
          'Choisissez comment le client règle : tout maintenant, une avance ou plus tard.'
      } else if (payment.mode !== 'deferred' && !paymentMethod) {
        next.payment = 'Choisissez un moyen de paiement accepté.'
      }
      if (payment.mode === 'partial') {
        const amount = Number(payment.amount)
        if (!Number.isInteger(amount) || amount < 1) next.payment_amount = 'Montant entier en FCFA.'
        else if (price && amount > price.net_fcfa)
          next.payment_amount = 'L’avance dépasse le montant du séjour.'
      }
    }
    return next
  }

  function goTo(index: number) {
    setErrors({})
    setStepIndex(index)
  }

  function next() {
    if (!last) {
      const found = errorsOf(current)
      setErrors(found)
      if (Object.keys(found).length === 0) setStepIndex(stepIndex + 1)
      return
    }
    // Dernière étape : tout est revérifié, et l'on revient à la première étape incomplète.
    for (const [index, step] of steps.entries()) {
      const found = errorsOf(step)
      if (Object.keys(found).length > 0) {
        setErrors(found)
        setStepIndex(index)
        return
      }
    }
    setErrors({})
    submit.mutate()
  }

  const stayEnd = (date: string, time: string) => `${formatDay(date)} · ${time || 'heure libre'}`

  return (
    <Modal
      title="Nouvelle réservation"
      subtitle={`Étape ${stepIndex + 1} sur ${steps.length} · ${stepLabel(current, conference)}`}
      onClose={onClose}
      onSubmit={next}
      submitIcon={last ? 'calendar' : 'arrow'}
      submitLabel={last ? 'Créer la réservation' : 'Suivant'}
      submitting={submit.isPending}
      submitDisabled={current === 'stay' && quoteReady && quote.isFetching}
      footStart={
        stepIndex > 0 ? (
          <button
            type="button"
            className="secondary"
            onClick={() => goTo(stepIndex - 1)}
            disabled={submit.isPending}
          >
            <Icon name="back" size={17} />
            Retour
          </button>
        ) : undefined
      }
    >
      <ol className="wizard-steps" aria-label="Étapes de la réservation">
        {steps.map((step, index) => (
          <li
            key={step}
            aria-current={index === stepIndex ? 'step' : undefined}
            data-done={index < stepIndex}
          >
            <span className="wizard-steps__number" aria-hidden="true">
              {index < stepIndex ? <Icon name="check" size={14} /> : index + 1}
            </span>
            {stepLabel(step, conference)}
          </li>
        ))}
      </ol>

      {!online && (
        <p className="notice notice--info" role="status" style={{ marginBottom: 14 }}>
          Hors ligne : chambres libres et prix calculés sur ce poste. Le serveur revérifiera tout au
          retour du réseau.
        </p>
      )}

      {current === 'client' && (
        <>
          <div
            className="segmented"
            role="radiogroup"
            aria-label="Type de réservation"
            style={{ marginBottom: 14 }}
          >
            <label>
              <input
                type="radio"
                name="kind"
                checked={!conference}
                onChange={() => setKind('ROOM')}
              />{' '}
              Chambre
            </label>
            <label>
              <input
                type="radio"
                name="kind"
                checked={conference}
                onChange={() => setKind('CONFERENCE')}
              />{' '}
              Salle de conférence
            </label>
          </div>
          <fieldset>
            <legend>{conference ? 'Client (responsable de la réservation)' : 'Client'}</legend>
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
                  error={errors.email}
                  hint="Le client recevra la confirmation, ses reçus et sa facture."
                />
              </div>
            )}
          </fieldset>

          {conference ? (
            <fieldset>
              <legend>Occupant de la salle</legend>
              <div className="fields">
                <SelectField
                  label="Type d’occupant"
                  value={event.organizer_type}
                  onChange={(e) =>
                    setEvent({ ...event, organizer_type: e.target.value as OrganizerType | '' })
                  }
                  error={errors['event.organizer_type']}
                  required
                >
                  <option value="">Choisir…</option>
                  {ORGANIZER_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </SelectField>
                {event.organizer_type === 'OTHER' && (
                  <TextField
                    label="Précisez le type d’occupant"
                    value={event.organizer_type_other}
                    maxLength={100}
                    onChange={(e) => setEvent({ ...event, organizer_type_other: e.target.value })}
                    error={errors['event.organizer_type_other']}
                    required
                  />
                )}
                {event.organizer_type !== 'INDIVIDUAL' && (
                  <TextField
                    className="full"
                    label="Nom de l’organisation"
                    value={event.organization_name}
                    maxLength={150}
                    onChange={(e) => setEvent({ ...event, organization_name: e.target.value })}
                    error={errors['event.organization_name']}
                    required
                  />
                )}
                <TextField
                  label="Responsable sur place (facultatif)"
                  value={event.contact_name}
                  maxLength={150}
                  onChange={(e) => setEvent({ ...event, contact_name: e.target.value })}
                  error={errors['event.contact_name']}
                />
                <TextField
                  label="Téléphone du responsable (facultatif)"
                  type="tel"
                  value={event.contact_phone}
                  maxLength={30}
                  onChange={(e) => setEvent({ ...event, contact_phone: e.target.value })}
                  error={errors['event.contact_phone']}
                />
              </div>
            </fieldset>
          ) : (
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
          )}
        </>
      )}

      {current === 'stay' && (
        <>
          <fieldset>
            <legend>{conference ? 'Événement et salle' : 'Période et chambre'}</legend>
            <div className="fields">
              {conference && (
                <TextField
                  className="full"
                  label="Nom de l’événement"
                  value={event.name}
                  maxLength={150}
                  placeholder="Ex. Atelier de formation, réunion annuelle, mariage…"
                  onChange={(e) => setEvent({ ...event, name: e.target.value })}
                  error={errors['event.name']}
                  required
                />
              )}
              <TextField
                label={conference ? 'Date de début' : 'Date d’arrivée'}
                type="date"
                min={today}
                value={period.start_date}
                onChange={(e) => setPeriod({ ...period, start_date: e.target.value })}
                error={errors.start_date}
                required
              />
              <TextField
                label={
                  conference ? 'Heure de début (facultative)' : 'Heure d’arrivée (facultative)'
                }
                type="time"
                value={period.start_time}
                onChange={(e) => setPeriod({ ...period, start_time: e.target.value })}
              />
              <TextField
                label={conference ? 'Date de fin' : 'Date de départ'}
                type="date"
                min={period.start_date}
                value={period.end_date}
                onChange={(e) => setPeriod({ ...period, end_date: e.target.value })}
                error={errors.end_date}
                required
              />
              <TextField
                label={conference ? 'Heure de fin (facultative)' : 'Heure de départ (facultative)'}
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
                label={conference ? 'Salle' : 'Chambre'}
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                error={errors.room}
                hint={
                  !period.start_time || !period.end_time
                    ? `Sans heure de début ou de fin, la ${place} est bloquée sur la journée entière (règle prudente).`
                    : undefined
                }
              >
                <option value="">
                  {rooms.isFetching
                    ? `Recherche des ${place}s libres…`
                    : offered
                      ? `Choisir parmi ${offered.length} ${place}(s) libre(s)`
                      : 'Indiquez la période'}
                </option>
                {offered?.map(({ room: item }) => (
                  <option key={item.id} value={item.id}>
                    {item.number} · {item.room_type.label} · {item.capacity}{' '}
                    {conference ? 'places' : 'pers.'}
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

          <div className="quote" aria-live="polite">
            {!quoteReady && <span>Choisissez une {place} pour obtenir le prix.</span>}
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
            {quoteReady && price && !quote.isFetching && !quoteError && (
              <>
                <span>
                  {price.billing_unit_label} × {price.quantity} ·{' '}
                  {formatFcfa(price.unit_price_fcfa)} par forfait
                </span>
                {price.discount_fcfa > 0 && (
                  <span>Remise : − {formatFcfa(price.discount_fcfa)}</span>
                )}
                <span className="total">
                  <span>Total net</span>
                  <span>{formatFcfa(price.net_fcfa)}</span>
                </span>
                {!quote.data?.available && (
                  <strong>Cette {place} n’est plus libre sur la période.</strong>
                )}
              </>
            )}
            {errors.quote && !quoteError && <span className="field-error">{errors.quote}</span>}
          </div>
        </>
      )}

      {current === 'recap' && (
        <section aria-labelledby={`${confirmId}-title`}>
          <h3 id={`${confirmId}-title`} className="wizard-recap__title">
            À relire avec le client
          </h3>
          <dl className="pairs wizard-recap">
            <div>
              <dt>Client</dt>
              <dd>
                {customer?.full_name ??
                  [newCustomer.name.trim().toUpperCase(), newCustomer.first_name.trim()]
                    .filter(Boolean)
                    .join(' ')}
                {' · '}
                {customer?.phone ?? newCustomer.phone}
              </dd>
            </div>
            {conference && eventInput ? (
              <>
                <div>
                  <dt>Événement</dt>
                  <dd>{eventInput.name}</dd>
                </div>
                <div>
                  <dt>Occupant</dt>
                  <dd>
                    {organizerLabel(eventInput.organizer_type, eventInput.organizer_type_other)}
                    {eventInput.organization_name ? ` — ${eventInput.organization_name}` : ''}
                  </dd>
                </div>
                {(eventInput.contact_name || eventInput.contact_phone) && (
                  <div>
                    <dt>Responsable sur place</dt>
                    <dd>
                      {[eventInput.contact_name, eventInput.contact_phone]
                        .filter(Boolean)
                        .join(' · ')}
                    </dd>
                  </div>
                )}
              </>
            ) : (
              <div>
                <dt>Occupants</dt>
                <dd>{occupants.join(', ')}</dd>
              </div>
            )}
            <div>
              <dt>{conference ? 'Salle' : 'Chambre'}</dt>
              <dd>
                {room
                  ? `${room.number} · ${room.room_type.label} · ${room.capacity} ${conference ? 'places' : 'pers.'}`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>{conference ? 'Début' : 'Arrivée'}</dt>
              <dd>{stayEnd(period.start_date, period.start_time)}</dd>
            </div>
            <div>
              <dt>{conference ? 'Fin' : 'Départ'}</dt>
              <dd>{stayEnd(period.end_date, period.end_time)}</dd>
            </div>
            {price && (
              <>
                <div>
                  <dt>Forfait</dt>
                  <dd>
                    {price.billing_unit_label} × {price.quantity} ·{' '}
                    {formatFcfa(price.unit_price_fcfa)} par forfait
                  </dd>
                </div>
                {price.discount_fcfa > 0 && (
                  <div>
                    <dt>Remise</dt>
                    <dd>
                      − {formatFcfa(price.discount_fcfa)} · {discount.reason.trim()}
                    </dd>
                  </div>
                )}
                <div className="wizard-recap__total">
                  <dt>Total à payer</dt>
                  <dd>{formatFcfa(price.net_fcfa)}</dd>
                </div>
              </>
            )}
          </dl>
          <p className="caption">
            La réservation sera confirmée et sa facture émise à l’enregistrement : corrigez d’abord
            ce qui ne convient pas avec « Retour ».
          </p>
          <label className="wizard-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              aria-invalid={errors.confirm ? true : undefined}
              aria-describedby={errors.confirm ? `${confirmId}-error` : undefined}
            />
            Le client a vérifié ces informations et les confirme
          </label>
          {errors.confirm && (
            <span id={`${confirmId}-error`} className="field-error">
              {errors.confirm}
            </span>
          )}
        </section>
      )}

      {current === 'payment' && (
        <fieldset aria-describedby={errors.payment ? paymentErrorId : undefined}>
          <legend>Règlement</legend>
          {price && (
            <p className="wizard-recap__amount">
              Montant du séjour : <strong>{formatFcfa(price.net_fcfa)}</strong>
            </p>
          )}
          <div
            className="segmented"
            role="radiogroup"
            aria-label="Mode de règlement"
            aria-required="true"
            style={{ marginBottom: 10 }}
          >
            {(
              [
                ['full', 'Paiement intégral'],
                ['partial', 'Avance'],
                ['deferred', 'Paiement différé'],
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
          {errors.payment && (
            <span id={paymentErrorId} className="field-error">
              {errors.payment}
            </span>
          )}
          {payment.mode === 'deferred' && (
            <p className="caption">
              Le solde restera à encaisser : il sera proposé à l’arrivée puis au départ du client.
            </p>
          )}
          {(payment.mode === 'full' || payment.mode === 'partial') && (
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
