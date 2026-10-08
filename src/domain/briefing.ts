/**
 * Deterministic briefing and prioritisation for the Übersicht (Command Center).
 *
 * Every statement is derived from the data passed in, and every priority carries
 * the reasons (with their weights) that produced it, so "Warum?" is always answerable.
 * No AI is involved here; the AI layer may later phrase or explain, never invent.
 */
import { de } from '@/i18n/de'
import type { PipelineStageKey } from './schemas'
import { daysBetween, formatDay, relativeDay } from '@/lib/format'
import { EVIDENCE_MAX } from './discovery'

export const NO_DATA = 'Dazu liegen mir noch keine ausreichenden Daten vor.'

/** Opportunities without any activity for this many days count as inactive. */
export const STALE_DAYS = 14
/** Evidence Score from which an opportunity counts as well-evidenced. */
export const STRONG_EVIDENCE = 14
/** Total weight from which an item is shown as "Hohe Priorität". */
export const HIGH_PRIORITY = 50

export const REASON_WEIGHT = {
  task_overdue: 40,
  task_today: 30,
  followup_overdue: 40,
  followup_today: 30,
  discovery_without_next_step: 25,
  no_next_step: 15,
  stale: 10,
  need_confirmed: 15,
  late_stage: 15,
  strong_evidence: 10,
  price_ok: 5,
  task_high_priority: 10,
} as const
export type ReasonCode = keyof typeof REASON_WEIGHT

/** Reasons that make something due now. Boosters only count when at least one of these exists. */
const TRIGGERS = new Set<ReasonCode>(['task_overdue', 'task_today', 'followup_overdue', 'followup_today', 'discovery_without_next_step', 'no_next_step', 'stale'])

export interface BriefingTask {
  id: string
  title: string
  dueDate: string | null
  priority: 'low' | 'normal' | 'high'
  companyId: string | null
  companyName: string | null
}

export interface BriefingOpportunity {
  id: string
  title: string
  companyId: string
  companyName: string
  stageKey: PipelineStageKey
  valueCents: number | null
  nextStep: string | null
  nextStepDate: string | null
  /** Berlin day of the last activity for the company, or of the last stage change if none. */
  lastTouchDay: string
}

export interface BriefingCompanySignals {
  companyId: string
  companyName: string
  problemConfirmed: boolean
  priceOk: boolean
  evidencePoints: number | null
  /** Latest completed discovery. */
  discoveryId: string | null
  discoveryCompletedDay: string | null
}

export interface BriefingInput {
  today: string
  tasks: BriefingTask[]
  opportunities: BriefingOpportunity[]
  signals: BriefingCompanySignals[]
}

export interface PriorityReason {
  code: ReasonCode
  weight: number
  /** Short chip text, e.g. "Wiedervorlage heute". */
  label: string
  /** Clause for sentences, e.g. "die Wiedervorlage ist heute fällig". */
  clause: string
}

export interface PriorityItem {
  key: string
  companyId: string | null
  title: string
  /** The concrete things to do, most urgent first. */
  actions: string[]
  reasons: PriorityReason[]
  score: number
  high: boolean
  evidencePoints: number | null
  href: string
  prepareHref: string | null
}

interface Group {
  key: string
  companyId: string | null
  title: string
  actions: { text: string; weight: number }[]
  reasons: PriorityReason[]
  evidencePoints: number | null
  taskHref: string | null
}

function reason(code: ReasonCode, label: string, clause: string, extra = 0): PriorityReason {
  return { code, weight: REASON_WEIGHT[code] + extra, label, clause }
}

function overdueExtra(days: number) {
  return Math.min(days, 10)
}

