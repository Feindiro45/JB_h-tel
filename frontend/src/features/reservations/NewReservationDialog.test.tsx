import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { cashier, mockApi, renderApp } from '../../test/renderApp'
import { addDays, todayIso } from '../../shared/utils/format'

const ROOM = {
  id: '0190a000-0000-7000-8000-000000000101',
  number: '101',
  room_type: { code: 'VIP', label: 'VIP' },
  capacity: 2,
  under_maintenance: false,
}
const PRICE = {
  billing_unit: 'DAY',
  billing_unit_label: 'Journée',
  rate_effective_from: '2026-01-01',
  unit_price_fcfa: 50000,
  quantity: 1,
  gross_fcfa: 50000,
  discount: null,
  discount_fcfa: 0,
  net_fcfa: 50000,
}
const CREATED = { id: '0190a000-0000-7000-8000-0000000000bb', price: PRICE }

function serve({ reservationFailsOnce = false } = {}) {
  let failed = false
  return mockApi({
    'GET /api/v1/auth/me': { body: { data: cashier() } },
    'GET /api/v1/reservations': {
      body: { data: [], meta: { total: 0, current_page: 1, last_page: 1 } },
    },
    'GET /api/v1/rooms': { body: { data: [] } },
    'GET /api/v1/availability': {
      body: { data: [{ room: ROOM, state: 'FREE', state_label: 'Libre', reservations: [] }] },
    },
    'POST /api/v1/reservations/quote': ({ body }) => {
      const { quantity } = body as { quantity: number }
      return {
        body: {
          data: {
            room: ROOM,
            period: {},
            price: { ...PRICE, quantity, gross_fcfa: quantity * 50000, net_fcfa: quantity * 50000 },
            available: true,
            conflicts: [],
          },
        },
      }
    },
    'POST /api/v1/customers': {
      status: 201,
      body: { data: { id: 'cust-new', full_name: 'YAKITÉ Jean', phone: '+236 75 11 22 33' } },
    },
    'POST /api/v1/reservations': () => {
      if (reservationFailsOnce && !failed) {
        failed = true
        return {
          status: 409,
          body: {
            title: 'Chambre indisponible',
            message: 'La chambre vient d’être réservée.',
            code: 'room_unavailable',
          },
        }
      }
      return { status: 201, body: { data: CREATED } }
    },
    [`POST /api/v1/reservations/${CREATED.id}/payments`]: {
      status: 201,
      body: { data: { id: 'pay-1', receipt_number: 'REC-2026-000001' } },
    },
  })
}

async function fillNewCustomerStay(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '+ Nouvelle réservation' }))
  const dialog = screen.getByRole('dialog', { name: 'Nouvelle réservation' })
  await user.click(within(dialog).getByLabelText('Nouveau client'))
  await user.type(within(dialog).getByLabelText('Nom'), 'Yakité')
  await user.type(within(dialog).getByLabelText('Téléphone'), '+236 75 11 22 33')
  await user.type(within(dialog).getByLabelText('Titulaire du séjour'), 'Jean Yakité')
  await user.selectOptions(
    await within(dialog).findByLabelText('Chambre'),
    await within(dialog).findByRole('option', { name: /^101/ }),
  )
  return dialog
}

