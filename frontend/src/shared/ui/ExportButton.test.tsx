import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Reservation } from '../api/types'
import { saveFile } from '../export/saveFile'
import { cashier, mockApi, renderApp } from '../../test/renderApp'

vi.mock('../export/saveFile', () => ({ saveFile: vi.fn() }))

const STAY: Reservation = {
  id: 'res-1',
  status: 'CONFIRMED',
  status_label: 'Confirmée',
  room: {
    id: 'room-101',
    number: '101',
    room_type: { code: 'VIP', label: 'VIP' },
    capacity: 2,
    under_maintenance: false,
  },
  customer: { id: 'cust-1', full_name: 'NGUEMA Paul', phone: '+236 72 00 00 00' },
  period: {
    start_date: '2026-12-01',
    end_date: '2026-12-02',
    start_time: null,
    end_time: null,
    blocked_from: '2026-12-01T00:00:00+01:00',
    blocked_until: '2026-12-03T00:00:00+01:00',
    is_estimated: true,
  },
  price: {
    billing_unit: 'DAY',
    billing_unit_label: 'Journée',
    amount_due_fcfa: 45000,
    unit_price_fcfa: 50000,
    quantity: 1,
    gross_fcfa: 50000,
    discount: { type: 'PERCENT', type_label: 'Pourcentage', value: '10', reason: 'Client fidèle' },
    discount_fcfa: 5000,
    net_fcfa: 45000,
  },
  occupants: [{ id: 'o1', name: 'NGUEMA Paul', is_primary: true }],
  notes: null,
  checked_in_at: null,
  checked_out_at: null,
  cancelled_at: null,
  cancellation_reason: null,
  created_at: '2026-11-30T09:00:00+01:00',
}

const LIST = { data: [STAY], meta: { current_page: 1, last_page: 1, total: 1, per_page: 25 } }

function serve(exportReply: Parameters<typeof mockApi>[0][string]) {
  return mockApi({
    'GET /api/v1/auth/me': { body: { data: cashier() } },
    'GET /api/v1/reservations': { body: LIST },
    'GET /api/v1/reservations/export': exportReply,
  })
}

async function readBack(blob: Blob) {
  const { Workbook } = await import('exceljs')
  const book = new Workbook()
  await book.xlsx.load(await blob.arrayBuffer())
  return book
}

beforeEach(() => vi.mocked(saveFile).mockClear())
afterEach(() => vi.restoreAllMocks())

describe('Export Excel d’un écran', () => {
  it('télécharge le classeur du serveur avec les filtres de l’écran, sans la pagination', async () => {
    const calls = serve({ body: {} })
    renderApp('/reservations?status=CONFIRMED')
    const user = userEvent.setup()
    await screen.findByText('NGUEMA Paul')

    await user.click(screen.getByRole('button', { name: 'Exporter (Excel)' }))

    expect(await screen.findByText('Classeur Excel téléchargé.')).toBeInTheDocument()
    const call = calls.find((c) => c.path === '/api/v1/reservations/export')
    expect(call?.query).not.toHaveProperty('page')
    expect(call?.query).not.toHaveProperty('per_page')
    expect(vi.mocked(saveFile)).toHaveBeenCalledTimes(1)
    const [, name] = vi.mocked(saveFile).mock.calls[0]!
    expect(name).toMatch(/^jb-hotel-reservations-\d{4}-\d{2}-\d{2}-\d{4}\.xlsx$/)
  })

  it('sans réseau, construit sur le poste un classeur simplifié à partir des données gardées', async () => {
    serve(() => {
      throw new TypeError('Failed to fetch')
    })
    renderApp('/reservations')
    const user = userEvent.setup()
    await screen.findByText('NGUEMA Paul')

    await user.click(screen.getByRole('button', { name: 'Exporter (Excel)' }))

    expect(
      await screen.findByText(
        'Classeur simplifié créé sans réseau, à partir des données de ce poste.',
      ),
    ).toBeInTheDocument()
    const [blob, name] = vi.mocked(saveFile).mock.calls[0]!
    expect(name).toMatch(/^jb-hotel-reservations-.*\.xlsx$/)
    const book = await readBack(blob)
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual([
      'Tableau de bord',
      'Réservations',
      'Occupants',
    ])
    const dashboard = book.getWorksheet('Tableau de bord')!
    expect(String(dashboard.getCell('A2').value)).toContain('Données gardées sur ce poste')
    expect(dashboard.getCell('B6').value).toBe(1)
    // Montant net hors annulées : 50 000 − 10 % = 45 000 (critère du document 06).
    expect(dashboard.getCell('E6').value).toBe(45000)
    const stays = book.getWorksheet('Réservations')!
    expect(stays.getCell('A5').value).toBe('NGUEMA Paul')
    expect(stays.getCell('B5').value).toBe('+236 72 00 00 00')
    expect(stays.getCell('O6').value).toMatchObject({
      formula: 'SUBTOTAL(109,O5:O5)',
      result: 45000,
    })
  })

  it('montre l’erreur du serveur dans la fenêtre d’erreur, sans rien enregistrer', async () => {
    serve({ status: 403, body: { title: 'Accès refusé', message: 'Vous n’avez pas ce droit.' } })
    renderApp('/reservations')
    const user = userEvent.setup()
    await screen.findByText('NGUEMA Paul')

    await user.click(screen.getByRole('button', { name: 'Exporter (Excel)' }))

    expect(await screen.findByRole('alertdialog', { name: 'Accès refusé' })).toBeInTheDocument()
    expect(vi.mocked(saveFile)).not.toHaveBeenCalled()
  })
})
