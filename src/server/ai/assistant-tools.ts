import 'server-only'
import { z } from 'zod'
import type { RequestContext } from '@/server/db/context'
import { PIPELINE_STAGE_KEYS, type PipelineStageKey } from '@/domain/schemas'
import { explain, NO_DATA, STRONG_EVIDENCE } from '@/domain/briefing'
import type { NewProposalAction } from '@/domain/ai'
import { berlinDay, formatDay, formatDateTime, formatMoney } from '@/lib/format'
import { de } from '@/i18n/de'
import { globalSearch } from '@/server/services/search'
import { getCompany360 } from '@/server/services/companies'
import { getContact } from '@/server/services/contacts'
import { getBoard } from '@/server/services/opportunities'
import { listTasks } from '@/server/services/tasks'
import { getPreparation, getPriorities, getValidation } from '@/server/services/overview'
import type { ToolDefinition } from './provider'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('JJJJ-MM-TT')

/**
 * Read tools run with the user's RLS context, so the assistant never sees more
 * than the user. Write tools never write: they only collect proposed actions
 * that the user confirms afterwards (Level 2, spec 20).
 */
export const ASSISTANT_TOOLS = {
  heute_priorisiert: {
    description: 'Priorisierte Aktionen für heute mit nachvollziehbaren Gründen (fällige Aufgaben, Wiedervorlagen, fehlende nächste Schritte).',
    schema: z.object({}),
  },
  suche: {
    description: 'Sucht Unternehmen, Kontakte und offene Aufgaben nach Namen. Liefert IDs für weitere Abfragen.',
    schema: z.object({ begriff: z.string().min(2).max(100) }),
  },
  unternehmen_kontext: {
    description: 'Alles zu einem Unternehmen: Fakten, Hypothesen, Kontakte, Chancen, Aufgaben, letzte Aktivitäten, letztes Discovery-Gespräch.',
    schema: z.object({ unternehmenId: z.uuid() }),
  },
  kontakt_verlauf: {
    description: 'Verlauf und offene Aufgaben eines Kontakts („Was habe ich zuletzt mit Herrn Müller besprochen?“).',
    schema: z.object({ kontaktId: z.uuid() }),
  },
  pipeline: {
    description: 'Chancen der Vertriebspipeline mit Phase, Wert, nächstem Schritt und Evidence Score. Optional nach Phase gefiltert.',
    schema: z.object({ phase: z.enum(PIPELINE_STAGE_KEYS).nullable() }),
  },
  unternehmen_filtern: {
    description: 'Unternehmen nach Discovery-Daten filtern, z. B. bestätigter Bedarf ohne nächsten Schritt oder Evidence Score über einem Wert.',
    schema: z.object({
      bedarfBestaetigt: z.boolean().nullable(),
      ohneNaechstenSchritt: z.boolean().nullable(),
      evidenceMindestens: z.number().int().min(0).max(20).nullable(),
    }),
  },
  aufgaben: {
    description: 'Offene Aufgaben, optional nur bis zu einem Datum fällig.',
    schema: z.object({ faelligBis: day.nullable() }),
  },
  validierung: {
    description: 'Validierungsstand aus abgeschlossenen Discovery-Gesprächen: Signale, häufigste Pains, Einwände, Use Cases, gewünschte Kennzahlen.',
    schema: z.object({}),
  },
  aufgabe_vorschlagen: {
    description: 'Schlägt eine neue Aufgabe vor. Wird erst nach Bestätigung durch den Nutzer angelegt.',
    schema: z.object({ titel: z.string().min(1).max(300), faellig: day.nullable(), unternehmenId: z.uuid().nullable(), kontext: z.string().max(1000).nullable() }),
  },
  notiz_vorschlagen: {
    description: 'Schlägt eine Notiz im Verlauf eines Unternehmens vor. Wird erst nach Bestätigung gespeichert.',
    schema: z.object({ unternehmenId: z.uuid(), text: z.string().min(1).max(5000) }),
  },
  phase_vorschlagen: {
    description: 'Schlägt vor, eine Chance in eine andere Phase zu verschieben. Für „lost“ ist ein Grund nötig. Wird erst nach Bestätigung ausgeführt.',
    schema: z.object({ chanceId: z.uuid(), phase: z.enum(PIPELINE_STAGE_KEYS), grund: z.string().max(1000).nullable() }),
  },
} satisfies Record<string, Omit<ToolDefinition, 'name'>>

