import 'server-only'
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm'
import { activities, companies, discoveryAnswers, discoveryInterviews, discoveryQuestions, opportunities, pipelineStages, profiles, tasks } from '@/server/db/schema'
import { withUserTx, type RequestContext, type Tx } from '@/server/db/context'
import type { PipelineStageKey } from '@/domain/schemas'
import { berlinDay } from '@/lib/format'
import { de } from '@/i18n/de'
import {
  computeValidation,
  countDue,
  prioritize,
  VALIDATION_SIGNALS,
  type BriefingCompanySignals,
  type BriefingInput,
  type ChangeSummary,
  type Kpis,
  type ValidationInterview,
  type ValidationStats,
} from '@/domain/briefing'

type ActivityType = keyof typeof de.activityType

/**
 * Advances the "since your last visit" baseline once per Berlin day: the first
 * visit of a day moves last_briefing_at to the previous last_seen_at, so the
 * baseline stays stable across reloads during the day.
 */
async function touchVisit(tx: Tx, ctx: RequestContext, now: Date): Promise<Date | null> {
  const [p] = await tx.select({ lastSeenAt: profiles.lastSeenAt, lastBriefingAt: profiles.lastBriefingAt }).from(profiles).where(eq(profiles.id, ctx.userId))
  if (!p) return null
  const firstVisitToday = p.lastSeenAt != null && berlinDay(p.lastSeenAt) < berlinDay(now)
  const baseline = firstVisitToday ? p.lastSeenAt : p.lastBriefingAt
  await tx
    .update(profiles)
    .set({ lastSeenAt: now, ...(firstVisitToday ? { lastBriefingAt: p.lastSeenAt } : {}) })
    .where(eq(profiles.id, ctx.userId))
  return baseline
}

async function loadBriefingInput(tx: Tx, ctx: RequestContext, today: string): Promise<BriefingInput> {
  const org = ctx.organizationId
  const taskRows = await tx
    .select({ id: tasks.id, title: tasks.title, dueDate: tasks.dueDate, priority: tasks.priority, companyId: tasks.companyId, companyName: companies.name })
    .from(tasks)
    .leftJoin(companies, eq(companies.id, tasks.companyId))
    .where(and(eq(tasks.organizationId, org), eq(tasks.status, 'open')))

  const oppRows = await tx
    .select({
      id: opportunities.id,
      title: opportunities.title,
      companyId: opportunities.companyId,
      companyName: companies.name,
      stageKey: pipelineStages.key,
      valueCents: opportunities.valueCents,
      nextStep: opportunities.nextStep,
      nextStepDate: opportunities.nextStepDate,
      lastTouch: sql<string>`greatest(${opportunities.stageChangedAt}, (select max(a.occurred_at) from activities a where a.company_id = ${opportunities.companyId}))`.mapWith(
        (v) => berlinDay(new Date(v)),
      ),
    })
    .from(opportunities)
    .innerJoin(companies, eq(companies.id, opportunities.companyId))
    .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
    .where(and(eq(opportunities.organizationId, org), eq(pipelineStages.outcome, 'open')))

  const signalRows = await tx.execute<{
    company_id: string
    company_name: string
    discovery_id: string
    completed_at: string
    problem: string
    price: string
    points: number
    rated: number
  }>(sql`
    select distinct on (d.company_id) d.company_id, c.name as company_name, d.id as discovery_id, d.completed_at,
      d.signal_problem_confirmed as problem, d.signal_price_ok as price,
      coalesce((select sum(e.points)::int from evidence_scores e where e.discovery_id = d.id), 0) as points,
      (select count(*)::int from evidence_scores e where e.discovery_id = d.id and e.points is not null) as rated
    from discovery_interviews d join companies c on c.id = d.company_id
    where d.organization_id = ${org} and d.status = 'completed'
    order by d.company_id, d.completed_at desc nulls last`)

  const signals: BriefingCompanySignals[] = Array.from(signalRows).map((r) => ({
    companyId: r.company_id,
    companyName: r.company_name,
    problemConfirmed: r.problem === 'yes',
    priceOk: r.price === 'yes',
    evidencePoints: r.rated > 0 ? r.points : null,
    discoveryId: r.discovery_id,
    discoveryCompletedDay: r.completed_at ? berlinDay(new Date(r.completed_at)) : null,
  }))

  return {
    today,
    tasks: taskRows,
    opportunities: oppRows.map((o) => ({ ...o, stageKey: o.stageKey as PipelineStageKey, lastTouchDay: o.lastTouch })),
    signals,
  }
}