export function prioritize(input: BriefingInput): PriorityItem[] {
  const { today } = input
  const groups = new Map<string, Group>()
  const groupFor = (companyId: string | null, title: string, fallbackKey: string) => {
    const key = companyId ? `company:${companyId}` : fallbackKey
    let g = groups.get(key)
    if (!g) {
      g = { key, companyId, title, actions: [], reasons: [], evidencePoints: null, taskHref: null }
      groups.set(key, g)
    }
    return g
  }

  for (const t of input.tasks) {
    if (!t.dueDate || t.dueDate > today) continue
    const g = groupFor(t.companyId, t.companyName ?? t.title, `task:${t.id}`)
    if (!t.companyId) g.taskHref = '/aufgaben'
    const late = daysBetween(t.dueDate, today)
    const r =
      late > 0
        ? reason('task_overdue', late === 1 ? 'Aufgabe seit gestern überfällig' : `Aufgabe seit ${late} Tagen überfällig`, `die Aufgabe „${t.title}“ ist ${late === 1 ? 'seit gestern' : `seit ${late} Tagen`} überfällig`, overdueExtra(late))
        : reason('task_today', 'Aufgabe heute fällig', `die Aufgabe „${t.title}“ ist heute fällig`)
    g.reasons.push(r)
    g.actions.push({ text: t.title, weight: r.weight })
    if (t.priority === 'high') g.reasons.push(reason('task_high_priority', 'Hohe Aufgabenpriorität', `„${t.title}“ ist als hoch priorisiert markiert`))
  }

  for (const o of input.opportunities) {
    const g = groupFor(o.companyId, o.companyName, `opp:${o.id}`)
    if (o.nextStepDate && o.nextStepDate <= today) {
      const late = daysBetween(o.nextStepDate, today)
      const step = o.nextStep ?? 'Wiedervorlage'
      const r =
        late > 0
          ? reason('followup_overdue', late === 1 ? 'Wiedervorlage seit gestern fällig' : `Wiedervorlage seit ${late} Tagen fällig`, `die vereinbarte Wiedervorlage war ${relativeDay(o.nextStepDate, today)} fällig`, overdueExtra(late))
          : reason('followup_today', 'Wiedervorlage heute', 'die vereinbarte Wiedervorlage ist heute')
      g.reasons.push(r)
      g.actions.push({ text: step, weight: r.weight })
    } else if (!o.nextStep && !o.nextStepDate) {
      const r = reason('no_next_step', 'Kein nächster Schritt', `für „${o.title}“ ist kein nächster Schritt festgelegt`)
      g.reasons.push(r)
      g.actions.push({ text: `Nächsten Schritt für „${o.title}“ festlegen`, weight: r.weight })
    }
    const idle = daysBetween(o.lastTouchDay, today)
    if (idle >= STALE_DAYS) g.reasons.push(reason('stale', `${idle} Tage ohne Aktivität`, `seit ${idle} Tagen gab es keine Aktivität`))
    if (o.stageKey === 'pilot_opportunity' || o.stageKey === 'proposal') {
      g.reasons.push(reason('late_stage', `Phase: ${de.pipelineStage[o.stageKey]}`, `die Chance steht in der Phase „${de.pipelineStage[o.stageKey]}“`))
    }
  }

  const openOppCompanies = new Set(input.opportunities.map((o) => o.companyId))
  const companiesWithPlannedStep = new Set([
    ...input.tasks.filter((t) => t.companyId).map((t) => t.companyId!),
    ...input.opportunities.filter((o) => o.nextStep || o.nextStepDate).map((o) => o.companyId),
  ])

  for (const s of input.signals) {
    if (s.discoveryId && !companiesWithPlannedStep.has(s.companyId)) {
      const g = groupFor(s.companyId, s.companyName, `company:${s.companyId}`)
      const when = s.discoveryCompletedDay ? ` vom ${formatDay(s.discoveryCompletedDay)}` : ''
      if (!openOppCompanies.has(s.companyId) || !g.reasons.some((r) => r.code === 'no_next_step')) {
        const r = reason('discovery_without_next_step', 'Nach Discovery kein nächster Schritt', `seit dem Discovery-Gespräch${when} fehlt ein konkreter nächster Schritt`)
        g.reasons.push(r)
        g.actions.push({ text: 'Nächsten Schritt nach dem Discovery-Gespräch festlegen', weight: r.weight })
      }
    }
  }

  const signalsByCompany = new Map(input.signals.map((s) => [s.companyId, s]))
  const items: PriorityItem[] = []
  for (const g of groups.values()) {
    if (!g.reasons.some((r) => TRIGGERS.has(r.code))) continue
    const s = g.companyId ? signalsByCompany.get(g.companyId) : undefined
    if (s?.problemConfirmed) g.reasons.push(reason('need_confirmed', 'Bedarf bestätigt', 'der Bedarf wurde im Discovery-Gespräch bestätigt'))
    if (s?.evidencePoints != null && s.evidencePoints >= STRONG_EVIDENCE) {
      g.reasons.push(reason('strong_evidence', `Evidence Score ${s.evidencePoints}/${EVIDENCE_MAX}`, `der Evidence Score liegt bei ${s.evidencePoints}/${EVIDENCE_MAX}`))
    }
    if (s?.priceOk) g.reasons.push(reason('price_ok', 'Preisrahmen akzeptiert', 'der Preisrahmen wurde grundsätzlich akzeptiert'))
    g.evidencePoints = s?.evidencePoints ?? null

    const reasons = dedupe(g.reasons).sort((a, b) => b.weight - a.weight)
    const score = reasons.reduce((sum, r) => sum + r.weight, 0)
    items.push({
      key: g.key,
      companyId: g.companyId,
      title: g.title,
      actions: [...new Set(g.actions.sort((a, b) => b.weight - a.weight).map((a) => a.text))],
      reasons,
      score,
      high: score >= HIGH_PRIORITY,
      evidencePoints: g.evidencePoints,
      href: g.companyId ? `/unternehmen/${g.companyId}` : (g.taskHref ?? '/aufgaben'),
      prepareHref: g.companyId ? `/unternehmen/${g.companyId}/vorbereitung` : null,
    })
  }
  return items.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'de'))
}