export type ToolName = keyof typeof ASSISTANT_TOOLS
export const WRITE_TOOLS = new Set<ToolName>(['aufgabe_vorschlagen', 'notiz_vorschlagen', 'phase_vorschlagen'])

export const TOOL_SOURCE: Record<ToolName, string> = {
  heute_priorisiert: 'Priorisierung',
  suche: 'Suche',
  unternehmen_kontext: 'Unternehmensdaten',
  kontakt_verlauf: 'Kontaktverlauf',
  pipeline: 'Vertriebspipeline',
  unternehmen_filtern: 'Discovery-Daten',
  aufgaben: 'Aufgaben',
  validierung: 'Validierung',
  aufgabe_vorschlagen: 'Vorschlag',
  notiz_vorschlagen: 'Vorschlag',
  phase_vorschlagen: 'Vorschlag',
}

/** With AI level 1 the assistant only reads; proposal tools are not offered at all. */
export function toolDefinitions(canPropose = true): ToolDefinition[] {
  return Object.entries(ASSISTANT_TOOLS)
    .filter(([name]) => canPropose || !WRITE_TOOLS.has(name as ToolName))
    .map(([name, t]) => ({ name, ...t }))
}

const d = (iso: string | null) => (iso ? formatDay(iso) : null)

type ReadResult = unknown
export type ToolOutcome = { kind: 'read'; result: ReadResult } | { kind: 'proposal'; action: NewProposalAction; confirmation: string } | { kind: 'error'; message: string }

