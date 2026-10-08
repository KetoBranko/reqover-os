/**
 * AI extraction and action proposals (spec 14, 15, 20).
 *
 * AI PROPOSES: the model returns `ExtractionResult` (validated by Zod).
 * DATA PROVES: `buildActions` keeps only what the source text supports, marks
 *   quotes that do not occur in the text and answers that do not fit the question.
 * HUMAN APPROVES: the actions are stored as an ai_action_proposal and executed
 *   only for the items a person accepts on the review screen.
 */
import { z } from 'zod'
import { EVIDENCE_CATEGORIES, SIGNAL_KEYS, isValidAnswer, parseRange, type AnswerType, type EvidenceCategory, type SignalKey } from './discovery'
import { parseMoneyToCents } from '@/lib/format'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const certainty = z.enum(['sicher', 'unsicher']).describe('„unsicher“, wenn der Text die Angabe nur andeutet, schätzt oder widersprüchlich ist')
const quote = z.string().max(600).nullable().describe('Wörtliches Zitat aus dem Text, das die Angabe belegt, sonst null')
const item = z.object({ value: z.string().min(1).max(1000), quote, certainty })

// ---------------------------------------------------------------------------
// What the model must return (structured output). Every field may stay empty.

export const extractionSchema = z.object({
  summary: z.string().max(2000).nullable().describe('2–4 Sätze, nur was im Text steht'),
  coreQuestionAnswer: item.nullable().describe('Antwort auf die Kernfrage („zusätzlicher Vertriebsmitarbeiter für zwei Wochen“), möglichst wörtlich'),
  mainPain: item.nullable(),
  recoveryUseCase: item.nullable().describe('Welche liegengebliebenen Vorgänge zuerst bearbeitet würden'),
  objections: z.array(item).max(10),
  externalizationConcerns: z.array(item).max(10),
  desiredKpis: z.array(item).max(10),
  facts: z.array(item).max(20).describe('Überprüfbare Fakten über das Unternehmen und seinen Vertrieb'),
  interpretations: z.array(item).max(10).describe('Eigene Schlussfolgerungen, klar als Interpretation; quote ist hier das Zitat, auf dem sie beruht'),
  answers: z
    .array(z.object({ questionKey: z.string().max(80), answer: z.string().min(1).max(2000), quote, certainty }))
    .max(40)
    .describe('Antworten auf Fragen aus dem Katalog; answer im Format des Fragetyps'),
  signals: z.array(z.object({ signal: z.enum(SIGNAL_KEYS), value: z.enum(['yes', 'no']), quote, certainty })).max(6),
  evidence: z
    .array(
      z.object({
        category: z.enum(EVIDENCE_CATEGORIES),
        points: z.number().int().min(0).max(2),
        quote,
        rationale: z.string().min(1).max(600).describe('Begründung, warum genau diese Punktzahl'),
      }),
    )
    .max(10),
  tasks: z
    .array(z.object({ title: z.string().min(1).max(300), dueDate: day.nullable(), context: z.string().max(1000).nullable(), quote, certainty }))
    .max(10),
  nextStep: z
    .object({ text: z.string().min(1).max(500), date: day.nullable(), quote, certainty })
    .nullable()
    .describe('Mit dem Kunden vereinbarter nächster Schritt'),
  opportunity: z
    .object({ title: z.string().min(1).max(200), value: z.string().max(100).nullable().describe('genannter Wert in Euro, z. B. „2.800“'), quote, certainty })
    .nullable()
    .describe('Nur wenn der Text konkretes Interesse an einem Pilot oder Auftrag belegt'),
})
export type ExtractionResult = z.infer<typeof extractionSchema>

// ---------------------------------------------------------------------------
// Actions stored in ai_action_proposals.actions

const base = {
  id: z.string().min(1).max(40),
  certainty,
  quote: z.string().max(600).nullable(),
  /** true = quote found in the source text, false = not found, null = no quote. */
  quoteVerified: z.boolean().nullable(),
}

