import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { cashier, mockApi, renderApp } from '../../test/renderApp'

const ADMIN = { ...cashier(), id: 'admin-1', name: 'Directeur', permissions: ['offline.manage'] }
const PAGE = { total: 1, current_page: 1, last_page: 1 }

const REPORT = {
  pending_operations: 4,
  rejected_operations: 1,
  oldest_pending_at: '2026-12-01T07:30:00+01:00',
  last_sync_at: '2026-12-01T06:00:00+01:00',
  last_sync_status: 'partial',
  last_backup_at: null,
  storage_persisted: true,
  reported_at: '2026-12-01T08:00:00+01:00',
}
const MAIN = {
  id: 'ws-1',
  name: 'CAISSE-01',
  is_main: true,
  silent: true,
  last_seen_at: '2026-12-01T08:00:00+01:00',
  last_seen_by: 'Grâce',
  report: REPORT,
}
const REFUSED = {
  id: 'op-1',
  kind: 'reservation.create',
  kind_label: 'Nouvelle réservation',
  label: 'Réservation — chambre 101 · NGUEMA Paul',
  user: 'Grâce',
  workstation: 'CAISSE-01',
  created_offline_at: '2026-12-01T07:30:00+01:00',
  received_at: '2026-12-01T09:00:00+01:00',
  attempts: 1,
  outcome: 'REJECTED',
  outcome_label: 'Refusée',
  http_status: 409,
  reason_title: 'Chambre indisponible',
  reason: 'La chambre 101 est déjà réservée sur cette période.',
  reason_code: 'room_unavailable',
  review_status: 'TO_REVIEW',
  review_label: 'À examiner',
  reviewed_by: null,
  reviewed_at: null,
  review_reason: null,
}

function serve() {
  return mockApi({
    'GET /api/v1/auth/me': { body: { data: ADMIN } },
    'GET /api/v1/offline/overview': {
      body: {
        data: {
          main: MAIN,
          workstations: [MAIN],
          silent_after_minutes: 5,
          today: { accepted: 7, duplicates: 2, rejected: 1 },
          to_review: 1,
          rules: {
            allowed_operations: null,
            lock_after_minutes: 15,
            backup_reminder_minutes: 60,
            provisional_prefix: 'LOC',
          },
        },
      },
    },
    'GET /api/v1/offline/operations': { body: { data: [REFUSED], meta: PAGE } },
    'POST /api/v1/offline/operations/op-1/review': {
      body: { data: { ...REFUSED, review_status: 'REENTERED', review_label: 'Ressaisie' } },
    },
  })
}

describe('Administration → Mode hors ligne (lot 4A)', () => {
  it('montre l’état du poste principal, les chiffres du jour, les règles et le guide', async () => {
    serve()
    renderApp('/admin/hors-ligne')

    expect(await screen.findByRole('heading', { name: 'Mode hors ligne', level: 1 })).toBeVisible()
    const overview = screen.getByRole('region', { name: 'Vue d’ensemble' })
    await waitFor(() => expect(overview).toHaveTextContent('Silencieux'))
    expect(overview).toHaveTextContent('9') // 7 acceptées + 2 doublons évités
    expect(overview).toHaveTextContent('2 doublon(s) évité(s) · 1 refus')

    const main = screen.getByRole('region', { name: 'Poste principal' })
    expect(main).toHaveTextContent('Aucun signal depuis plus de 5 min')
    expect(main).toHaveTextContent('CAISSE-01')
    expect(main).toHaveTextContent('Partielle')
    // Opérations en attente sans sauvegarde : conseil explicite.
    expect(main).toHaveTextContent('demandez à la caissière « Exporter une sauvegarde »')

    const rules = screen.getByRole('region', { name: 'Règles hors ligne' })
    expect(rules).toHaveTextContent('Toutes')
    expect(rules).toHaveTextContent('Sans limite')
    expect(within(rules).getByRole('link', { name: 'Modifier' })).toHaveAttribute(
      'href',
      '/admin/parametres',
    )

    const guide = screen.getByRole('region', { name: 'Comment gérer' })
    for (const title of [
      'Coupure d’Internet',
      'Retour du réseau',
      'Changement de poste planifié',
      'Panne ou vol du poste',
      'Chambre prise entre-temps (conflit)',
      'Sauvegardes et restauration',
    ])
      expect(within(guide).getByText(title)).toBeInTheDocument()
  })

  it('examine un refus : décision, motif obligatoire, envoi au serveur', async () => {
    const calls = serve()
    renderApp('/admin/hors-ligne')
    const user = userEvent.setup()

    const center = await screen.findByRole('region', { name: 'Centre de synchronisation' })
    expect(await within(center).findByText(REFUSED.label)).toBeVisible()
    expect(center).toHaveTextContent('La chambre 101 est déjà réservée sur cette période.')
    // Les refus à examiner sont présentés d’abord.
    expect(calls.find((c) => c.path === '/api/v1/offline/operations')?.query).toMatchObject({
      review: 'TO_REVIEW',
    })

    await user.click(within(center).getByRole('button', { name: `Examiner : ${REFUSED.label}` }))
    const dialog = screen.getByRole('dialog', { name: 'Examiner l’opération refusée' })
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer l’examen' }))
    expect(within(dialog).getByText('Indiquez le motif (3 caractères au moins).')).toBeVisible()

    await user.type(within(dialog).getByLabelText('Motif'), 'Ressaisie en chambre 102')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer l’examen' }))
    expect(await screen.findByText('Opération notée comme ressaisie')).toBeVisible()
    const review = calls.find((c) => c.path === '/api/v1/offline/operations/op-1/review')
    expect(review?.body).toEqual({ resolution: 'REENTERED', reason: 'Ressaisie en chambre 102' })
  })

  it('reste réservé à l’administrateur', async () => {
    mockApi({ 'GET /api/v1/auth/me': { body: { data: cashier() } } })
    renderApp('/admin/hors-ligne')

    expect(await screen.findByRole('heading', { name: 'Accès refusé' })).toBeVisible()
  })
})
