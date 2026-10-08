import { describe, expect, it } from 'vitest'
import {
  NO_DATA,
  briefingLines,
  computeValidation,
  countDue,
  explain,
  greeting,
  joinGerman,
  prioritize,
  topValues,
  validationSentence,
  type BriefingInput,
  type ValidationInterview,
} from '@/domain/briefing'

const today = '2026-10-08'
const emptyInput: BriefingInput = { today, tasks: [], opportunities: [], signals: [] }
const noValidation = computeValidation([], { proposed: new Set(), won: new Set() })

function input(partial: Partial<BriefingInput>): BriefingInput {
  return { ...emptyInput, ...partial }
}

describe('Priorisierung', () => {
  it('liefert ohne Daten nichts und erfindet keine Aussagen', () => {
    expect(prioritize(emptyInput)).toEqual([])
    const lines = briefingLines({ items: [], counts: countDue(emptyInput), validation: noValidation, changes: null, formatSince: String })
    expect(lines.map((l) => l.text)).toEqual(['Heute stehen keine fälligen Aktionen an.', `Aktuelle Validierung: ${NO_DATA}`])
  })

  it('bestätigter Bedarf + Wiedervorlage heute + Preis akzeptiert ergibt hohe Priorität mit Begründung', () => {
    const items = prioritize(
      input({
        opportunities: [
          { id: 'o1', title: 'Pilot', companyId: 'c1', companyName: 'Muster GmbH', stageKey: 'need_confirmed', valueCents: 280000, nextStep: 'Rückruf', nextStepDate: today, lastTouchDay: '2026-10-07' },
          { id: 'o2', title: 'Erstkontakt', companyId: 'c2', companyName: 'Beispiel AG', stageKey: 'contacted', valueCents: null, nextStep: 'Anrufen', nextStepDate: '2026-10-20', lastTouchDay: '2026-10-07' },
        ],
        signals: [{ companyId: 'c1', companyName: 'Muster GmbH', problemConfirmed: true, priceOk: true, evidencePoints: 17, discoveryId: 'd1', discoveryCompletedDay: '2026-10-01' }],
      }),
    )
    expect(items).toHaveLength(1)
    const [top] = items
    expect(top).toMatchObject({ title: 'Muster GmbH', high: true, evidencePoints: 17, prepareHref: '/unternehmen/c1/vorbereitung' })
    expect(top!.reasons.map((r) => r.code)).toEqual(['followup_today', 'need_confirmed', 'strong_evidence', 'price_ok'])
    expect(top!.score).toBe(30 + 15 + 10 + 5)
    expect(explain(top!)).toBe(
      'Die vereinbarte Wiedervorlage ist heute, der Bedarf wurde im Discovery-Gespräch bestätigt und der Evidence Score liegt bei 17/20.',
    )
  })

  it('Booster allein machen nichts dringend', () => {
    const items = prioritize(
      input({
        opportunities: [{ id: 'o1', title: 'Pilot', companyId: 'c1', companyName: 'Muster GmbH', stageKey: 'proposal', valueCents: null, nextStep: 'Angebot nachfassen', nextStepDate: '2026-10-12', lastTouchDay: today }],
        signals: [{ companyId: 'c1', companyName: 'Muster GmbH', problemConfirmed: true, priceOk: true, evidencePoints: 18, discoveryId: 'd1', discoveryCompletedDay: '2026-10-01' }],
      }),
    )
    expect(items).toEqual([])
  })

  it('erkennt überfällige Aufgaben, fehlende nächste Schritte, Inaktivität und Discovery ohne Folgeschritt', () => {
    const items = prioritize(
      input({
        tasks: [
          { id: 't1', title: 'Angebot schicken', dueDate: '2026-10-05', priority: 'high', companyId: 'c1', companyName: 'Muster GmbH' },
          { id: 't2', title: 'Später', dueDate: '2026-10-30', priority: 'normal', companyId: 'c1', companyName: 'Muster GmbH' },
          { id: 't3', title: 'Steuerberater anrufen', dueDate: today, priority: 'normal', companyId: null, companyName: null },
        ],
        opportunities: [{ id: 'o2', title: 'Chance', companyId: 'c2', companyName: 'Beispiel AG', stageKey: 'contacted', valueCents: null, nextStep: null, nextStepDate: null, lastTouchDay: '2026-09-01' }],
        signals: [{ companyId: 'c3', companyName: 'Discovery KG', problemConfirmed: false, priceOk: false, evidencePoints: null, discoveryId: 'd3', discoveryCompletedDay: '2026-10-02' }],
      }),
    )
    const byTitle = Object.fromEntries(items.map((i) => [i.title, i]))
    expect(byTitle['Muster GmbH']!.reasons.map((r) => r.code)).toEqual(['task_overdue', 'task_high_priority'])
    expect(byTitle['Muster GmbH']!.reasons[0]!.weight).toBe(43)
    expect(byTitle['Muster GmbH']!.actions).toEqual(['Angebot schicken'])
    expect(byTitle['Steuerberater anrufen']).toMatchObject({ companyId: null, href: '/aufgaben', prepareHref: null })
    expect(byTitle['Beispiel AG']!.reasons.map((r) => r.code)).toEqual(['no_next_step', 'stale'])
    expect(byTitle['Beispiel AG']!.reasons[1]!.label).toBe('37 Tage ohne Aktivität')
    expect(byTitle['Discovery KG']!.reasons[0]!.clause).toBe('seit dem Discovery-Gespräch vom 02.10.2026 fehlt ein konkreter nächster Schritt')
    expect(items[0]!.title).toBe('Muster GmbH')
  })

  it('formuliert das Briefing aus den Zahlen', () => {
    const data = input({
      tasks: [
        { id: 't1', title: 'A', dueDate: today, priority: 'normal', companyId: 'c1', companyName: 'Muster GmbH' },
        { id: 't2', title: 'B', dueDate: '2026-10-01', priority: 'normal', companyId: 'c2', companyName: 'Beispiel AG' },
      ],
      opportunities: [{ id: 'o1', title: 'Pilot', companyId: 'c1', companyName: 'Muster GmbH', stageKey: 'pilot_opportunity', valueCents: null, nextStep: 'Rückruf', nextStepDate: today, lastTouchDay: today }],
    })
    const items = prioritize(data)
    const lines = briefingLines({
      items,
      counts: countDue(data),
      validation: noValidation,
      changes: { since: new Date('2026-10-07T16:00:00Z'), byType: [{ type: 'note', count: 2 }, { type: 'stage_change', count: 1 }] },
      formatSince: () => '07.10.2026, 18:00',
    })
    expect(lines.map((l) => l.kind)).toEqual(['headline', 'load', 'recommendation', 'validation', 'changes'])
    expect(lines[0]!.text).toBe('Heute stehen zwei relevante Aktionen an. Eine davon hat hohe Priorität.')
    expect(lines[1]!.text).toBe('Du hast heute eine Aufgabe und eine Wiedervorlage. Ein Punkt ist überfällig.')
    expect(lines[2]!.text.startsWith('Meine Empfehlung: Beginne mit Muster GmbH.')).toBe(true)
    expect(lines[4]!.text).toBe('Seit deinem letzten Besuch (07.10.2026, 18:00): 3 neue Einträge im Verlauf (2 × Notiz, 1 × Statusänderung).')
  })
})

