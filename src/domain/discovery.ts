// Discovery domain: signals, evidence score categories and the pure rules around them.
// Kept free of server imports so UI, services, AI validation and tests share it.

export const CORE_QUESTION =
  'Wenn Sie morgen für zwei Wochen einen zusätzlichen guten Vertriebsmitarbeiter hätten, der sich ausschließlich um liegengebliebene Vorgänge kümmern dürfte: Was würden Sie ihm als Erstes geben?'

export const SIGNAL_VALUES = ['yes', 'no', 'unclear'] as const
export type SignalValue = (typeof SIGNAL_VALUES)[number]

/** Validation signals per interview (spec 16). Keys match the DB columns. */
export const SIGNALS = [
  { key: 'signal_problem_confirmed', field: 'signalProblemConfirmed' },
  { key: 'signal_regular_backlog', field: 'signalRegularBacklog' },
  { key: 'signal_capacity_cause', field: 'signalCapacityCause' },
  { key: 'signal_external_ok', field: 'signalExternalOk' },
  { key: 'signal_price_ok', field: 'signalPriceOk' },
  { key: 'signal_pilot_interest', field: 'signalPilotInterest' },
] as const
export type SignalKey = (typeof SIGNALS)[number]['key']
export type SignalField = (typeof SIGNALS)[number]['field']
export const SIGNAL_KEYS = SIGNALS.map((s) => s.key) as [SignalKey, ...SignalKey[]]

export const EVIDENCE_CATEGORIES = [
  'problem',
  'frequency',
  'economic_relevance',
  'current_effort',
  'backlog',
  'capacity',
  'externalization',
  'data_access',
  'budget',
  'next_step',
] as const
export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number]
export const EVIDENCE_MAX = EVIDENCE_CATEGORIES.length * 2

/** Rubric shown next to each category so 0/1/2 means the same thing every time. */
export const EVIDENCE_RUBRIC: Record<EvidenceCategory, { question: string; levels: [string, string, string] }> = {
  problem: { question: 'Hat der Kunde das Problem selbst benannt?', levels: ['nicht erkennbar', 'angedeutet', 'klar bestätigt'] },
  frequency: { question: 'Wie oft tritt es auf?', levels: ['unklar / selten', 'gelegentlich', 'regelmäßig'] },
  economic_relevance: { question: 'Gibt es einen wirtschaftlichen Wert?', levels: ['keiner genannt', 'qualitativ', 'mit Zahlen'] },
  current_effort: { question: 'Was kostet es heute an Aufwand?', levels: ['unbekannt', 'grob beschrieben', 'konkret beziffert'] },
  backlog: { question: 'Liegt ein Bestand an Vorgängen vor?', levels: ['nein / unklar', 'vermutet', 'mit Größenordnung'] },
  capacity: { question: 'Ist Kapazität die Ursache?', levels: ['nein', 'teilweise', 'klar'] },
  externalization: { question: 'Ist externe Bearbeitung denkbar?', levels: ['abgelehnt', 'mit Vorbehalten', 'ja'] },
  data_access: { question: 'Kämen wir an die Daten?', levels: ['nein / unklar', 'mit Hürden', 'ja'] },
  budget: { question: 'Ist Budget vorhanden bzw. Preis akzeptiert?', levels: ['nein / unklar', 'grundsätzlich', 'bestätigt'] },
  next_step: { question: 'Gibt es einen konkreten nächsten Schritt?', levels: ['keiner', 'vage', 'mit Termin'] },
}

export interface EvidenceEntry {
  category: EvidenceCategory
  points: number | null
}

/** Total of confirmed points plus how many of the 10 categories are rated. */
export function evidenceTotal(entries: readonly EvidenceEntry[]) {
  const rated = entries.filter((e) => e.points != null)
  return { points: rated.reduce((s, e) => s + (e.points ?? 0), 0), rated: rated.length, max: EVIDENCE_MAX, complete: rated.length === EVIDENCE_CATEGORIES.length }
}

/** "17/20" when complete, "9/20 · 5 von 10 bewertet" otherwise, null when nothing is rated. */
export function formatEvidence(total: ReturnType<typeof evidenceTotal>): string | null {
  if (!total.rated) return null
  return total.complete ? `${total.points}/${total.max}` : `${total.points}/${total.max} · ${total.rated} von 10 bewertet`
}

export type AnswerType = 'text' | 'long_text' | 'number' | 'range' | 'boolean' | 'choice' | 'multi_choice' | 'date'

/** Answer values are stored as JSON; this checks they fit the question type. */
export function isValidAnswer(type: AnswerType, value: unknown, options: readonly string[] = []): boolean {
  if (value === null) return true
  switch (type) {
    case 'text':
    case 'long_text':
      return typeof value === 'string' && value.length <= 10_000
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) && value >= 0
    case 'range': {
      if (typeof value !== 'object' || value === null) return false
      const { min, max } = value as { min?: unknown; max?: unknown }
      const okNum = (n: unknown) => n == null || (typeof n === 'number' && Number.isFinite(n) && n >= 0)
      return okNum(min) && okNum(max) && (min != null || max != null) && (min == null || max == null || (min as number) <= (max as number))
    }
    case 'boolean':
      return typeof value === 'boolean'
    case 'choice':
      return typeof value === 'string' && options.includes(value)
    case 'multi_choice':
      return Array.isArray(value) && value.every((v) => typeof v === 'string' && options.includes(v))
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  }
}

/** Parses "30-40", "30 bis 40", "ca. 50", "50" into a range (German input). */
export function parseRange(input: string): { min: number | null; max: number | null } | null {
  const nums = input
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .match(/\d+(?:\.\d+)?/g)
  if (!nums?.length) return null
  const [a, b] = nums.map(Number) as [number, number | undefined]
  if (b == null) return { min: a, max: a }
  return a <= b ? { min: a, max: b } : { min: b, max: a }
}