/** Same code and same label count once (e.g. two opportunities in "Angebot"). */
function dedupe(reasons: PriorityReason[]) {
  const seen = new Set<string>()
  return reasons.filter((r) => {
    const k = `${r.code}|${r.clause}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** "a", "a und b", "a, b und c" */
export function joinGerman(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} und ${parts.at(-1)}`
}

const NUMBER_WORDS = ['keine', 'eine', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf']
export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n)
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function explain(item: Pick<PriorityItem, 'reasons'>): string {
  return `${cap(joinGerman(item.reasons.slice(0, 3).map((r) => r.clause)))}.`
}

export function greeting(hour: number, firstName: string | null): string {
  const base = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend'
  return firstName ? `${base}, ${firstName}.` : `${base}.`
}

// ---------------------------------------------------------------------------
// Validation (spec 16)

export interface ValidationInterview {
  companyId: string
  signals: Record<ValidationSignal, 'yes' | 'no' | 'unclear'>
  mainPain: string | null
  recoveryUseCase: string | null
  objections: string[]
  externalizationConcerns: string[]
  desiredKpis: string[]
}

export const VALIDATION_SIGNALS = [
  'signal_problem_confirmed',
  'signal_regular_backlog',
  'signal_capacity_cause',
  'signal_external_ok',
  'signal_price_ok',
  'signal_pilot_interest',
] as const
export type ValidationSignal = (typeof VALIDATION_SIGNALS)[number]

export interface CountRow {
  label: string
  count: number
}

export interface ValidationStats {
  interviews: number
  companies: number
  signals: { key: ValidationSignal; label: string; yes: number; no: number; unclear: number }[]
  proposed: number
  won: number
  topPains: CountRow[]
  topUseCases: CountRow[]
  topObjections: CountRow[]
  topConcerns: CountRow[]
  topKpis: CountRow[]
}

/** Below this many completed interviews the numbers are flagged as a small sample. */
export const SMALL_SAMPLE = 5

export function computeValidation(interviews: ValidationInterview[], outcomes: { proposed: Set<string>; won: Set<string> }): ValidationStats {
  const companies = new Set(interviews.map((i) => i.companyId))
  return {
    interviews: interviews.length,
    companies: companies.size,
    signals: VALIDATION_SIGNALS.map((key) => ({
      key,
      label: de.signalName[key],
      yes: interviews.filter((i) => i.signals[key] === 'yes').length,
      no: interviews.filter((i) => i.signals[key] === 'no').length,
      unclear: interviews.filter((i) => i.signals[key] === 'unclear').length,
    })),
    proposed: [...companies].filter((c) => outcomes.proposed.has(c)).length,
    won: [...companies].filter((c) => outcomes.won.has(c)).length,
    topPains: topValues(interviews.map((i) => i.mainPain)),
    topUseCases: topValues(interviews.map((i) => i.recoveryUseCase)),
    topObjections: topValues(interviews.flatMap((i) => i.objections)),
    topConcerns: topValues(interviews.flatMap((i) => i.externalizationConcerns)),
    topKpis: topValues(interviews.flatMap((i) => i.desiredKpis)),
  }
}

/** Counts free-text values case-insensitively; shows the most frequent spelling. */
export function topValues(values: (string | null | undefined)[], limit = 5): CountRow[] {
  const buckets = new Map<string, Map<string, number>>()
  for (const raw of values) {
    const v = raw?.trim().replace(/\s+/g, ' ')
    if (!v) continue
    const key = v.toLocaleLowerCase('de-DE')
    const spellings = buckets.get(key) ?? new Map<string, number>()
    spellings.set(v, (spellings.get(v) ?? 0) + 1)
    buckets.set(key, spellings)
  }
  return [...buckets.values()]
    .map((spellings) => {
      // Stable sort: on a tie the spelling seen first wins.
      const [label] = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0]!
      return { label, count: [...spellings.values()].reduce((a, b) => a + b, 0) }
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'de'))
    .slice(0, limit)
}

/** "7 Gespräche, 6 × Problem bestätigt, …" – only signals with at least one "Ja". */
export function validationSentence(v: ValidationStats): string {
  if (v.interviews === 0) return NO_DATA
  const parts = [`${v.interviews} ${v.interviews === 1 ? 'abgeschlossenes Gespräch' : 'abgeschlossene Gespräche'}`]
  for (const s of v.signals) if (s.yes > 0) parts.push(`${s.yes} × ${s.label}`)
  if (v.proposed > 0) parts.push(`${v.proposed} × Pilotangebot`)
  if (v.won > 0) parts.push(`${v.won} × gewonnen`)
  return `${joinGerman(parts)}.`
}

// ---------------------------------------------------------------------------
// Briefing text

export interface BriefingCounts {
  tasksToday: number
  tasksOverdue: number
  followupsToday: number
  followupsOverdue: number
}

export function countDue(input: Pick<BriefingInput, 'today' | 'tasks' | 'opportunities'>): BriefingCounts {
  const { today } = input
  return {
    tasksToday: input.tasks.filter((t) => t.dueDate === today).length,
    tasksOverdue: input.tasks.filter((t) => t.dueDate != null && t.dueDate < today).length,
    followupsToday: input.opportunities.filter((o) => o.nextStepDate === today).length,
    followupsOverdue: input.opportunities.filter((o) => o.nextStepDate != null && o.nextStepDate < today).length,
  }
}

export interface ChangeSummary {
  since: Date
  byType: { type: keyof typeof de.activityType; count: number }[]
}

export interface BriefingLine {
  kind: 'headline' | 'load' | 'recommendation' | 'gap' | 'validation' | 'changes'
  text: string
  href?: string
}

const plural = (n: number, one: string, many: string) => `${n === 1 ? 'eine' : numberWord(n)} ${n === 1 ? one : many}`

export function briefingLines(args: {
  items: PriorityItem[]
  counts: BriefingCounts
  validation: ValidationStats
  changes: ChangeSummary | null
  formatSince: (d: Date) => string
}): BriefingLine[] {
  const { items, counts, validation, changes } = args
  const lines: BriefingLine[] = []
  const high = items.filter((i) => i.high).length

  if (items.length === 0) {
    lines.push({ kind: 'headline', text: 'Heute stehen keine fälligen Aktionen an.' })
  } else {
    let text = items.length === 1 ? 'Heute steht eine relevante Aktion an.' : `Heute stehen ${numberWord(items.length)} relevante Aktionen an.`
    if (high === 1) text += items.length === 1 ? ' Sie hat hohe Priorität.' : ' Eine davon hat hohe Priorität.'
    else if (high > 1) text += ` ${cap(numberWord(high))} davon haben hohe Priorität.`
    lines.push({ kind: 'headline', text })
  }

  const load: string[] = []
  const tasksDue = counts.tasksToday
  const followDue = counts.followupsToday
  if (tasksDue || followDue) {
    const parts = [tasksDue ? plural(tasksDue, 'Aufgabe', 'Aufgaben') : null, followDue ? plural(followDue, 'Wiedervorlage', 'Wiedervorlagen') : null].filter(Boolean) as string[]
    load.push(`Du hast heute ${joinGerman(parts)}.`)
  }
  const overdue = counts.tasksOverdue + counts.followupsOverdue
  if (overdue) load.push(overdue === 1 ? 'Ein Punkt ist überfällig.' : `${cap(numberWord(overdue))} Punkte sind überfällig.`)
  if (load.length) lines.push({ kind: 'load', text: load.join(' ') })

  const top = items[0]
  if (top) {
    lines.push({ kind: 'recommendation', text: `Meine Empfehlung: Beginne mit ${top.title}. ${explain(top)}`, href: top.href })
  }

  for (const gap of items.filter((i) => i !== top && i.reasons.some((r) => r.code === 'discovery_without_next_step')).slice(0, 2)) {
    lines.push({ kind: 'gap', text: `Bei ${gap.title} fehlt seit dem Discovery-Gespräch ein konkreter nächster Schritt.`, href: gap.href })
  }

  lines.push({ kind: 'validation', text: `Aktuelle Validierung: ${validationSentence(validation)}`, href: '/discovery/validierung' })

  if (changes && changes.byType.length) {
    const total = changes.byType.reduce((s, c) => s + c.count, 0)
    const detail = changes.byType.map((c) => `${c.count} × ${de.activityType[c.type]}`).join(', ')
    lines.push({
      kind: 'changes',
      text: `Seit deinem letzten Besuch (${args.formatSince(changes.since)}): ${total === 1 ? 'ein neuer Eintrag' : `${total} neue Einträge`} im Verlauf (${detail}).`,
      href: '/aktivitaeten',
    })
  }
  return lines
}

// ---------------------------------------------------------------------------
// KPIs (spec 7)

export interface Kpis {
  targetCompanies: number
  qualifiedCompanies: number
  discoveriesCompleted: number
  discoveriesOpen: number
  needConfirmed: number
  pilotOpportunities: number
  openProposals: number
  openProposalsValueCents: number
  pipelineCount: number
  pipelineValueCents: number
  wonPilots: number
  wonWithoutOrder: number
  tasksDue: number
  tasksOverdue: number
}
