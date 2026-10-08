import 'server-only'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { companies, contacts, discoveryAnswers, discoveryInterviews, discoveryQuestions, evidenceScores, insights, organizations } from '@/server/db/schema'
import { emitEvent, withUserTx, type RequestContext, type Tx, type TxOptions } from '@/server/db/context'
import type { DiscoveryAnswerInput, DiscoveryNotes, DiscoveryStart, EvidenceInput, SignalInput } from '@/domain/schemas'
import { EVIDENCE_CATEGORIES, SIGNALS, evidenceTotal, formatEvidence, isValidAnswer, type AnswerType, type EvidenceCategory } from '@/domain/discovery'
import { parseOrganizationSettings } from '@/domain/settings'
import { DomainError } from '@/server/action'
import { de } from '@/i18n/de'
import { recordActivity } from './activities'

export type DiscoveryStatus = (typeof discoveryInterviews.$inferSelect)['status']

/** A calendar day entered by the user, stored as a timestamp at Berlin midday. */
const dayToTimestamp = (day: string) => new Date(`${day}T12:00:00+02:00`)

async function loadInterview(tx: Tx, id: string) {
  const [row] = await tx.select().from(discoveryInterviews).where(eq(discoveryInterviews.id, id))
  if (!row) throw new DomainError('not_found', de.errors.notFound)
  return row
}

export async function startDiscovery(tx: Tx, ctx: RequestContext, input: DiscoveryStart, opts: TxOptions = {}) {
  const now = new Date()
  const live = input.mode === 'live'
  const [row] = await tx
    .insert(discoveryInterviews)
    .values({
      organizationId: ctx.organizationId,
      companyId: input.companyId,
      contactId: input.contactId ?? null,
      opportunityId: input.opportunityId ?? null,
      interviewerId: ctx.userId,
      createdBy: ctx.userId,
      status: live ? 'in_progress' : 'draft',
      startedAt: live ? now : null,
      conductedAt: live ? now : input.conductedOn ? dayToTimestamp(input.conductedOn) : now,
    })
    .returning()
  await emitEvent(tx, ctx, 'DISCOVERY_STARTED', { discoveryId: row!.id, companyId: row!.companyId, mode: input.mode }, opts)
  return row!
}

export async function listDiscoveries(ctx: RequestContext, opts: { companyId?: string; limit?: number } = {}) {
  return withUserTx(ctx, async (tx) => {
    const rows = await tx
      .select({
        interview: discoveryInterviews,
        companyName: companies.name,
        contactName: sql<string | null>`nullif(trim(${contacts.firstName} || ' ' || ${contacts.lastName}), '')`,
        points: sql<number>`coalesce((select sum(e.points)::int from evidence_scores e where e.discovery_id = ${discoveryInterviews.id}), 0)`,
        rated: sql<number>`(select count(*)::int from evidence_scores e where e.discovery_id = ${discoveryInterviews.id} and e.points is not null)`,
      })
      .from(discoveryInterviews)
      .innerJoin(companies, eq(companies.id, discoveryInterviews.companyId))
      .leftJoin(contacts, eq(contacts.id, discoveryInterviews.contactId))
      .where(and(eq(discoveryInterviews.organizationId, ctx.organizationId), opts.companyId ? eq(discoveryInterviews.companyId, opts.companyId) : undefined))
      .orderBy(desc(discoveryInterviews.conductedAt), desc(discoveryInterviews.createdAt))
      .limit(opts.limit ?? 100)
    return rows.map((r) => ({ ...r, score: { points: r.points, rated: r.rated, max: 20, complete: r.rated === 10 } }))
  })
}

export type DiscoveryListItem = Awaited<ReturnType<typeof listDiscoveries>>[number]