export async function loadValidation(tx: Tx, ctx: RequestContext): Promise<ValidationStats> {
  const rows = await tx
    .select({
      companyId: discoveryInterviews.companyId,
      signal_problem_confirmed: discoveryInterviews.signalProblemConfirmed,
      signal_regular_backlog: discoveryInterviews.signalRegularBacklog,
      signal_capacity_cause: discoveryInterviews.signalCapacityCause,
      signal_external_ok: discoveryInterviews.signalExternalOk,
      signal_price_ok: discoveryInterviews.signalPriceOk,
      signal_pilot_interest: discoveryInterviews.signalPilotInterest,
      mainPain: discoveryInterviews.mainPain,
      recoveryUseCase: discoveryInterviews.recoveryUseCase,
      objections: discoveryInterviews.objections,
      externalizationConcerns: discoveryInterviews.externalizationConcerns,
      desiredKpis: discoveryInterviews.desiredKpis,
    })
    .from(discoveryInterviews)
    .where(and(eq(discoveryInterviews.organizationId, ctx.organizationId), eq(discoveryInterviews.status, 'completed')))

  const interviews: ValidationInterview[] = rows.map((r) => ({
    companyId: r.companyId,
    signals: Object.fromEntries(VALIDATION_SIGNALS.map((k) => [k, r[k]])) as ValidationInterview['signals'],
    mainPain: r.mainPain,
    recoveryUseCase: r.recoveryUseCase,
    objections: r.objections,
    externalizationConcerns: r.externalizationConcerns,
    desiredKpis: r.desiredKpis,
  }))

  // A pilot counts as proposed/won if an opportunity is in that stage now or ever was (events).
  const outcomeRows = await tx.execute<{ company_id: string; kind: 'proposed' | 'won' }>(sql`
    select o.company_id, case when s.outcome = 'won' then 'won' else 'proposed' end as kind
      from opportunities o join pipeline_stages s on s.id = o.stage_id
      where o.organization_id = ${ctx.organizationId} and (s.key = 'proposal' or s.outcome = 'won')
    union
    select (e.payload->>'companyId')::uuid, case e.type when 'PILOT_WON' then 'won' else 'proposed' end
      from domain_events e
      where e.organization_id = ${ctx.organizationId} and e.type in ('PILOT_PROPOSED', 'PILOT_WON') and e.payload ? 'companyId'`)
  const proposed = new Set<string>()
  const won = new Set<string>()
  for (const r of outcomeRows) {
    proposed.add(r.company_id) // a won pilot was necessarily offered
    if (r.kind === 'won') won.add(r.company_id)
  }
  return computeValidation(interviews, { proposed, won })
}

async function loadKpis(tx: Tx, ctx: RequestContext, today: string): Promise<Kpis> {
  const [row] = await tx.execute<Record<keyof Kpis, number>>(sql`
    with o as (
      select o.value_cents, o.won_without_order, s.key, s.outcome
      from opportunities o join pipeline_stages s on s.id = o.stage_id
      where o.organization_id = ${ctx.organizationId}
    )
    select
      (select count(*)::int from companies where organization_id = ${ctx.organizationId} and status in ('researched', 'qualified')) as "targetCompanies",
      (select count(*)::int from companies where organization_id = ${ctx.organizationId} and status = 'qualified') as "qualifiedCompanies",
      (select count(*)::int from discovery_interviews where organization_id = ${ctx.organizationId} and status = 'completed') as "discoveriesCompleted",
      (select count(*)::int from discovery_interviews where organization_id = ${ctx.organizationId} and status <> 'completed') as "discoveriesOpen",
      (select count(distinct company_id)::int from discovery_interviews
        where organization_id = ${ctx.organizationId} and status = 'completed' and signal_problem_confirmed = 'yes') as "needConfirmed",
      (select count(*)::int from o where key = 'pilot_opportunity') as "pilotOpportunities",
      (select count(*)::int from o where key = 'proposal') as "openProposals",
      (select coalesce(sum(value_cents), 0)::bigint from o where key = 'proposal') as "openProposalsValueCents",
      (select count(*)::int from o where outcome = 'open') as "pipelineCount",
      (select coalesce(sum(value_cents), 0)::bigint from o where outcome = 'open') as "pipelineValueCents",
      (select count(*)::int from o where outcome = 'won') as "wonPilots",
      (select count(*)::int from o where outcome = 'won' and won_without_order) as "wonWithoutOrder",
      (select count(*)::int from tasks where organization_id = ${ctx.organizationId} and status = 'open' and due_date <= ${today}) as "tasksDue",
      (select count(*)::int from tasks where organization_id = ${ctx.organizationId} and status = 'open' and due_date < ${today}) as "tasksOverdue"`)
  return Object.fromEntries(Object.entries(row!).map(([k, v]) => [k, Number(v)])) as unknown as Kpis
}

