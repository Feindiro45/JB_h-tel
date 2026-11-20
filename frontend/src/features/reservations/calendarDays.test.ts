import { expect, it } from 'vitest'
import { calendarDaysBetween } from './calendarDays'

it('calcule les écarts de dates sans arrondi horaire, y compris aux changements de mois et d’année', () => {
  expect(calendarDaysBetween('2026-11-20', '2026-11-23')).toBe(3)
  expect(calendarDaysBetween('2026-11-20', '2026-11-20')).toBe(0)
  expect(calendarDaysBetween('2026-12-31', '2027-01-02')).toBe(2)
  expect(calendarDaysBetween('2028-02-28', '2028-03-01')).toBe(2)
  expect(calendarDaysBetween('2026-03-28', '2026-03-30')).toBe(2)
})

it('ne calcule pas de quantité pour une période incomplète, inversée ou une date inexistante', () => {
  for (const [from, to] of [
    ['', '2026-11-20'],
    ['2026-11-20', ''],
    ['2026-11-23', '2026-11-20'],
    ['2026-02-30', '2026-03-02'],
    ['2026-13-01', '2027-01-01'],
  ])
    expect(calendarDaysBetween(from, to)).toBeNull()
})
