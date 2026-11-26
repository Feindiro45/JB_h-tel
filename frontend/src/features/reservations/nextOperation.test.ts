import { describe, expect, it } from 'vitest'
import type { AccountSummary, Reservation } from '../../shared/api/types'
import { nextOperation } from './nextOperation'

const TODAY = '2026-12-01'

function stay(overrides: Partial<Reservation> = {}, period: Partial<Reservation['period']> = {}) {
  return {
    id: 'r1',
    status: 'CONFIRMED',
    period: {
      start_date: TODAY,
      end_date: '2026-12-03',
      start_time: null,
      end_time: null,
      ...period,
    },
    ...overrides,
  } as Reservation
}
const owing = { balance_fcfa: 30000 } as AccountSummary
const paid = { balance_fcfa: 0 } as AccountSummary
const all = () => true
const without =
  (...missing: string[]) =>
  (permission: string) =>
    !missing.includes(permission)

describe('Enchaînement des étapes (D-071)', () => {
  it('après la création, propose l’arrivée seulement si le séjour commence aujourd’hui', () => {
    expect(nextOperation('created', stay(), owing, all, TODAY)).toBe('check-in')
    expect(
      nextOperation('created', stay({}, { start_date: '2026-12-02' }), owing, all, TODAY),
    ).toBeNull()
    expect(nextOperation('created', stay({ status: 'PENDING' }), owing, all, TODAY)).toBeNull()
  })

  it('après la confirmation : encaissement s’il reste un solde, sinon arrivée', () => {
    expect(nextOperation('confirm', stay(), owing, all, TODAY)).toBe('payment')
    expect(nextOperation('confirm', stay(), paid, all, TODAY)).toBe('check-in')
    expect(nextOperation('confirm', stay(), owing, without('payments.record'), TODAY)).toBe(
      'check-in',
    )
  })

  it('après l’arrivée : encaissement du solde, rien si tout est payé', () => {
    const inProgress = stay({ status: 'IN_PROGRESS' })
    expect(nextOperation('check-in', inProgress, owing, all, TODAY)).toBe('payment')
    expect(nextOperation('check-in', inProgress, paid, all, TODAY)).toBeNull()
  })

  it('après un encaissement : jamais un autre encaissement, mais l’arrivée ou le départ du dernier jour', () => {
    expect(nextOperation('payment', stay(), owing, all, TODAY)).toBe('check-in')
    expect(nextOperation('payment', stay({ status: 'IN_PROGRESS' }), owing, all, TODAY)).toBeNull()
    expect(
      nextOperation(
        'payment',
        stay({ status: 'IN_PROGRESS' }, { end_date: TODAY }),
        paid,
        all,
        TODAY,
      ),
    ).toBe('check-out')
    expect(
      nextOperation(
        'payment',
        stay({ status: 'IN_PROGRESS', departure_overdue: true }),
        paid,
        all,
        TODAY,
      ),
    ).toBe('check-out')
  })

  it('ne propose rien que l’utilisateur n’a pas le droit de faire', () => {
    const noMoves = without('reservations.check_in_out')
    expect(nextOperation('created', stay(), owing, noMoves, TODAY)).toBeNull()
    expect(
      nextOperation(
        'payment',
        stay({ status: 'IN_PROGRESS', departure_overdue: true }),
        paid,
        noMoves,
        TODAY,
      ),
    ).toBeNull()
    expect(
      nextOperation('check-in', stay({ status: 'IN_PROGRESS' }), undefined, all, TODAY),
    ).toBeNull()
  })
})