async function loadChanges(tx: Tx, ctx: RequestContext, since: Date | null): Promise<ChangeSummary | null> {
  if (!since) return null
  const rows = await tx
    .select({ type: activities.type, count: sql<number>`count(*)::int` })
    .from(activities)
    .where(and(eq(activities.organizationId, ctx.organizationId), gt(activities.createdAt, since)))
    .groupBy(activities.type)
    .orderBy(sql`count(*) desc`)
  return { since, byType: rows.map((r) => ({ type: r.type as ActivityType, count: r.count })) }
}

export async function getOverview(ctx: RequestContext, now = new Date()) {
  const today = berlinDay(now)
  return withUserTx(ctx, async (tx) => {
    const baseline = await touchVisit(tx, ctx, now)
    const input = await loadBriefingInput(tx, ctx, today)
    const [validation, kpis, changes] = [await loadValidation(tx, ctx), await loadKpis(tx, ctx, today), await loadChanges(tx, ctx, baseline)]
    return { today, items: prioritize(input), counts: countDue(input), validation, kpis, changes }
  })
}

export type Overview = Awaited<ReturnType<typeof getOverview>>

export async function getValidation(ctx: RequestContext) {
  return withUserTx(ctx, (tx) => loadValidation(tx, ctx))
}

/** Everything needed to prepare a conversation with a company (spec 41, step 5). */
export async function getPreparation(ctx: RequestContext, companyId: string) {
  return withUserTx(ctx, async (tx) => {
    const today = berlinDay()
    const input = await loadBriefingInput(tx, ctx, today)
    const item = prioritize({
      ...input,
      tasks: input.tasks.filter((t) => t.companyId === companyId),
      opportunities: input.opportunities.filter((o) => o.companyId === companyId),
      signals: input.signals.filter((s) => s.companyId === companyId),
    })[0]
    const [latest] = await tx
      .select({
        id: discoveryInterviews.id,
        completedAt: discoveryInterviews.completedAt,
        summary: discoveryInterviews.summary,
        mainPain: discoveryInterviews.mainPain,
        coreQuestionAnswer: discoveryInterviews.coreQuestionAnswer,
        objections: discoveryInterviews.objections,
        externalizationConcerns: discoveryInterviews.externalizationConcerns,
        points: sql<number>`coalesce((select sum(e.points)::int from evidence_scores e where e.discovery_id = discovery_interviews.id), 0)`,
        rated: sql<number>`(select count(*)::int from evidence_scores e where e.discovery_id = discovery_interviews.id and e.points is not null)`,
      })
      .from(discoveryInterviews)
      .where(and(eq(discoveryInterviews.companyId, companyId), eq(discoveryInterviews.status, 'completed')))
      .orderBy(sql`${discoveryInterviews.completedAt} desc nulls last`)
      .limit(1)
    const [open] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(discoveryInterviews)
      .where(and(eq(discoveryInterviews.companyId, companyId), inArray(discoveryInterviews.status, ['planned', 'draft', 'in_progress'])))
    const core = await tx
      .select({ key: discoveryQuestions.key, prompt: discoveryQuestions.prompt, section: discoveryQuestions.section })
      .from(discoveryQuestions)
      .where(and(eq(discoveryQuestions.organizationId, ctx.organizationId), eq(discoveryQuestions.isCore, true), eq(discoveryQuestions.isActive, true)))
      .orderBy(asc(discoveryQuestions.position))
    const answered = latest
      ? new Set((await tx.select({ key: discoveryAnswers.questionKey }).from(discoveryAnswers).where(eq(discoveryAnswers.discoveryId, latest.id))).map((a) => a.key))
      : new Set<string>()
    return {
      priority: item ?? null,
      latestDiscovery: latest ?? null,
      openDiscoveries: open?.n ?? 0,
      openCoreQuestions: core.filter((q) => !answered.has(q.key)),
      coreQuestionCount: core.length,
    }
  })
}