export const DISCOVERY_TEXT_FIELDS = ['summary', 'mainPain', 'recoveryUseCase', 'coreQuestionAnswer'] as const
export const DISCOVERY_LIST_FIELDS = ['objections', 'externalizationConcerns', 'desiredKpis'] as const
export const INSIGHT_KINDS = ['fact', 'interpretation', 'customer_quote'] as const

export const proposalAction = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('discovery.field'), field: z.enum(DISCOVERY_TEXT_FIELDS), value: z.string().min(1).max(10_000) }),
  z.object({ ...base, type: z.literal('discovery.list_add'), field: z.enum(DISCOVERY_LIST_FIELDS), value: z.string().min(1).max(200) }),
  z.object({
    ...base,
    type: z.literal('discovery.answer'),
    questionKey: z.string().max(80),
    questionPrompt: z.string().max(500),
    answerType: z.enum(['text', 'long_text', 'number', 'range', 'boolean', 'choice', 'multi_choice', 'date']),
    options: z.array(z.string()).max(50),
    value: z.json(),
  }),
  z.object({ ...base, type: z.literal('discovery.signal'), signal: z.enum(SIGNAL_KEYS), value: z.enum(['yes', 'no', 'unclear']) }),
  z.object({ ...base, type: z.literal('evidence.score'), category: z.enum(EVIDENCE_CATEGORIES), points: z.number().int().min(0).max(2), rationale: z.string().min(1).max(1000) }),
  z.object({ ...base, type: z.literal('insight.create'), kind: z.enum(INSIGHT_KINDS), statement: z.string().min(1).max(2000) }),
  z.object({ ...base, type: z.literal('task.create'), title: z.string().min(1).max(300), dueDate: day.nullable(), context: z.string().max(2000).nullable() }),
  z.object({
    ...base,
    type: z.literal('opportunity.create'),
    title: z.string().min(1).max(200),
    valueCents: z.number().int().min(0).max(1_000_000_000_00).nullable(),
    nextStep: z.string().max(500).nullable(),
    nextStepDate: day.nullable(),
  }),
  z.object({
    ...base,
    type: z.literal('opportunity.next_step'),
    opportunityId: z.uuid(),
    opportunityTitle: z.string().max(200),
    nextStep: z.string().min(1).max(500),
    nextStepDate: day.nullable(),
  }),
])
export type ProposalAction = z.infer<typeof proposalAction>
export type ProposalActionType = ProposalAction['type']
export const proposalActions = z.array(proposalAction).max(150)

/** Decision per action id, sent from the review screen. `action` carries the (possibly edited) item. */
export const proposalDecision = z.object({
  proposalId: z.uuid(),
  accepted: z.array(proposalAction).max(150),
})
export type ProposalDecision = z.infer<typeof proposalDecision>

// ---------------------------------------------------------------------------
// From model output to verified actions

export interface CatalogQuestion {
  key: string
  prompt: string
  answerType: AnswerType
  options: string[]
}

export interface BuildContext {
  sourceText: string
  catalog: CatalogQuestion[]
  today: string
  /** Open opportunity of the company: a next step updates it instead of creating a new one. */
  openOpportunity: { id: string; title: string } | null
}

export interface BuildResult {
  actions: ProposalAction[]
  /** Items the server dropped, with the reason (shown on the review screen). */
  dropped: string[]
}

