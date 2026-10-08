import 'server-only'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { aiActionProposals, discoveryInterviews, discoveryQuestions, evidenceScores, opportunities, pipelineStages } from '@/server/db/schema'
import { emitEvent, withUserTx, type RequestContext, type Tx } from '@/server/db/context'
import { DomainError } from '@/server/action'
import { de } from '@/i18n/de'
import { berlinDay } from '@/lib/format'
import {
  buildActions,
  extractionSchema,
  mergeAccepted,
  proposalActions,
  type CatalogQuestion,
  type ProposalAction,
  type ProposalDecision,
} from '@/domain/ai'
import { SIGNALS, type AnswerType } from '@/domain/discovery'
import { getProvider } from '@/server/ai/provider'
import { EXTRACTION_SYSTEM, extractionInput } from '@/server/ai/prompts'
import { insightInput, taskInput, opportunityInput, opportunityMove } from '@/domain/schemas'
import { recordActivity } from './activities'
import { saveAnswer, setSignal, updateDiscoveryNotes } from './discovery'
import { createInsight } from './insights'
import { createTask } from './tasks'
import { createOpportunity, moveOpportunity } from './opportunities'

export interface ProposalMeta {
  dropped: string[]
  sourceChars: number
}

/** Text the AI works on: what the user wrote or dictated, never anything else. */
export function discoverySourceText(d: { rawNotes: string | null; transcript: string | null; coreQuestionAnswer: string | null; summary: string | null }) {
  return [
    d.coreQuestionAnswer && `Antwort auf die Kernfrage: ${d.coreQuestionAnswer}`,
    d.rawNotes,
    d.transcript && `Diktat:\n${d.transcript}`,
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

export const MIN_SOURCE_CHARS = 40

/**
 * "Gespräch analysieren": sends the user's notes to the model, verifies the
 * result and stores it as a pending proposal. Nothing in the discovery changes.
 */
export async function analyzeDiscovery(ctx: RequestContext, discoveryId: string, aiLevel: number) {
  const prep = await withUserTx(ctx, async (tx) => {
    const [d] = await tx
      .select({ interview: discoveryInterviews, companyName: sql<string>`(select name from companies c where c.id = ${discoveryInterviews.companyId})` })
      .from(discoveryInterviews)
      .where(and(eq(discoveryInterviews.id, discoveryId), eq(discoveryInterviews.organizationId, ctx.organizationId)))
    if (!d) throw new DomainError('not_found', de.errors.notFound)
    const questions = await tx
      .select({ key: discoveryQuestions.key, prompt: discoveryQuestions.prompt, answerType: discoveryQuestions.answerType, options: discoveryQuestions.options })
      .from(discoveryQuestions)
      .where(and(eq(discoveryQuestions.organizationId, ctx.organizationId), eq(discoveryQuestions.isActive, true)))
      .orderBy(asc(discoveryQuestions.position))
    const [contact] = d.interview.contactId
      ? await tx.execute<{ name: string }>(sql`select trim(first_name || ' ' || last_name) as name from contacts where id = ${d.interview.contactId}`)
      : []
    const [openOpp] = await tx
      .select({ id: opportunities.id, title: opportunities.title })
      .from(opportunities)
      .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
      .where(and(eq(opportunities.companyId, d.interview.companyId), eq(pipelineStages.outcome, 'open')))
      .orderBy(desc(opportunities.updatedAt))
      .limit(1)
    return { d, questions: questions as CatalogQuestion[], contactName: contact?.name ?? null, openOpp: openOpp ?? null }
  })

  const source = discoverySourceText(prep.d.interview)
  if (source.length < MIN_SOURCE_CHARS) {
    throw new DomainError('validation', 'Für eine Auswertung fehlen Notizen. Schreibe oder diktiere zuerst, was im Gespräch gesagt wurde.')
  }
  const today = berlinDay()
  const provider = await getProvider(aiLevel)
  const { data, model } = await provider.generateStructured({
    task: 'discovery_extraction',
    name: 'gespraechsauswertung',
    system: EXTRACTION_SYSTEM,
    schema: extractionSchema,
    input: extractionInput({ today, companyName: prep.d.companyName, contactName: prep.contactName, catalog: prep.questions, notes: source }),
  })
  const { actions, dropped } = buildActions(data, { sourceText: source, catalog: prep.questions.map((q) => ({ ...q, answerType: q.answerType as AnswerType })), today, openOpportunity: prep.openOpp })

  return withUserTx(ctx, async (tx) => {
    // Only one open proposal per discovery: a new analysis replaces the previous one.
    await tx
      .update(aiActionProposals)
      .set({ status: 'rejected', error: 'Durch eine neue Auswertung ersetzt.', decidedAt: new Date(), decidedBy: ctx.userId })
      .where(and(eq(aiActionProposals.discoveryId, discoveryId), eq(aiActionProposals.status, 'pending')))
    const [row] = await tx
      .insert(aiActionProposals)
      .values({
        organizationId: ctx.organizationId,
        source: 'discovery_extraction',
        summary: `Auswertung des Gesprächs mit ${prep.d.companyName}: ${actions.length} Vorschläge`,
        actions,
        decisions: { meta: { dropped, sourceChars: source.length } satisfies ProposalMeta },
        model,
        companyId: prep.d.interview.companyId,
        discoveryId,
        requestedBy: ctx.userId,
      })
      .returning({ id: aiActionProposals.id })
    await emitEvent(tx, ctx, 'AI_PROPOSAL_CREATED', { proposalId: row!.id, discoveryId, actions: actions.length }, { actor: 'ai', proposalId: row!.id })
    return row!.id
  })
}

export async function getProposal(ctx: RequestContext, id: string) {
  return withUserTx(ctx, async (tx) => {
    const [row] = await tx.select().from(aiActionProposals).where(and(eq(aiActionProposals.id, id), eq(aiActionProposals.organizationId, ctx.organizationId)))
    if (!row) return null
    const parsed = proposalActions.safeParse(row.actions)
    const meta = (row.decisions as { meta?: ProposalMeta }).meta ?? { dropped: [], sourceChars: 0 }
    // Current values, so the review screen can show what an action would replace.
    const [current] = row.discoveryId
      ? await tx
          .select({
            summary: discoveryInterviews.summary,
            mainPain: discoveryInterviews.mainPain,
            recoveryUseCase: discoveryInterviews.recoveryUseCase,
            coreQuestionAnswer: discoveryInterviews.coreQuestionAnswer,
          })
          .from(discoveryInterviews)
          .where(eq(discoveryInterviews.id, row.discoveryId))
      : []
    return { proposal: row, actions: parsed.success ? parsed.data : [], invalid: !parsed.success, meta, current: current ?? null }
  })
}

export type ProposalDetail = NonNullable<Awaited<ReturnType<typeof getProposal>>>

export async function latestPendingProposal(ctx: RequestContext, discoveryId: string) {
  return withUserTx(ctx, async (tx) => {
    const [row] = await tx
      .select({ id: aiActionProposals.id, createdAt: aiActionProposals.createdAt })
      .from(aiActionProposals)
      .where(and(eq(aiActionProposals.discoveryId, discoveryId), eq(aiActionProposals.status, 'pending')))
      .orderBy(desc(aiActionProposals.createdAt))
      .limit(1)
    return row ?? null
  })
}

const LABEL: Record<ProposalAction['type'], string> = {
  'discovery.field': 'Discovery aktualisiert',
  'discovery.list_add': 'Eintrag ergänzt',
  'discovery.answer': 'Antwort gespeichert',
  'discovery.signal': 'Signal gesetzt',
  'evidence.score': 'Evidence Score bewertet',
  'insight.create': 'Erkenntnis gespeichert',
  'task.create': 'Aufgabe erstellt',
  'activity.note': 'Notiz gespeichert',
  'opportunity.stage': 'Phase geändert',
  'opportunity.create': 'Chance angelegt',
  'opportunity.next_step': 'Nächster Schritt aktualisiert',
}

type Discovery = typeof discoveryInterviews.$inferSelect

async function execute(tx: Tx, ctx: RequestContext, proposalId: string, discovery: Discovery | null, a: ProposalAction) {
  const opts = { actor: 'ai' as const, proposalId }
  const uncertain = a.certainty === 'unsicher'
  // Assistant proposals have no discovery; only the actions below that need one read it.
  const needsDiscovery = () => {
    if (!discovery) throw new DomainError('validation', 'Dieser Vorschlag gehört zu keinem Gespräch.')
    return discovery
  }
  if (!discovery) {
    switch (a.type) {
      case 'task.create':
        return createTask(tx, ctx, taskInput.parse({ title: a.title, dueDate: a.dueDate, context: a.context, companyId: a.companyId ?? null }), opts)
      case 'activity.note':
        return recordActivity(tx, ctx, { type: 'note', title: 'Notiz', body: a.body, companyId: a.companyId }, opts)
      case 'opportunity.stage':
        return moveOpportunity(
          tx,
          ctx,
          opportunityMove.parse({ id: a.opportunityId, stageKey: a.to, orderConfirmedAt: a.orderConfirmedAt, wonWithoutOrder: a.wonWithoutOrder, lostReason: a.lostReason }),
          opts,
        )
    }
  }
  const d = needsDiscovery()
  switch (a.type) {
    case 'activity.note':
    case 'opportunity.stage':
      throw new DomainError('validation', 'Diese Änderung gehört nicht zu einem Gespräch.')
    case 'discovery.field':
      return updateDiscoveryNotes(tx, d.id, { [a.field]: a.value })
    case 'discovery.list_add': {
      const [cur] = await tx.select({ list: discoveryInterviews[a.field] }).from(discoveryInterviews).where(eq(discoveryInterviews.id, d.id))
      const list = cur?.list ?? []
      if (list.some((v) => v.toLocaleLowerCase('de-DE') === a.value.toLocaleLowerCase('de-DE'))) return
      return updateDiscoveryNotes(tx, d.id, { [a.field]: [...list, a.value] })
    }
    case 'discovery.answer':
      return saveAnswer(tx, ctx, { discoveryId: d.id, questionKey: a.questionKey, value: a.value, verbatim: a.quote, isUncertain: uncertain }, opts)
    case 'discovery.signal':
      return setSignal(tx, { discoveryId: d.id, signal: a.signal, value: a.value })
    case 'evidence.score': {
      // Accepting on the review screen is the human confirmation (spec 15); the AI's own suggestion is kept alongside.
      const values = {
        points: a.points,
        suggestedPoints: a.points,
        suggestedBy: 'ai' as const,
        evidence: a.quote,
        rationale: a.rationale,
        confirmedBy: ctx.userId,
        confirmedAt: new Date(),
      }
      await tx
        .insert(evidenceScores)
        .values({ organizationId: ctx.organizationId, discoveryId: d.id, category: a.category, ...values })
        .onConflictDoUpdate({ target: [evidenceScores.discoveryId, evidenceScores.category], set: values })
      return
    }
    case 'insight.create':
      return createInsight(
        tx,
        ctx,
        insightInput.parse({ companyId: d.companyId, discoveryId: d.id, kind: a.kind, statement: a.statement, source: 'ai', sourceDetail: a.quote?.slice(0, 500) ?? null, isUncertain: uncertain }),
        opts,
      )
    case 'task.create':
      return createTask(
        tx,
        ctx,
        taskInput.parse({ title: a.title, dueDate: a.dueDate, context: a.context, companyId: d.companyId, contactId: d.contactId, discoveryId: d.id, opportunityId: d.opportunityId }),
        opts,
      )
    case 'opportunity.create': {
      const opp = await createOpportunity(
        tx,
        ctx,
        opportunityInput.parse({
          companyId: d.companyId,
          title: a.title,
          stageKey: d.signalProblemConfirmed === 'yes' ? 'need_confirmed' : 'discovery_done',
          primaryContactId: d.contactId,
          valueCents: a.valueCents,
          nextStep: a.nextStep,
          nextStepDate: a.nextStepDate,
        }),
        opts,
      )
      await tx.update(discoveryInterviews).set({ opportunityId: opp.id }).where(eq(discoveryInterviews.id, d.id))
      return
    }
    case 'opportunity.next_step': {
      const [row] = await tx
        .update(opportunities)
        .set({ nextStep: a.nextStep, nextStepDate: a.nextStepDate })
        .where(and(eq(opportunities.id, a.opportunityId), eq(opportunities.companyId, d.companyId)))
        .returning({ id: opportunities.id })
      if (!row) throw new DomainError('not_found', 'Die Chance existiert nicht mehr.')
      return
    }
  }
}

/**
 * Applies the accepted actions in one transaction. Audit rows carry actor = ai
 * and the proposal id; the proposal records who confirmed it and when.
 */
export async function applyProposal(ctx: RequestContext, decision: ProposalDecision) {
  return withUserTx(
    ctx,
    async (tx) => {
      const [p] = await tx.select().from(aiActionProposals).where(and(eq(aiActionProposals.id, decision.proposalId), eq(aiActionProposals.organizationId, ctx.organizationId))).for('update')
      if (!p) throw new DomainError('not_found', de.errors.notFound)
      if (p.status !== 'pending') throw new DomainError('conflict', 'Dieser Vorschlag wurde bereits entschieden.')
      const stored = proposalActions.parse(p.actions)
      const byId = new Map(stored.map((a) => [a.id, a]))
      const accepted: ProposalAction[] = []
      for (const edited of decision.accepted) {
        const original = byId.get(edited.id)
        const merged = original && mergeAccepted(original, edited)
        if (!merged) throw new DomainError('validation', 'Ein Vorschlag wurde ungültig verändert. Bitte die Seite neu laden.')
        accepted.push(merged)
      }
      const [d] = p.discoveryId ? await tx.select().from(discoveryInterviews).where(eq(discoveryInterviews.id, p.discoveryId)) : [null]
      if (p.discoveryId && !d) throw new DomainError('not_found', de.errors.notFound)
      if (d?.status === 'completed' && accepted.length) {
        throw new DomainError('conflict', 'Das Gespräch ist abgeschlossen. Zum Übernehmen zuerst „Bearbeiten“ wählen.')
      }
      // Answers and signals first, then everything that reads them (e.g. the opportunity's stage).
      const order: ProposalAction['type'][] = ['discovery.field', 'discovery.list_add', 'discovery.answer', 'discovery.signal', 'evidence.score', 'insight.create', 'task.create', 'activity.note', 'opportunity.stage', 'opportunity.next_step', 'opportunity.create']
      accepted.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
      let current = d ?? null
      for (const a of accepted) {
        await execute(tx, ctx, p.id, current, a)
        if (current && a.type === 'discovery.signal') current = { ...current, [SIGNALS.find((s) => s.key === a.signal)!.field]: a.value }
      }

      const status = accepted.length === 0 ? 'rejected' : accepted.length === stored.length ? 'applied' : 'partially_applied'
      const edits = accepted.filter((a) => JSON.stringify(a) !== JSON.stringify(byId.get(a.id))).map((a) => a.id)
      await tx
        .update(aiActionProposals)
        .set({
          status,
          decisions: { ...(p.decisions as object), accepted: accepted.map((a) => a.id), edited: edits, rejected: stored.filter((s) => !accepted.some((a) => a.id === s.id)).map((s) => s.id) },
          decidedBy: ctx.userId,
          decidedAt: new Date(),
        })
        .where(eq(aiActionProposals.id, p.id))

      if (accepted.length) {
        const counts = new Map<string, number>()
        for (const a of accepted) counts.set(LABEL[a.type], (counts.get(LABEL[a.type]) ?? 0) + 1)
        await recordActivity(
          tx,
          ctx,
          {
            type: 'ai_action',
            title: `AI-Vorschlag übernommen: ${accepted.length} von ${stored.length} Änderungen`,
            body: [...counts].map(([label, n]) => `✓ ${label}${n > 1 ? ` (${n})` : ''}`).join('\n') + '\nVorgeschlagen durch ReQover AI, bestätigt durch dich.',
            companyId: d?.companyId ?? p.companyId,
            contactId: d?.contactId ?? null,
            discoveryId: d?.id ?? null,
            metadata: { proposalId: p.id, accepted: accepted.length, total: stored.length, edited: edits.length, confirmedBy: ctx.userId },
          },
          { actor: 'ai', proposalId: p.id },
        )
      }
      await emitEvent(tx, ctx, accepted.length ? 'AI_PROPOSAL_APPLIED' : 'AI_PROPOSAL_REJECTED', { proposalId: p.id, discoveryId: d?.id ?? null, accepted: accepted.length, total: stored.length }, { actor: 'human', proposalId: p.id })
      return { status, accepted: accepted.length, total: stored.length, discoveryId: d?.id ?? null }
    },
    { actor: 'ai', proposalId: decision.proposalId },
  )
}

export async function rejectProposal(ctx: RequestContext, proposalId: string) {
  return applyProposal(ctx, { proposalId, accepted: [] })
}