export async function getDiscovery(ctx: RequestContext, id: string) {
  return withUserTx(ctx, async (tx) => {
    const [head] = await tx
      .select({ interview: discoveryInterviews, companyName: companies.name })
      .from(discoveryInterviews)
      .innerJoin(companies, eq(companies.id, discoveryInterviews.companyId))
      .where(and(eq(discoveryInterviews.id, id), eq(discoveryInterviews.organizationId, ctx.organizationId)))
    if (!head) return null
    const [questions, answers, scores, insightRows, contactRows] = await Promise.all([
      tx
        .select()
        .from(discoveryQuestions)
        .where(and(eq(discoveryQuestions.organizationId, ctx.organizationId), eq(discoveryQuestions.isActive, true)))
        .orderBy(asc(discoveryQuestions.position)),
      tx.select().from(discoveryAnswers).where(eq(discoveryAnswers.discoveryId, id)),
      tx.select().from(evidenceScores).where(eq(evidenceScores.discoveryId, id)),
      tx.select().from(insights).where(eq(insights.discoveryId, id)).orderBy(asc(insights.createdAt)),
      tx
        .select({ id: contacts.id, name: sql<string>`trim(${contacts.firstName} || ' ' || ${contacts.lastName})`, companyId: contacts.companyId })
        .from(contacts)
        .where(eq(contacts.companyId, head.interview.companyId))
        .orderBy(asc(contacts.lastName)),
    ])
    const scoreByCategory = new Map(scores.map((s) => [s.category as EvidenceCategory, s]))
    const evidence = EVIDENCE_CATEGORIES.map((category) => {
      const s = scoreByCategory.get(category)
      return {
        category,
        points: s?.points ?? null,
        suggestedPoints: s?.suggestedPoints ?? null,
        evidence: s?.evidence ?? null,
        rationale: s?.rationale ?? null,
        suggestedBy: s?.suggestedBy ?? null,
        confirmedAt: s?.confirmedAt ?? null,
      }
    })
    return {
      ...head,
      contactName: contactRows.find((c) => c.id === head.interview.contactId)?.name ?? null,
      contacts: contactRows,
      questions,
      answers: Object.fromEntries(answers.map((a) => [a.questionKey, a])),
      evidence,
      total: evidenceTotal(evidence),
      insights: insightRows,
    }
  })
}

export type DiscoveryDetail = NonNullable<Awaited<ReturnType<typeof getDiscovery>>>

export async function updateDiscoveryNotes(tx: Tx, id: string, input: DiscoveryNotes) {
  const { conductedOn, ...rest } = input
  const [row] = await tx
    .update(discoveryInterviews)
    .set({ ...rest, ...(conductedOn ? { conductedAt: dayToTimestamp(conductedOn) } : {}) })
    .where(eq(discoveryInterviews.id, id))
    .returning({ id: discoveryInterviews.id })
  if (!row) throw new DomainError('not_found', de.errors.notFound)
}

export async function saveAnswer(tx: Tx, ctx: RequestContext, input: DiscoveryAnswerInput, opts: TxOptions = {}) {
  await loadInterview(tx, input.discoveryId)
  const [question] = await tx
    .select()
    .from(discoveryQuestions)
    .where(and(eq(discoveryQuestions.organizationId, ctx.organizationId), eq(discoveryQuestions.key, input.questionKey)))
  if (!question) throw new DomainError('not_found', 'Diese Frage existiert nicht.')
  if (!isValidAnswer(question.answerType as AnswerType, input.value, question.options)) {
    throw new DomainError('validation', 'Diese Antwort passt nicht zum Fragetyp.')
  }
  const empty = input.value === null && !input.verbatim
  if (empty) {
    await tx.delete(discoveryAnswers).where(and(eq(discoveryAnswers.discoveryId, input.discoveryId), eq(discoveryAnswers.questionKey, input.questionKey)))
    return
  }
  const values = { value: input.value, verbatim: input.verbatim ?? null, isUncertain: input.isUncertain, source: opts.actor ?? 'human' } as const
  await tx
    .insert(discoveryAnswers)
    .values({ organizationId: ctx.organizationId, discoveryId: input.discoveryId, questionKey: input.questionKey, ...values })
    .onConflictDoUpdate({ target: [discoveryAnswers.discoveryId, discoveryAnswers.questionKey], set: values })
}

export async function setSignal(tx: Tx, input: SignalInput) {
  const field = SIGNALS.find((s) => s.key === input.signal)!.field
  const [row] = await tx
    .update(discoveryInterviews)
    .set({ [field]: input.value })
    .where(eq(discoveryInterviews.id, input.discoveryId))
    .returning({ id: discoveryInterviews.id })
  if (!row) throw new DomainError('not_found', de.errors.notFound)
}

/**
 * A human rating is always a confirmation. AI suggestions (Phase 7) only fill
 * suggested_points; points stay null until a person confirms or changes them.
 */
export async function setEvidence(tx: Tx, ctx: RequestContext, input: EvidenceInput) {
  await loadInterview(tx, input.discoveryId)
  const confirmed = input.points != null
  const values = {
    points: input.points,
    evidence: input.evidence ?? null,
    rationale: input.rationale ?? null,
    confirmedBy: confirmed ? ctx.userId : null,
    confirmedAt: confirmed ? new Date() : null,
  }
  await tx
    .insert(evidenceScores)
    .values({ organizationId: ctx.organizationId, discoveryId: input.discoveryId, category: input.category, ...values })
    .onConflictDoUpdate({ target: [evidenceScores.discoveryId, evidenceScores.category], set: values })
}

