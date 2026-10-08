import { describe, expect, it } from 'vitest'
import { addDays, berlinDay, daysBetween, formatDate, formatDay, formatMoney, parseMoneyToCents, relativeDay } from '@/lib/format'
import { safeNext } from '@/lib/redirect'
import { oneOf, pageNumber, str } from '@/lib/params'

describe('Formatierung (de-DE, Europe/Berlin)', () => {
  it('Datum und Geld', () => {
    expect(formatDay('2026-10-08')).toBe('08.10.2026')
    expect(formatDate(new Date('2026-10-08T12:00:00Z'))).toBe('08.10.2026')
    expect(formatMoney(250000).replace(/ /g, ' ')).toBe('2.500,00 €')
  })

  it('Berliner Kalendertag statt UTC', () => {
    // 23:30 UTC on 7 Oct is already 8 Oct in Berlin (CEST, UTC+2).
    expect(berlinDay(new Date('2026-10-07T23:30:00Z'))).toBe('2026-10-08')
    // Day arithmetic across the DST change (25 Oct 2026).
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
  })

  it('relative Tage', () => {
    expect(relativeDay('2026-10-08', '2026-10-08')).toBe('heute')
    expect(relativeDay('2026-10-09', '2026-10-08')).toBe('morgen')
    expect(relativeDay('2026-10-07', '2026-10-08')).toBe('gestern')
  })

  it('Geldeingaben', () => {
    expect(parseMoneyToCents('2.500,00 €')).toBe(250000)
    expect(parseMoneyToCents('2500')).toBe(250000)
    expect(parseMoneyToCents('12,5')).toBe(1250)
    expect(parseMoneyToCents('abc')).toBeNull()
  })
})

describe('Sicherheit und Parameter', () => {
  it('erlaubt nur interne Weiterleitungen', () => {
    expect(safeNext('/unternehmen')).toBe('/unternehmen')
    expect(safeNext('//evil.example')).toBe('/')
    expect(safeNext('/\\evil.example')).toBe('/')
    expect(safeNext('https://evil.example')).toBe('/')
    expect(safeNext(null)).toBe('/')
  })

  it('Suchparameter', () => {
    expect(str(['a', 'b'])).toBeUndefined()
    expect(pageNumber('-3')).toBe(1)
    expect(pageNumber('4')).toBe(4)
    expect(oneOf('x', ['a', 'b'] as const)).toBeUndefined()
    expect(oneOf('a', ['a', 'b'] as const)).toBe('a')
  })
})