export async function runTool(ctx: RequestContext, name: string, rawInput: unknown, canPropose = true): Promise<ToolOutcome> {
  if (!(name in ASSISTANT_TOOLS)) return { kind: 'error', message: `Unbekanntes Werkzeug ${name}.` }
  const tool = name as ToolName
  if (!canPropose && WRITE_TOOLS.has(tool)) return { kind: 'error', message: 'Änderungsvorschläge sind in den Einstellungen ausgeschaltet (AI-Stufe 1).' }
  const parsed = ASSISTANT_TOOLS[tool].schema.safeParse(rawInput)
  if (!parsed.success) return { kind: 'error', message: `Ungültige Eingabe: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}` }
  const input = parsed.data as Record<string, unknown>
  const today = berlinDay()

  switch (tool) {
    case 'heute_priorisiert': {
      const p = await getPriorities(ctx)
      if (!p.items.length) return { kind: 'read', result: { heute: d(today), hinweis: 'Heute ist nichts fällig.' } }
      return {
        kind: 'read',
        result: {
          heute: d(today),
          aufgabenHeute: p.counts.tasksToday,
          aufgabenUeberfaellig: p.counts.tasksOverdue,
          wiedervorlagenHeute: p.counts.followupsToday,
          wiedervorlagenUeberfaellig: p.counts.followupsOverdue,
          prioritaeten: p.items.slice(0, 10).map((i) => ({
            titel: i.title,
            unternehmenId: i.companyId,
            hohePrioritaet: i.high,
            punkte: i.score,
            aktionen: i.actions,
            begruendung: explain(i),
          })),
        },
      }
    }
    case 'suche': {
      const hits = await globalSearch(ctx, input.begriff as string, 8)
      return { kind: 'read', result: hits.length ? hits.map((h) => ({ art: h.kind, id: h.id, name: h.title, info: h.subtitle })) : { hinweis: 'Keine Treffer.' } }
    }
    case 'unternehmen_kontext': {
      const id = input.unternehmenId as string
      const [c, prep] = await Promise.all([getCompany360(ctx, id), getPreparation(ctx, id)])
      if (!c) return { kind: 'error', message: 'Unternehmen nicht gefunden.' }
      const x = prep.latestDiscovery
      return {
        kind: 'read',
        result: {
          name: c.company.name,
          status: de.companyStatus[c.company.status],
          branche: c.company.industry,
          ort: c.company.city,
          mitarbeiter: c.company.employeeCount,
          recoveryUseCase: c.company.recoveryUseCase,
          letzterKontakt: c.lastContactAt ? formatDateTime(c.lastContactAt) : null,
          fakten: c.insights.filter((i) => i.kind === 'fact').map((i) => i.statement),
          hypothesen: c.insights.filter((i) => i.kind === 'hypothesis').map((i) => ({ aussage: i.statement, status: i.hypothesisStatus })),
          kundenaussagen: c.insights.filter((i) => i.kind === 'customer_quote').map((i) => i.statement),
          kontakte: c.contacts.map((k) => ({ id: k.id, name: `${k.firstName} ${k.lastName}`.trim(), funktion: k.jobTitle, rolle: de.decisionRole[k.decisionRole] })),
          chancen: c.opportunities.map((o) => ({
            id: o.opportunity.id,
            titel: o.opportunity.title,
            phase: o.stageName,
            wert: o.opportunity.valueCents != null ? formatMoney(o.opportunity.valueCents) : null,
            naechsterSchritt: o.opportunity.nextStep,
            datum: d(o.opportunity.nextStepDate),
          })),
          offeneAufgaben: c.openTasks.map((t) => ({ titel: t.title, faellig: d(t.dueDate) })),
          letzteAktivitaeten: c.activities.slice(0, 8).map((a) => ({ wann: formatDateTime(a.occurredAt), art: de.activityType[a.type], titel: a.title, text: a.body?.slice(0, 400) ?? null })),
          letztesDiscovery: x
            ? { abgeschlossen: x.completedAt ? formatDateTime(x.completedAt) : null, zusammenfassung: x.summary, hauptschmerz: x.mainPain, kernfrage: x.coreQuestionAnswer, einwaende: x.objections, evidence: x.rated ? `${x.points}/20 (${x.rated} von 10 bewertet)` : null }
            : null,
          prioritaet: prep.priority ? explain(prep.priority) : null,
        },
      }
    }
    case 'kontakt_verlauf': {
      const c = await getContact(ctx, input.kontaktId as string)
      if (!c) return { kind: 'error', message: 'Kontakt nicht gefunden.' }
      return {
        kind: 'read',
        result: {
          name: `${c.contact.firstName} ${c.contact.lastName}`.trim(),
          unternehmen: c.companyName,
          offeneAufgaben: c.openTasks.map((t) => ({ titel: t.title, faellig: d(t.dueDate) })),
          verlauf: c.timeline.length ? c.timeline.slice(0, 10).map((a) => ({ wann: formatDateTime(a.occurredAt), art: de.activityType[a.type], titel: a.title, text: a.body?.slice(0, 500) ?? null })) : NO_DATA,
        },
      }
    }
    case 'pipeline': {
      const board = await getBoard(ctx)
      const phase = input.phase as PipelineStageKey | null
      const stages = new Map(board.stages.map((s) => [s.id, s]))
      const cards = board.cards.filter((c) => !phase || stages.get(c.stageId)?.key === phase)
      return {
        kind: 'read',
        result: cards.length
          ? cards.slice(0, 40).map((c) => ({
              id: c.id,
              titel: c.title,
              unternehmen: c.companyName,
              unternehmenId: c.companyId,
              phase: stages.get(c.stageId)?.name,
              phaseKey: stages.get(c.stageId)?.key,
              wert: c.valueCents != null ? formatMoney(c.valueCents) : null,
              naechsterSchritt: c.nextStep,
              datum: d(c.nextStepDate),
              evidence: c.evidence ? `${c.evidence.points}/20` : null,
              auftragDokumentiert: c.orderConfirmedAt != null,
            }))
          : { hinweis: 'Keine Chancen in dieser Auswahl.' },
      }
    }
    case 'unternehmen_filtern': {
      const { input: data } = await getPriorities(ctx)
      const planned = new Set([...data.tasks.flatMap((t) => (t.companyId ? [t.companyId] : [])), ...data.opportunities.filter((o) => o.nextStep || o.nextStepDate).map((o) => o.companyId)])
      const minEv = input.evidenceMindestens as number | null
      const rows = data.signals.filter(
        (s) =>
          (input.bedarfBestaetigt == null || s.problemConfirmed === input.bedarfBestaetigt) &&
          (input.ohneNaechstenSchritt == null || !planned.has(s.companyId) === input.ohneNaechstenSchritt) &&
          (minEv == null || (s.evidencePoints ?? -1) >= minEv),
      )
      return {
        kind: 'read',
        result: {
          grundlage: `Unternehmen mit abgeschlossenem Discovery-Gespräch (${data.signals.length})`,
          treffer: rows.map((s) => ({ unternehmen: s.companyName, unternehmenId: s.companyId, bedarfBestaetigt: s.problemConfirmed, evidence: s.evidencePoints, starkeEvidenz: (s.evidencePoints ?? 0) >= STRONG_EVIDENCE, naechsterSchrittGeplant: planned.has(s.companyId) })),
        },
      }
    }
    case 'aufgaben': {
      const until = input.faelligBis as string | null
      const rows = (await listTasks(ctx, { status: 'open', limit: 100 })).filter((t) => !until || (t.task.dueDate != null && t.task.dueDate <= until))
      return {
        kind: 'read',
        result: rows.length
          ? rows.slice(0, 40).map((t) => ({ titel: t.task.title, faellig: d(t.task.dueDate), ueberfaellig: t.task.dueDate != null && t.task.dueDate < today, prioritaet: de.taskPriority[t.task.priority], unternehmen: t.companyName, kontext: t.task.context }))
          : { hinweis: 'Keine offenen Aufgaben in diesem Zeitraum.' },
      }
    }
    case 'validierung': {
      const v = await getValidation(ctx)
      if (!v.interviews) return { kind: 'read', result: { hinweis: NO_DATA } }
      return {
        kind: 'read',
        result: {
          abgeschlosseneGespraeche: v.interviews,
          unternehmen: v.companies,
          signale: v.signals.map((s) => ({ signal: s.label, ja: s.yes, nein: s.no, unklar: s.unclear })),
          pilotangebot: v.proposed,
          gewonnen: v.won,
          haeufigstePains: v.topPains,
          haeufigsteUseCases: v.topUseCases,
          haeufigsteEinwaende: v.topObjections,
          gruendeGegenExterne: v.topConcerns,
          gewuenschteKennzahlen: v.topKpis,
          hinweis: v.interviews < 5 ? 'Kleine Stichprobe, nur Tendenzen.' : null,
        },
      }
    }
    case 'aufgabe_vorschlagen': {
      const companyId = input.unternehmenId as string | null
      const company = companyId ? await getCompany360(ctx, companyId) : null
      if (companyId && !company) return { kind: 'error', message: 'Unternehmen nicht gefunden.' }
      const due = input.faellig as string | null
      return {
        kind: 'proposal',
        action: {
          type: 'task.create',
          certainty: 'sicher',
          quote: null,
          quoteVerified: null,
          title: input.titel as string,
          dueDate: due && due >= today ? due : null,
          context: (input.kontext as string | null) ?? null,
          companyId,
          companyName: company?.company.name ?? null,
        },
        confirmation: 'Aufgabe als Vorschlag vorgemerkt; der Nutzer bestätigt sie.',
      }
    }
    case 'notiz_vorschlagen': {
      const company = await getCompany360(ctx, input.unternehmenId as string)
      if (!company) return { kind: 'error', message: 'Unternehmen nicht gefunden.' }
      return {
        kind: 'proposal',
        action: { type: 'activity.note', certainty: 'sicher', quote: null, quoteVerified: null, companyId: company.company.id, companyName: company.company.name, body: input.text as string },
        confirmation: 'Notiz als Vorschlag vorgemerkt; der Nutzer bestätigt sie.',
      }
    }
    case 'phase_vorschlagen': {
      const board = await getBoard(ctx)
      const card = board.cards.find((c) => c.id === input.chanceId)
      if (!card) return { kind: 'error', message: 'Chance nicht gefunden.' }
      const stages = new Map(board.stages.map((s) => [s.id, s.key]))
      const from = stages.get(card.stageId)!
      const to = input.phase as PipelineStageKey
      if (from === to) return { kind: 'error', message: 'Die Chance steht bereits in dieser Phase.' }
      if (to === 'lost' && !input.grund) return { kind: 'error', message: 'Für „Verloren“ wird ein Grund benötigt. Frage den Nutzer danach.' }
      const missingOrder = to === 'won' && !card.orderConfirmedAt
      return {
        kind: 'proposal',
        action: {
          type: 'opportunity.stage',
          certainty: 'sicher',
          quote: null,
          quoteVerified: null,
          opportunityId: card.id,
          opportunityTitle: card.title,
          companyName: card.companyName,
          from,
          to,
          orderConfirmedAt: card.orderConfirmedAt,
          wonWithoutOrder: false,
          lostReason: to === 'lost' ? ((input.grund as string | null) ?? null) : null,
        },
        confirmation: missingOrder
          ? `Vorschlag vorgemerkt. Wichtig: Für „${card.title}“ ist keine bestätigte Beauftragung dokumentiert; weise den Nutzer darauf hin. Er kann ein Auftragsdatum angeben oder trotzdem als gewonnen markieren.`
          : 'Phasenwechsel als Vorschlag vorgemerkt; der Nutzer bestätigt ihn.',
      }
    }
  }
}
