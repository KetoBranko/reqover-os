import { describe, expect, it } from 'vitest'
import { buildActions, coerceAnswer, extractionSchema, mergeAccepted, quoteFound, type CatalogQuestion, type ExtractionResult } from '@/domain/ai'

const catalog: CatalogQuestion[] = [
  { key: 'quotes_per_month', prompt: 'Wie viele Angebote pro Monat?', answerType: 'range', options: [] },
  { key: 'crm', prompt: 'Welches CRM?', answerType: 'choice', options: ['Salesforce', 'HubSpot', 'Keins'] },
  { key: 'fixed_followups', prompt: 'Feste Wiedervorlagen?', answerType: 'boolean', options: [] },
]
const empty: ExtractionResult = extractionSchema.parse({
  summary: null, coreQuestionAnswer: null, mainPain: null, recoveryUseCase: null, objections: [], externalizationConcerns: [], desiredKpis: [],
  facts: [], interpretations: [], answers: [], signals: [], evidence: [], tasks: [], nextStep: null, opportunity: null,
})
const source = 'Die machen ungefähr 30 bis 40 Angebote im Monat. „Da bleibt einiges liegen“, sagt er.'
const ctx = { sourceText: source, catalog, today: '2026-10-08', openOpportunity: null }

describe('AI-Extraktion → Vorschläge', () => {
  it('prüft Zitate gegen den Text (Groß/Klein, Anführungszeichen, Leerraum egal)', () => {
    expect(quoteFound(source, 'da bleibt  einiges liegen')).toBe(true)
    expect(quoteFound(source, 'Wir haben 60 alte Angebote')).toBe(false)
    expect(quoteFound(source, null)).toBeNull()
  })

  it('wandelt Antworten typgerecht um und verwirft Unpassendes', () => {
    expect(coerceAnswer(catalog[0]!, '30-40')).toEqual({ min: 30, max: 40 })
    expect(coerceAnswer(catalog[1]!, 'hubspot')).toBe('HubSpot')
    expect(coerceAnswer(catalog[1]!, 'Excel')).toBeNull()
    expect(coerceAnswer(catalog[2]!, 'Nein, gibt es nicht')).toBe(false)
  })

  it('erfundene Zitate machen eine Angabe unsicher; unbekannte Fragen und Vergangenheitstermine fallen weg', () => {
    const { actions, dropped } = buildActions(
      {
        ...empty,
        mainPain: { value: 'Angebote bleiben liegen', quote: 'Da bleibt einiges liegen', certainty: 'sicher' },
        facts: [{ value: '60 alte Angebote', quote: 'Wir haben 60 alte Angebote', certainty: 'sicher' }],
        answers: [
          { questionKey: 'quotes_per_month', answer: '30-40', quote: 'ungefähr 30 bis 40 Angebote', certainty: 'unsicher' },
          { questionKey: 'erfunden', answer: 'x', quote: null, certainty: 'sicher' },
          { questionKey: 'crm', answer: 'Excel', quote: null, certainty: 'sicher' },
        ],
        evidence: [{ category: 'economic_relevance', points: 2, quote: null, rationale: 'Viel Geld' }],
        tasks: [{ title: 'Anrufen', dueDate: '2026-01-01', context: null, quote: null, certainty: 'sicher' }],
      },
      ctx,
    )
    expect(actions.find((a) => a.type === 'discovery.field')).toMatchObject({ field: 'mainPain', certainty: 'sicher', quoteVerified: true })
    expect(actions.find((a) => a.type === 'insight.create')).toMatchObject({ certainty: 'unsicher', quoteVerified: false })
    expect(actions.find((a) => a.type === 'discovery.answer')).toMatchObject({ value: { min: 30, max: 40 }, certainty: 'unsicher' })
    expect(actions.find((a) => a.type === 'evidence.score')).toMatchObject({ points: 2, certainty: 'unsicher' })
    expect(actions.find((a) => a.type === 'task.create')).toMatchObject({ dueDate: null })
    expect(dropped).toHaveLength(3)
  })

  it('nächster Schritt: aktualisiert offene Chance, sonst neue Chance oder Aufgabe', () => {
    const x = { ...empty, nextStep: { text: 'Pilot abstimmen', date: '2026-10-15', quote: null, certainty: 'sicher' as const } }
    expect(buildActions(x, { ...ctx, openOpportunity: { id: '00000000-0000-4000-8000-000000000001', title: 'Pilot' } }).actions[0]).toMatchObject({ type: 'opportunity.next_step', nextStepDate: '2026-10-15' })
    expect(buildActions(x, ctx).actions[0]).toMatchObject({ type: 'task.create', title: 'Pilot abstimmen' })
    const withOpp = { ...x, opportunity: { title: 'Pilot', value: 'ca. 2.800 €', quote: null, certainty: 'unsicher' as const } }
    expect(buildActions(withOpp, ctx).actions[0]).toMatchObject({ type: 'opportunity.create', valueCents: 280000, nextStep: 'Pilot abstimmen' })
  })

  it('Bearbeitungen dürfen Identität, Zitat und Frage nicht ändern', () => {
    const [a] = buildActions({ ...empty, answers: [{ questionKey: 'quotes_per_month', answer: '30-40', quote: null, certainty: 'sicher' }] }, ctx).actions
    expect(a!.type).toBe('discovery.answer')
    const edited = mergeAccepted(a!, { ...a!, quote: 'gefälscht', questionKey: 'crm', value: { min: 10, max: 20 } } as typeof a)
    expect(edited).toMatchObject({ quote: null, questionKey: 'quotes_per_month', value: { min: 10, max: 20 } })
    expect(mergeAccepted(a!, { ...a!, value: 'Text' } as typeof a)).toBeNull()
  })
})
