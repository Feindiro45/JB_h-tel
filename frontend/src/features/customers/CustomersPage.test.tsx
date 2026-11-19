import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { cashier, mockApi, renderApp } from '../../test/renderApp'

const CUSTOMER = {
  id: '0190a000-0000-7000-8000-0000000000cc',
  name: 'YAKITÉ',
  first_name: 'Jean',
  full_name: 'YAKITÉ Jean',
  phone: '+236 75 11 22 33',
  email: null,
  email_notifications: true,
  origin_city: 'Bangui',
  origin_country: 'Centrafrique',
  address: null,
  identification_type: null,
  identification_number: null,
  notes: null,
  created_at: '2026-11-19T10:00:00+01:00',
}

function serve(store: (body: unknown) => { status: number; body: unknown }) {
  return mockApi({
    'GET /api/v1/auth/me': { body: { data: cashier() } },
    'GET /api/v1/customers': {
      body: { data: [CUSTOMER], meta: { total: 1, current_page: 1, last_page: 1 } },
    },
    'POST /api/v1/customers': ({ body }) => store(body),
    [`GET /api/v1/customers/${CUSTOMER.id}`]: { body: { data: CUSTOMER } },
    [`GET /api/v1/customers/${CUSTOMER.id}/reservations`]: { body: { data: [] } },
  })
}

describe('Clients', () => {
  it('distingue le total filtré des indicateurs limités à la page affichée', async () => {
    mockApi({
      'GET /api/v1/auth/me': { body: { data: cashier() } },
      'GET /api/v1/customers': {
        body: {
          data: [{ ...CUSTOMER, email: 'client@example.test' }],
          meta: { total: 217, current_page: 1, last_page: 9 },
        },
      },
    })
    renderApp('/clients')
    const overview = within(await screen.findByRole('region', { name: 'Vue d’ensemble' }))
    expect(await overview.findByText('217')).toBeInTheDocument()
    expect(overview.getByText('Avec e-mail').closest('article')).toHaveTextContent('1')
    expect(overview.getByText('Avec téléphone').closest('article')).toHaveTextContent('1')
    expect(overview.getByText('Pays représentés').closest('article')).toHaveTextContent('1')
  })

  it('liste les clients avec un lien vers leur fiche (UUID)', async () => {
    serve(() => ({ status: 201, body: { data: CUSTOMER } }))
    renderApp('/clients')

    const link = await screen.findByRole('link', { name: 'Ouvrir →' })
    expect(link).toHaveAttribute('href', `/clients/${CUSTOMER.id}`)
    expect(screen.getByText('Bangui, Centrafrique')).toBeInTheDocument()
  })

  it('crée un client puis ouvre sa fiche', async () => {
    const calls = serve(() => ({ status: 201, body: { data: CUSTOMER } }))
    const router = renderApp('/clients')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: '+ Nouveau client' }))
    const dialog = screen.getByRole('dialog', { name: 'Nouveau client' })
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le client' }))
    // Validation de confort : rien n'est envoyé tant que nom et téléphone manquent.
    expect(within(dialog).getByText('Le nom est obligatoire.')).toBeInTheDocument()
    expect(calls.some((call) => call.method === 'POST')).toBe(false)

    await user.type(within(dialog).getByLabelText('Nom'), 'Yakité')
    await user.type(within(dialog).getByLabelText('Téléphone'), '+236 75 11 22 33')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le client' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/clients/${CUSTOMER.id}`))
    expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({
      name: 'Yakité',
      phone: '+236 75 11 22 33',
      email: null,
      email_notifications: true,
    })
  })

  it('met en évidence le champ refusé par le serveur (422) et garde la saisie', async () => {
    serve(() => ({
      status: 422,
      body: {
        title: 'Données invalides',
        message: 'Certaines informations sont invalides.',
        errors: { phone: ['Ce numéro de téléphone est déjà utilisé.'] },
      },
    }))
    renderApp('/clients')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: '+ Nouveau client' }))
    const dialog = screen.getByRole('dialog', { name: 'Nouveau client' })
    await user.type(within(dialog).getByLabelText('Nom'), 'Yakité')
    await user.type(within(dialog).getByLabelText('Téléphone'), '+236 75 11 22 33')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le client' }))

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    const phone = within(dialog).getByLabelText('Téléphone')
    expect(phone).toHaveAttribute('aria-invalid', 'true')
    expect(phone).toHaveAccessibleDescription('Ce numéro de téléphone est déjà utilisé.')
    expect(phone).toHaveValue('+236 75 11 22 33')
  })
})
