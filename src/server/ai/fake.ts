import 'server-only'
import type { ExtractionResult } from '@/domain/ai'
import { addDays } from '@/lib/format'
import type { AIProvider } from './provider'

/**
 * Deterministic test double (APP_ENV=test only, enforced in env()). It derives
 * a small extraction from simple patterns in the notes so the proposal/review
 * pipeline can be tested end to end without a model. Never used in production.
 */
export const fakeProvider: AIProvider = {
  id: 'fake',
  async generateStructured(req) {
    if (req.task !== 'discovery_extraction') throw new Error('fake provider: unsupported task')
    return { data: req.schema.parse(extract(req.input)), model: 'testmodus' }
  },
}

function extract(input: string): ExtractionResult {
  const today = /HEUTE: (\d{4}-\d{2}-\d{2})/.exec(input)?.[1] ?? '2026-01-01'
  const notes = input.split('NOTIZEN:')[1] ?? ''
  const sentences = notes
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const find = (re: RegExp) => sentences.find((s) => re.test(s)) ?? null
  const pain = find(/liegen|nachgefasst|nachverfolg/i)
  const volume = /(\d+)\s*(?:bis|-)\s*(\d+)\s*Angebote/i.exec(notes)
  const call = find(/anrufen|melden|zurückrufen|schicken/i)
  const pilot = find(/pilot/i)
  const objection = find(/datenschutz/i)

  return {
    summary: sentences.slice(0, 2).join(' ') || null,
    coreQuestionAnswer: null,
    mainPain: pain ? { value: pain, quote: pain, certainty: 'sicher' } : null,
    recoveryUseCase: null,
    objections: objection ? [{ value: 'Datenschutz', quote: objection, certainty: 'sicher' }] : [],
    externalizationConcerns: [],
    desiredKpis: [],
    facts: volume ? [{ value: `${volume[1]}–${volume[2]} Angebote pro Monat`, quote: volume[0], certainty: 'unsicher' }] : [],
    interpretations: [],
    answers: volume ? [{ questionKey: 'quotes_per_month', answer: `${volume[1]}-${volume[2]}`, quote: volume[0], certainty: 'sicher' }] : [],
    signals: pain ? [{ signal: 'signal_problem_confirmed', value: 'yes', quote: pain, certainty: 'sicher' }] : [],
    evidence: [
      pain
        ? { category: 'problem', points: 2, quote: pain, rationale: 'Der Kunde benennt das Problem selbst.' }
        : { category: 'problem', points: 0, quote: null, rationale: 'Im Text wird kein Problem genannt.' },
      { category: 'economic_relevance', points: 0, quote: null, rationale: 'Kein wirtschaftlicher Wert genannt.' },
    ],
    tasks: call ? [{ title: call.replace(/[.!?]$/, ''), dueDate: addDays(today, 1), context: 'Aus der Gesprächsnotiz', quote: call, certainty: 'sicher' }] : [],
    nextStep: pilot ? { text: 'Pilotumfang abstimmen', date: addDays(today, 7), quote: pilot, certainty: 'unsicher' } : null,
    opportunity: pilot ? { title: 'Pilot: Angebots-Recovery', value: null, quote: pilot, certainty: 'unsicher' } : null,
  }
}
