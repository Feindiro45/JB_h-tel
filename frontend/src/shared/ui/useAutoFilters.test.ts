import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAutoFilters } from './useAutoFilters'

afterEach(() => vi.useRealTimers())

it('regroupe la saisie et publie uniquement la dernière recherche en page 1', () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useAutoFilters({ search: '', page: 5, per_page: 25 }))
  act(() => result.current.change({ search: 'Do' }, true))
  act(() => vi.advanceTimersByTime(200))
  act(() => result.current.change({ search: 'Doko' }, true))
  act(() => vi.advanceTimersByTime(299))
  expect(result.current.filters.search).toBe('')
  expect(result.current.draft.search).toBe('Doko')
  expect(result.current.pending).toBe(true)
  act(() => vi.advanceTimersByTime(1))
  expect(result.current.filters).toEqual({ search: 'Doko', page: 1, per_page: 25 })
  expect(result.current.pending).toBe(false)
})

it('applique immédiatement un choix avec la recherche en cours et annule son délai', () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useAutoFilters({ search: '', status: '', page: 3 }))
  act(() => result.current.change({ search: 'Doko' }, true))
  act(() => result.current.change({ status: 'ISSUED' }))
  expect(result.current.filters).toEqual({ search: 'Doko', status: 'ISSUED', page: 1 })
  act(() => result.current.change({ page: 2 }))
  act(() => vi.runAllTimers())
  expect(result.current.filters.page).toBe(2)
})

it('efface tous les filtres et annule la saisie différée en conservant la taille de page', () => {
  vi.useFakeTimers()
  const { result } = renderHook(() =>
    useAutoFilters({ search: '', email: '', page: 1, per_page: 25 }),
  )
  act(() => result.current.change({ per_page: 50 }))
  act(() => result.current.change({ search: 'Doko', email: 'client@test.fr' }, true))
  act(() => result.current.reset())
  act(() => vi.runAllTimers())
  expect(result.current.filters).toEqual({ search: '', email: '', page: 1, per_page: 50 })
  expect(result.current.draft).toEqual(result.current.filters)
})

it('conserve les derniers résultats pour une période incomplète, inversée ou trop longue', () => {
  const initial = { from: '2026-11-01', to: '2026-11-19' }
  const { result } = renderHook(() =>
    useAutoFilters(initial, { requiredPeriod: true, maxDays: 92 }),
  )
  for (const patch of [{ from: '' }, { from: '2026-12-01' }, { from: '2026-01-01' }]) {
    act(() => result.current.change(patch))
    expect(result.current.valid).toBe(false)
    expect(result.current.filters).toEqual(initial)
  }
  act(() => result.current.change({ from: '2026-11-10' }))
  expect(result.current.valid).toBe(true)
  expect(result.current.filters).toEqual({ from: '2026-11-10', to: '2026-11-19' })
})

it('accepte une seule borne et son effacement pour les filtres de liste facultatifs', () => {
  const { result } = renderHook(() => useAutoFilters({ from: '', to: '', page: 2 }))
  act(() => result.current.change({ from: '2026-11-10' }))
  expect(result.current.filters).toEqual({ from: '2026-11-10', to: '', page: 1 })
  act(() => result.current.change({ from: '' }))
  expect(result.current.valid).toBe(true)
  expect(result.current.filters.from).toBe('')
})