describe('Validierung', () => {
  const base: ValidationInterview = {
    companyId: 'c1',
    signals: {
      signal_problem_confirmed: 'yes',
      signal_regular_backlog: 'yes',
      signal_capacity_cause: 'no',
      signal_external_ok: 'unclear',
      signal_price_ok: 'unclear',
      signal_pilot_interest: 'unclear',
    },
    mainPain: 'Angebote werden nicht nachgefasst',
    recoveryUseCase: null,
    objections: ['Datenschutz'],
    externalizationConcerns: [],
    desiredKpis: [],
  }

  it('rechnet aus echten Gesprächen, Pilotangebot/Gewonnen je Unternehmen', () => {
    const v = computeValidation(
      [base, { ...base, companyId: 'c2', mainPain: '  angebote werden NICHT nachgefasst ', objections: ['datenschutz', 'Kundenbeziehung'], signals: { ...base.signals, signal_problem_confirmed: 'no' } }],
      { proposed: new Set(['c2', 'cX']), won: new Set() },
    )
    expect(v.interviews).toBe(2)
    expect(v.signals[0]).toMatchObject({ label: 'Problem bestätigt', yes: 1, no: 1, unclear: 0 })
    expect(v.proposed).toBe(1)
    expect(v.won).toBe(0)
    expect(v.topPains).toEqual([{ label: 'Angebote werden nicht nachgefasst', count: 2 }])
    expect(v.topObjections).toEqual([
      { label: 'Datenschutz', count: 2 },
      { label: 'Kundenbeziehung', count: 1 },
    ])
    expect(v.topUseCases).toEqual([])
    expect(validationSentence(v)).toBe('2 abgeschlossene Gespräche, 1 × Problem bestätigt, 2 × Regelmäßiger Backlog und 1 × Pilotangebot.')
  })

  it('topValues ignoriert Leeres', () => {
    expect(topValues([null, '', '  ', undefined])).toEqual([])
  })
})

describe('Sprache', () => {
  it('Begrüßung nach Tageszeit, Aufzählungen', () => {
    expect(greeting(7, 'Branko')).toBe('Guten Morgen, Branko.')
    expect(greeting(14, null)).toBe('Guten Tag.')
    expect(greeting(20, 'Branko')).toBe('Guten Abend, Branko.')
    expect(joinGerman(['a'])).toBe('a')
    expect(joinGerman(['a', 'b', 'c'])).toBe('a, b und c')
  })
})
