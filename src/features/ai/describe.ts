import type { ProposalAction } from '@/domain/ai'
import { de } from '@/i18n/de'
import { formatDay, formatMoney } from '@/lib/format'

export const GROUPS = [
  { key: 'conversation', title: 'Gespräch' },
  { key: 'answers', title: 'Antworten im Fragenkatalog' },
  { key: 'signals', title: 'Validierungssignale' },
  { key: 'evidence', title: 'Evidence Score' },
  { key: 'insights', title: 'Fakten und Interpretationen' },
  { key: 'next', title: 'Aufgaben und nächster Schritt' },
] as const
export type GroupKey = (typeof GROUPS)[number]['key']

const FIELD_LABEL = {
  summary: 'Zusammenfassung',
  mainPain: 'Hauptschmerz',
  recoveryUseCase: 'Recovery Use Case',
  coreQuestionAnswer: 'Antwort auf die Kernfrage',
  objections: 'Einwand',
  externalizationConcerns: 'Bedenken gegen externe Bearbeitung',
  desiredKpis: 'Gewünschte Kennzahl',
} as const

export function formatAnswer(value: unknown): string {
  if (value == null) return '–'
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nein'
  if (typeof value === 'number') return value.toLocaleString('de-DE')
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') {
    const { min, max } = value as { min: number | null; max: number | null }
    return min === max ? `${min ?? max}` : `${min ?? '?'}–${max ?? '?'}`
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDay(value)
  return String(value)
}

/** Group, label and display text of one proposed change, in German. */
export function describeAction(a: ProposalAction): { group: GroupKey; label: string; text: string } {
  switch (a.type) {
    case 'discovery.field':
      return { group: 'conversation', label: FIELD_LABEL[a.field], text: a.value }
    case 'discovery.list_add':
      return { group: 'conversation', label: FIELD_LABEL[a.field], text: a.value }
    case 'discovery.answer':
      return { group: 'answers', label: a.questionPrompt, text: formatAnswer(a.value) }
    case 'discovery.signal':
      return { group: 'signals', label: de.signalName[a.signal], text: de.signal[a.value] }
    case 'evidence.score':
      return { group: 'evidence', label: de.evidenceCategory[a.category], text: `${a.points}/2 · ${a.rationale}` }
    case 'insight.create':
      return { group: 'insights', label: a.kind === 'fact' ? 'Fakt' : a.kind === 'interpretation' ? 'Interpretation' : 'Kundenaussage', text: a.statement }
    case 'task.create':
      return { group: 'next', label: 'Aufgabe', text: [a.title, a.dueDate && `fällig ${formatDay(a.dueDate)}`].filter(Boolean).join(' · ') }
    case 'opportunity.create':
      return {
        group: 'next',
        label: 'Neue Chance',
        text: [a.title, a.valueCents != null && formatMoney(a.valueCents), a.nextStep && `Nächster Schritt: ${a.nextStep}`, a.nextStepDate && formatDay(a.nextStepDate)].filter(Boolean).join(' · '),
      }
    case 'opportunity.next_step':
      return { group: 'next', label: `Nächster Schritt für „${a.opportunityTitle}“`, text: [a.nextStep, a.nextStepDate && formatDay(a.nextStepDate)].filter(Boolean).join(' · ') }
  }
}
