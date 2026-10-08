import type { AuditTable } from '@/server/services/settings'
import { de } from '@/i18n/de'

export const TABLE_LABEL: Record<AuditTable, string> = {
  companies: 'Unternehmen',
  contacts: 'Kontakt',
  opportunities: 'Chance',
  discovery_interviews: 'Discovery-Gespräch',
  discovery_answers: 'Discovery-Antwort',
  evidence_scores: 'Evidence Score',
  insights: 'Erkenntnis',
  tasks: 'Aufgabe',
  activities: 'Aktivität',
  ai_action_proposals: 'AI-Vorschlag',
  organizations: 'Organisation',
  memberships: 'Mitglied',
  pipeline_stages: 'Pipeline-Phase',
}

export const ACTION_LABEL = { insert: 'angelegt', update: 'geändert', delete: 'gelöscht' } as const

const FIELD_LABEL: Record<string, string> = {
  name: 'Name',
  title: 'Titel',
  status: 'Status',
  stage_id: 'Phase',
  value_cents: 'Wert',
  next_step: 'Nächster Schritt',
  next_step_date: 'Datum nächster Schritt',
  due_date: 'Fällig',
  completed_at: 'Erledigt am',
  priority: 'Priorität',
  body: 'Inhalt',
  summary: 'Zusammenfassung',
  main_pain: 'Hauptschmerz',
  recovery_use_case: 'Recovery Use Case',
  core_question_answer: 'Antwort auf die Kernfrage',
  raw_notes: 'Notizen',
  points: 'Punkte',
  rationale: 'Begründung',
  statement: 'Aussage',
  kind: 'Art',
  first_name: 'Vorname',
  last_name: 'Nachname',
  email: 'E-Mail',
  phone: 'Telefon',
  job_title: 'Funktion',
  decision_role: 'Entscheidungsrolle',
  city: 'Ort',
  industry: 'Branche',
  website: 'Website',
  order_confirmed_at: 'Auftrag bestätigt am',
  won_without_order: 'Gewonnen ohne Auftrag',
  lost_reason: 'Verlustgrund',
  settings: 'Einstellungen',
  role: 'Rolle',
  decided_by: 'Entschieden von',
  requested_by: 'Angefragt von',
  assignee_id: 'Zuständig',
  decided_at: 'Entschieden am',
  is_demo: 'Demo',
  answer: 'Antwort',
  value: 'Wert',
  quote: 'Zitat',
  confirmed_by: 'Bestätigt von',
  suggested_by: 'Vorgeschlagen von',
}

export function fieldLabel(field: string) {
  return FIELD_LABEL[field] ?? field.replace(/_/g, ' ')
}

const ENUMS: Record<string, Record<string, Record<string, string>>> = {
  companies: { status: de.companyStatus },
  tasks: { status: de.taskStatus, priority: de.taskPriority },
  discovery_interviews: { status: de.discoveryStatus },
  ai_action_proposals: { status: de.proposalStatus },
  insights: { kind: de.insightKind, hypothesis_status: de.hypothesisStatus, source: de.insightSource },
  contacts: { decision_role: de.decisionRole, relationship_status: de.relationshipStatus },
  activities: { type: de.activityType },
  memberships: { role: de.membershipRole },
  evidence_scores: { category: de.evidenceCategory },
}

/** Short readable form of a stored value (German enum names, dates, cut long text). */
export function showValue(v: unknown, table?: string, field?: string): string {
  if (v == null || v === '') return '–'
  const named = typeof v === 'string' && table && field ? ENUMS[table]?.[field]?.[v] : undefined
  if (named) return named
  if (field === 'value_cents' && typeof v === 'number') return (v / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
  if (typeof v === 'boolean') return v ? 'Ja' : 'Nein'
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split('-').reverse().join('.')
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })
    return v.length > 160 ? `${v.slice(0, 160)}…` : v
  }
  const s = JSON.stringify(v)
  return s.length > 160 ? `${s.slice(0, 160)}…` : s
}
