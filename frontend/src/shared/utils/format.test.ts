import { describe, expect, it } from 'vitest'
import { formatDateTime, formatFcfa } from './format'

describe('formatFcfa', () => {
  it('sépare les milliers par une espace', () => {
    expect(formatFcfa(50000).replace(/\s/g, ' ')).toBe('50 000 FCFA')
    expect(formatFcfa(1250000).replace(/\s/g, ' ')).toBe('1 250 000 FCFA')
    expect(formatFcfa(0)).toBe('0 FCFA')
  })

  it('refuse un montant non entier au lieu de l’arrondir en silence', () => {
    expect(() => formatFcfa(45000.5)).toThrow(RangeError)
  })
})

describe('formatDateTime', () => {
  it('affiche la date en français dans le fuseau de l’hôtel', () => {
    // 2026-11-19 11:30 UTC = 12:30 à Bangui (UTC+1).
    expect(formatDateTime('2026-11-19T11:30:00Z', 'Africa/Bangui')).toBe('19 novembre 2026 à 12:30')
  })
})
