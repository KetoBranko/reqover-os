import 'server-only'
import type { ExtractionResult } from '@/domain/ai'
import { addDays } from '@/lib/format'
import type { AIProvider, ChatMessage, ToolCall } from './provider'

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
  async chat(req) {
    return { ...chatTurn(req.messages, /Heute ist [^,]+, (\d{4}-\d{2}-\d{2})/.exec(req.system)?.[1] ?? '2026-01-01'), model: 'testmodus' }
  },
}

/** Rule-based stand-in for the assistant: one tool call, then a short answer built from its result. */
function chatTurn(messages: ChatMessage[], today: string): { text: string; toolCalls: ToolCall[] } {
  const lastUser = messages.findLastIndex((m) => m.role === 'user')
  const question = (messages[lastUser] as Extract<ChatMessage, { role: 'user' }>).text
  const results = messages.slice(lastUser + 1).flatMap((m) => (m.role === 'tool' ? m.results : []))
  if (!results.length) {
    const call = (name: string, input: unknown) => ({ text: '', toolCalls: [{ id: `call_${name}`, name, input }] })
    const task = /aufgabe(?:\s+an)?\s*:?\s+(.+?)(?:\s+für\s+morgen)?[.!?]?$/i.exec(question)
    if (task) return call('aufgabe_vorschlagen', { titel: task[1]!.trim(), faellig: /morgen/i.test(question) ? addDays(today, 1) : null, unternehmenId: null, kontext: null })
    if (/einwänd|einwand|validierung/i.test(question)) return call('validierung', {})
    if (/heute|priorisier|was muss/i.test(question)) return call('heute_priorisiert', {})
    const word = question.split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? question
    return call('suche', { begriff: word.replace(/[^\p{L}\p{N}-]/gu, '') })
  }
  const r = results[0]!
  if (r.name === 'aufgabe_vorschlagen') return { text: 'Testmodus: Ich würde folgende Änderungen durchführen. Übernehmen?', toolCalls: [] }
  const data = JSON.parse(r.content.startsWith('{') || r.content.startsWith('[') ? r.content : '{}') as Record<string, unknown>
  if (r.name === 'heute_priorisiert') {
    const top = (data.prioritaeten as { titel: string; begruendung: string }[] | undefined)?.[0]
    return { text: top ? `Testmodus: Beginne mit ${top.titel}. ${top.begruendung} (laut Priorisierung)` : 'Testmodus: Heute ist nichts fällig. (laut Priorisierung)', toolCalls: [] }
  }
  if (r.name === 'validierung') return { text: `Testmodus: ${data.abgeschlosseneGespraeche ?? 0} abgeschlossene Gespräche. (laut Validierung)`, toolCalls: [] }
  const hits = Array.isArray(data) ? (data as { name: string }[]).map((h) => h.name) : []
  return { text: hits.length ? `Testmodus: Gefunden: ${hits.join(', ')}.` : 'Testmodus: Dazu liegen mir noch keine ausreichenden Daten vor.', toolCalls: [] }
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
