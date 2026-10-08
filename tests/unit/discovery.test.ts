import { describe, expect, it } from 'vitest'
import { EVIDENCE_CATEGORIES, evidenceTotal, formatEvidence, isValidAnswer, parseRange } from '@/domain/discovery'

describe('Evidence Score', () => {
  it('zählt nur bewertete Kategorien', () => {
    const none = evidenceTotal([])
    expect(formatEvidence(none)).toBeNull()
    const partial = evidenceTotal([
      { category: 'problem', points: 2 },
      { category: 'budget', points: null },
      { category: 'backlog', points: 1 },
    ])
    expect(partial).toMatchObject({ points: 3, rated: 2, complete: false })
    expect(formatEvidence(partial)).toBe('3/20 · 2 von 10 bewertet')
    const full = evidenceTotal(EVIDENCE_CATEGORIES.map((category, i) => ({ category, points: i % 2 === 0 ? 2 : 1 })))
    expect(formatEvidence(full)).toBe('15/20')
  })
})

describe('Antworten', () => {
  it('prüft Typen', () => {
    expect(isValidAnswer('number', 30)).toBe(true)
    expect(isValidAnswer('number', -1)).toBe(false)
    expect(isValidAnswer('range', { min: 30, max: 40 })).toBe(true)
    expect(isValidAnswer('range', { min: 50, max: 40 })).toBe(false)
    expect(isValidAnswer('choice', 'Inaktive Kunden', ['Inaktive Kunden'])).toBe(true)
    expect(isValidAnswer('choice', 'Erfunden', ['Inaktive Kunden'])).toBe(false)
    expect(isValidAnswer('multi_choice', ['IT', 'Einkauf'], ['IT', 'Einkauf', 'Vertrieb'])).toBe(true)
    expect(isValidAnswer('date', '2026-11-01')).toBe(true)
    expect(isValidAnswer('boolean', 'ja')).toBe(false)
  })

  it('liest deutsche Spannen', () => {
    expect(parseRange('30 bis 40')).toEqual({ min: 30, max: 40 })
    expect(parseRange('ca. 20.000–50.000 €')).toEqual({ min: 20000, max: 50000 })
    expect(parseRange('etwa 60')).toEqual({ min: 60, max: 60 })
    expect(parseRange('keine Ahnung')).toBeNull()
  })
})