const normalize = (s: string) => s.toLocaleLowerCase('de-DE').replace(/[„“”"'‚‘’»«]/g, '').replace(/\s+/g, ' ').trim()

export function quoteFound(source: string, q: string | null): boolean | null {
  if (!q?.trim()) return null
  const needle = normalize(q).replace(/[.…]+$/, '')
  return needle.length > 0 && normalize(source).includes(needle)
}

/** Converts a model's text answer into the stored JSON value for the question type; null if it does not fit. */
export function coerceAnswer(q: CatalogQuestion, raw: string): unknown {
  const text = raw.trim()
  let value: unknown
  switch (q.answerType) {
    case 'text':
    case 'long_text':
      value = text
      break
    case 'number': {
      const r = parseRange(text)
      value = r && r.min === r.max ? r.min : null
      break
    }
    case 'range':
      value = parseRange(text)
      break
    case 'boolean':
      value = /^(ja|yes|true)\b/i.test(text) ? true : /^(nein|no|false)\b/i.test(text) ? false : null
      break
    case 'choice':
      value = q.options.find((o) => normalize(o) === normalize(text)) ?? null
      break
    case 'multi_choice': {
      const parts = text.split(/[;,\n]/).map((p) => p.trim()).filter(Boolean)
      const matched = parts.map((p) => q.options.find((o) => normalize(o) === normalize(p)))
      value = matched.length && matched.every(Boolean) ? matched : null
      break
    }
    case 'date':
      value = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
      break
  }
  return value != null && isValidAnswer(q.answerType, value, q.options) ? value : null
}

export function buildActions(x: ExtractionResult, ctx: BuildContext): BuildResult {
  const actions: ProposalAction[] = []
  const dropped: string[] = []
  let n = 0
  const meta = (q: string | null, c: 'sicher' | 'unsicher') => {
    const verified = quoteFound(ctx.sourceText, q)
    // A quote that is not in the text is never presented as certain.
    return { id: `a${++n}`, quote: q?.trim() || null, quoteVerified: verified, certainty: verified === false ? ('unsicher' as const) : c }
  }

  if (x.summary?.trim()) actions.push({ ...meta(null, 'sicher'), type: 'discovery.field', field: 'summary', value: x.summary.trim() })
  for (const field of ['coreQuestionAnswer', 'mainPain', 'recoveryUseCase'] as const) {
    const v = x[field]
    if (v) actions.push({ ...meta(v.quote, v.certainty), type: 'discovery.field', field, value: v.value.trim() })
  }
  for (const field of DISCOVERY_LIST_FIELDS) {
    for (const v of x[field]) actions.push({ ...meta(v.quote, v.certainty), type: 'discovery.list_add', field, value: v.value.trim().slice(0, 200) })
  }

  const catalog = new Map(ctx.catalog.map((q) => [q.key, q]))
  const seenAnswers = new Set<string>()
  for (const a of x.answers) {
    const q = catalog.get(a.questionKey)
    if (!q) {
      dropped.push(`Antwort auf unbekannte Frage „${a.questionKey}“ verworfen.`)
      continue
    }
    if (seenAnswers.has(q.key)) continue
    const value = coerceAnswer(q, a.answer)
    if (value == null) {
      dropped.push(`„${a.answer}“ passt nicht zur Frage „${q.prompt}“ und wurde nicht übernommen.`)
      continue
    }
    seenAnswers.add(q.key)
    actions.push({ ...meta(a.quote, a.certainty), type: 'discovery.answer', questionKey: q.key, questionPrompt: q.prompt, answerType: q.answerType, options: q.options, value: value as z.infer<ReturnType<typeof z.json>> })
  }

  const seenSignals = new Set<SignalKey>()
  for (const s of x.signals) {
    if (seenSignals.has(s.signal)) continue
    seenSignals.add(s.signal)
    actions.push({ ...meta(s.quote, s.certainty), type: 'discovery.signal', signal: s.signal, value: s.value })
  }

  const seenCategories = new Set<EvidenceCategory>()
  for (const e of x.evidence) {
    if (seenCategories.has(e.category)) continue
    seenCategories.add(e.category)
    const m = meta(e.quote, 'sicher')
    // Points above 0 need evidence from the text; without it the suggestion is marked uncertain.
    actions.push({ ...m, certainty: e.points > 0 && m.quoteVerified !== true ? 'unsicher' : m.certainty, type: 'evidence.score', category: e.category, points: e.points, rationale: e.rationale.trim() })
  }

  for (const f of x.facts) actions.push({ ...meta(f.quote, f.certainty), type: 'insight.create', kind: 'fact', statement: f.value.trim() })
  for (const i of x.interpretations) actions.push({ ...meta(i.quote, i.certainty), type: 'insight.create', kind: 'interpretation', statement: i.value.trim() })

  for (const t of x.tasks) {
    const due = t.dueDate && t.dueDate >= ctx.today ? t.dueDate : null
    if (t.dueDate && !due) dropped.push(`Fälligkeit ${t.dueDate} für „${t.title}“ liegt in der Vergangenheit und wurde entfernt.`)
    actions.push({ ...meta(t.quote, t.certainty), type: 'task.create', title: t.title.trim(), dueDate: due, context: t.context?.trim() || null })
  }

  const nextDate = x.nextStep?.date && x.nextStep.date >= ctx.today ? x.nextStep.date : null
  if (ctx.openOpportunity && x.nextStep) {
    actions.push({
      ...meta(x.nextStep.quote, x.nextStep.certainty),
      type: 'opportunity.next_step',
      opportunityId: ctx.openOpportunity.id,
      opportunityTitle: ctx.openOpportunity.title,
      nextStep: x.nextStep.text.trim(),
      nextStepDate: nextDate,
    })
  } else if (!ctx.openOpportunity && x.opportunity) {
    actions.push({
      ...meta(x.opportunity.quote, x.opportunity.certainty),
      type: 'opportunity.create',
      title: x.opportunity.title.trim(),
      valueCents: x.opportunity.value ? parseMoneyToCents(x.opportunity.value.replace(/[^\d.,]/g, '')) : null,
      nextStep: x.nextStep?.text.trim() ?? null,
      nextStepDate: nextDate,
    })
  } else if (x.nextStep) {
    // No opportunity to attach it to: keep the agreed next step as a task.
    actions.push({ ...meta(x.nextStep.quote, x.nextStep.certainty), type: 'task.create', title: x.nextStep.text.trim(), dueDate: nextDate, context: 'Vereinbarter nächster Schritt aus dem Gespräch' })
  }
  return { actions, dropped }
}

/** Re-validates an accepted (possibly edited) action against the stored original. */
export function mergeAccepted(original: ProposalAction, edited: ProposalAction): ProposalAction | null {
  if (original.type !== edited.type || original.id !== edited.id) return null
  // Identity fields can never be changed from the client.
  const locked = { id: original.id, type: original.type, quote: original.quote, quoteVerified: original.quoteVerified }
  if (original.type === 'discovery.answer' && edited.type === 'discovery.answer') {
    const merged = { ...edited, ...locked, questionKey: original.questionKey, questionPrompt: original.questionPrompt, answerType: original.answerType, options: original.options }
    return isValidAnswer(merged.answerType, merged.value, merged.options) && merged.value !== null ? (merged as ProposalAction) : null
  }
  if (original.type === 'opportunity.next_step' && edited.type === 'opportunity.next_step') {
    return { ...edited, ...locked, opportunityId: original.opportunityId, opportunityTitle: original.opportunityTitle } as ProposalAction
  }
  if (original.type === 'discovery.field' && edited.type === 'discovery.field') return { ...edited, ...locked, field: original.field } as ProposalAction
  if (original.type === 'discovery.list_add' && edited.type === 'discovery.list_add') return { ...edited, ...locked, field: original.field } as ProposalAction
  if (original.type === 'discovery.signal' && edited.type === 'discovery.signal') return { ...edited, ...locked, signal: original.signal } as ProposalAction
  if (original.type === 'evidence.score' && edited.type === 'evidence.score') return { ...edited, ...locked, category: original.category } as ProposalAction
  return { ...edited, ...locked } as ProposalAction
}