describe('Nouvelle réservation guidée', () => {
  it('recalcule les jours et le devis après chaque changement de date, puis enregistre la quantité calculée', async () => {
    const calls = serve()
    renderApp('/reservations')
    const user = userEvent.setup()
    const dialog = await fillNewCustomerStay(user)
    const days = within(dialog).getByLabelText('Nombre de jours')
    expect(days).toHaveValue(1)
    expect(days).toHaveAttribute('readonly')
    const start = todayIso()
    const departure = within(dialog).getByLabelText('Date de départ')
    fireEvent.change(departure, { target: { value: addDays(start, 3) } })
    expect(days).toHaveValue(3)
    await waitFor(() =>
      expect(calls.filter((call) => call.path.endsWith('/quote')).at(-1)?.body).toMatchObject({
        quantity: 3,
      }),
    )
    expect(
      (await within(dialog).findByText('Total net')).parentElement?.textContent?.replace(
        /\s/g,
        ' ',
      ),
    ).toContain('150 000 FCFA')
    fireEvent.change(within(dialog).getByLabelText('Date d’arrivée'), {
      target: { value: addDays(start, 1) },
    })
    expect(days).toHaveValue(2)
    await waitFor(() =>
      expect(calls.filter((call) => call.path.endsWith('/quote')).at(-1)?.body).toMatchObject({
        quantity: 2,
      }),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Créer la réservation' }))
    await waitFor(() =>
      expect(
        calls.find((call) => call.path === '/api/v1/reservations' && call.method === 'POST')?.body,
      ).toMatchObject({ quantity: 2, start_date: addDays(start, 1), end_date: addDays(start, 3) }),
    )
  })

  it('vide le calcul si les dates sont absentes ou inversées et conserve le forfait demi-journée', async () => {
    const calls = serve()
    renderApp('/reservations')
    const user = userEvent.setup()
    const dialog = await fillNewCustomerStay(user)
    await within(dialog).findByText('Total net')
    const days = within(dialog).getByLabelText('Nombre de jours')
    const departure = within(dialog).getByLabelText('Date de départ')
    const initialQuotes = calls.filter((call) => call.path.endsWith('/quote')).length
    fireEvent.change(departure, { target: { value: '' } })
    expect(days).toHaveValue(null)
    fireEvent.change(departure, { target: { value: addDays(todayIso(), -1) } })
    expect(days).toHaveValue(null)
    expect(calls.filter((call) => call.path.endsWith('/quote'))).toHaveLength(initialQuotes)
    fireEvent.change(departure, { target: { value: todayIso() } })
    expect(days).toHaveValue(1)
    await user.selectOptions(within(dialog).getByLabelText('Forfait'), 'HALF_DAY')
    const halfDays = within(dialog).getByLabelText('Quantité de demi-journées')
    expect(halfDays).not.toHaveAttribute('readonly')
    await user.clear(halfDays)
    await user.type(halfDays, '2')
    await user.selectOptions(within(dialog).getByLabelText('Forfait'), 'DAY')
    expect(within(dialog).getByLabelText('Nombre de jours')).toHaveValue(1)
    await user.selectOptions(within(dialog).getByLabelText('Forfait'), 'HALF_DAY')
    expect(within(dialog).getByLabelText('Quantité de demi-journées')).toHaveValue(2)
  })

  it('crée le client, la réservation confirmée puis l’avance, dans cet ordre', async () => {
    const calls = serve()
    const router = renderApp('/reservations')
    const user = userEvent.setup()
    const dialog = await fillNewCustomerStay(user)

    expect(
      (await within(dialog).findByText('Total net')).parentElement?.textContent?.replace(
        /\s/g,
        ' ',
      ),
    ).toContain('50 000 FCFA')
    await user.click(within(dialog).getByLabelText('Avance'))
    await user.type(within(dialog).getByLabelText('Montant de l’avance (FCFA)'), '20000')
    await user.click(within(dialog).getByRole('button', { name: 'Créer la réservation' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/reservations/${CREATED.id}`))
    const writes = calls.filter((call) => call.method === 'POST' && !call.path.endsWith('/quote'))
    expect(writes.map((call) => call.path)).toEqual([
      '/api/v1/customers',
      '/api/v1/reservations',
      `/api/v1/reservations/${CREATED.id}/payments`,
    ])
    expect(writes[1].body).toMatchObject({
      room_id: ROOM.id,
      customer_id: 'cust-new',
      confirm: true,
      billing_unit: 'DAY',
      quantity: 1,
    })
    expect(writes[2].body).toEqual({ amount_fcfa: 20000, method: 'CASH' })
  })

  it('après un conflit, une nouvelle tentative réutilise la fiche client déjà créée', async () => {
    const calls = serve({ reservationFailsOnce: true })
    const router = renderApp('/reservations')
    const user = userEvent.setup()
    const dialog = await fillNewCustomerStay(user)
    await within(dialog).findByText('Total net')

    await user.click(within(dialog).getByRole('button', { name: 'Créer la réservation' }))
    const error = await screen.findByRole('alertdialog')
    expect(within(error).getByText('Chambre indisponible')).toBeInTheDocument()
    await user.click(within(error).getByRole('button', { name: 'Fermer' }))

    await user.click(within(dialog).getByRole('button', { name: 'Créer la réservation' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/reservations/${CREATED.id}`))
    expect(
      calls.filter((call) => call.method === 'POST' && call.path === '/api/v1/customers'),
    ).toHaveLength(1)
    expect(
      calls.filter((call) => call.method === 'POST' && call.path === '/api/v1/reservations').at(-1)
        ?.body,
    ).toMatchObject({ customer_id: 'cust-new' })
  })
})