/** Ends the live conversation mode; the interview stays editable as a draft. */
export async function endConversation(tx: Tx, id: string) {
  const interview = await loadInterview(tx, id)
  if (interview.status !== 'in_progress') return interview
  const seconds = interview.startedAt ? Math.max(0, Math.round((Date.now() - interview.startedAt.getTime()) / 1000)) : null
  const [row] = await tx.update(discoveryInterviews).set({ status: 'draft', durationSeconds: seconds }).where(eq(discoveryInterviews.id, id)).returning()
  return row!
}

export async function completeDiscovery(tx: Tx, ctx: RequestContext, id: string, opts: TxOptions = {}) {
  const interview = await loadInterview(tx, id)
  if (interview.status === 'completed') return interview
  const [org] = await tx.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, ctx.organizationId))
  const pilotOffer = parseOrganizationSettings(org?.settings).pilotOffer
  const scores = await tx.select({ category: evidenceScores.category, points: evidenceScores.points }).from(evidenceScores).where(eq(evidenceScores.discoveryId, id))
  const total = evidenceTotal(scores)

  const [row] = await tx
    .update(discoveryInterviews)
    .set({
      status: 'completed',
      completedAt: new Date(),
      // Remember which pilot offer was on the table when the price reaction was recorded.
      pilotOfferSnapshot: pilotOffer,
      durationSeconds:
        interview.durationSeconds ?? (interview.startedAt ? Math.round((Date.now() - interview.startedAt.getTime()) / 1000) : null),
    })
    .where(eq(discoveryInterviews.id, id))
    .returning()

  const signalsYes = SIGNALS.filter((s) => row![s.field] === 'yes').map((s) => de.signalName[s.key])
  const score = formatEvidence(total)
  await recordActivity(
    tx,
    ctx,
    {
      type: 'discovery',
      title: 'Discovery-Gespräch abgeschlossen',
      body: [row!.summary, score && `Evidence Score: ${score}`, signalsYes.length ? `Bestätigt: ${signalsYes.join(', ')}` : null].filter(Boolean).join('\n') || null,
      occurredAt: row!.conductedAt ?? new Date(),
      companyId: row!.companyId,
      contactId: row!.contactId,
      opportunityId: row!.opportunityId,
      discoveryId: row!.id,
      metadata: { evidencePoints: total.points, evidenceRated: total.rated },
    },
    opts,
  )
  const payload = { discoveryId: row!.id, companyId: row!.companyId, evidencePoints: total.points, evidenceRated: total.rated }
  await emitEvent(tx, ctx, 'DISCOVERY_COMPLETED', payload, opts)
  if (row!.signalProblemConfirmed === 'yes') await emitEvent(tx, ctx, 'PAIN_CONFIRMED', payload, opts)
  if (total.complete) await emitEvent(tx, ctx, 'EVIDENCE_SCORE_CONFIRMED', payload, opts)
  return row!
}

export async function reopenDiscovery(tx: Tx, id: string) {
  const [row] = await tx
    .update(discoveryInterviews)
    .set({ status: 'draft', completedAt: null })
    .where(and(eq(discoveryInterviews.id, id), eq(discoveryInterviews.status, 'completed')))
    .returning({ id: discoveryInterviews.id })
  if (!row) throw new DomainError('not_found', de.errors.notFound)
}

export async function deleteDiscovery(tx: Tx, id: string) {
  const rows = await tx.delete(discoveryInterviews).where(eq(discoveryInterviews.id, id)).returning({ id: discoveryInterviews.id })
  if (!rows.length) throw new DomainError('forbidden', 'Nur Administratoren können Discovery-Gespräche löschen.')
}

/** Latest evidence score per company (for pipeline cards and lists). */
export async function latestEvidenceByCompany(tx: Tx, ctx: RequestContext, companyIds: string[]) {
  if (!companyIds.length) return new Map<string, { points: number; rated: number }>()
  const rows = await tx.execute<{ company_id: string; points: number; rated: number }>(sql`
    select distinct on (d.company_id) d.company_id,
      coalesce((select sum(e.points)::int from evidence_scores e where e.discovery_id = d.id), 0) as points,
      (select count(*)::int from evidence_scores e where e.discovery_id = d.id and e.points is not null) as rated
    from discovery_interviews d
    where d.organization_id = ${ctx.organizationId} and d.company_id in ${companyIds}
    order by d.company_id, d.conducted_at desc nulls last, d.created_at desc`)
  return new Map(Array.from(rows).filter((r) => r.rated > 0).map((r) => [r.company_id, { points: r.points, rated: r.rated }]))
}

