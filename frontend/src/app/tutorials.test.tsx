import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { admin, cashier, EMPTY_DASHBOARD, mockApi, renderApp } from '../test/renderApp'
import { NAVIGATION } from './navigation'
import { TUTORIALS } from './tutorials'

describe('Tutoriels du menu (lot T)', () => {
  it('chaque section du menu a son propre tutoriel, au contenu différent', () => {
    const paths = NAVIGATION.flatMap(({ items }) => items.filter((i) => !i.upcoming))
    for (const item of paths) {
      const tutorial = TUTORIALS[item.path]
      expect(tutorial, `Tutoriel manquant : ${item.path}`).toBeDefined()
      expect(tutorial!.steps.length, item.path).toBeGreaterThanOrEqual(2)
      for (const step of tutorial!.steps) {
        expect(step.title.length).toBeGreaterThan(3)
        expect(step.body.length).toBeGreaterThan(20)
      }
    }
    const firstSteps = paths.map((item) => TUTORIALS[item.path]!.steps[0]!.title)
    expect(new Set(firstSteps).size).toBe(firstSteps.length)
    const sections = paths.map((item) => TUTORIALS[item.path]!.section)
    expect(new Set(sections).size).toBe(sections.length)
  })

  it('ouvre le tutoriel de la section et le parcourt étape par étape', async () => {
    mockApi({
      'GET /api/v1/auth/me': { body: { data: cashier() } },
      'GET /api/v1/reservations': {
        body: { data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 25 } },
      },
    })
    renderApp('/reservations')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Tutoriel : Réservations' }))
    const dialog = screen.getByRole('dialog', { name: 'Tutoriel — Réservations' })
    expect(dialog).toHaveTextContent('Étape 1 sur 5')
    expect(within(dialog).getByRole('heading', { name: 'Créer une réservation' })).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Précédent' })).toBeDisabled()

    await user.click(within(dialog).getByRole('button', { name: 'Suivant' }))
    expect(dialog).toHaveTextContent('Étape 2 sur 5')
    expect(within(dialog).getByRole('heading', { name: 'Période et forfait' })).toBeVisible()
    expect(dialog).toHaveTextContent('du 20 au 23 = 3 jours')

    await user.keyboard('{ArrowRight}')
    expect(dialog).toHaveTextContent('Étape 3 sur 5')
    await user.keyboard('{ArrowLeft}')
    expect(dialog).toHaveTextContent('Étape 2 sur 5')

    await user.click(
      within(dialog).getByRole('button', { name: 'Étape 5 : Retrouver une réservation' }),
    )
    expect(
      within(dialog).getByRole('button', { name: 'Étape 5 : Retrouver une réservation' }),
    ).toHaveAttribute('aria-current', 'step')
    await user.click(within(dialog).getByRole('button', { name: 'Terminer' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Tutoriel : Réservations' })).toHaveFocus()
  })

  it('montre un contenu propre à chaque section', async () => {
    mockApi({
      'GET /api/v1/auth/me': { body: { data: admin() } },
      'GET /api/v1/dashboard': { body: EMPTY_DASHBOARD },
      'GET /api/v1/occupancy': { body: { at: '2026-12-01T10:00:00+01:00', data: [] } },
    })
    renderApp('/tableau-de-bord')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Tutoriel : Vue d’ensemble' }))
    const dialog = screen.getByRole('dialog', { name: 'Tutoriel — Vue d’ensemble' })
    expect(within(dialog).getByRole('heading', { name: 'Les chiffres du jour' })).toBeVisible()
    expect(dialog).not.toHaveTextContent('Créer une réservation')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
