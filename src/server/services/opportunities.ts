import 'server-only'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { companies, contacts, opportunities, pipelineStages, pipelines } from '@/server/db/schema'
import { emitEvent, withUserTx, type RequestContext, type Tx, type TxOptions } from '@/server/db/context'
import type { OpportunityInput, OpportunityMove, PipelineStageKey } from '@/domain/schemas'
import { DomainError } from '@/server/action'
import { de } from '@/i18n/de'
import { formatMoney } from '@/lib/format'
import { recordActivity } from './activities'
import { escapeLike } from './companies'

const PIPELINE_KEY = 'sales'

export interface BoardStage {
  id: string
  key: PipelineStageKey
  name: string
  outcome: 'open' | 'won' | 'lost'
}

export interface BoardCard {
  id: string
  title: string
  stageId: string
  companyId: string
  companyName: string
  primaryContactId: string | null
  contactName: string | null
  valueCents: number | null
  nextStep: string | null
  nextStepDate: string | null
  stageChangedAt: Date
  lostReason: string | null
  orderConfirmedAt: string | null
  isDemo: boolean
}

async function stagesOf(tx: Tx, ctx: RequestContext) {
  return tx
    .select({ id: pipelineStages.id, key: pipelineStages.key, name: pipelineStages.name, outcome: pipelineStages.outcome, pipelineId: pipelineStages.pipelineId })
    .from(pipelineStages)
    .innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId))
    .where(and(eq(pipelines.organizationId, ctx.organizationId), eq(pipelines.key, PIPELINE_KEY)))
    .orderBy(asc(pipelineStages.position))
}

async function stageByKey(tx: Tx, ctx: RequestContext, key: PipelineStageKey) {
  const stage = (await stagesOf(tx, ctx)).find((s) => s.key === key)
  if (!stage) throw new DomainError('not_found', 'Diese Pipeline-Phase existiert nicht.')
  return stage
}

export async function getBoard(ctx: RequestContext, opts: { q?: string } = {}) {
  return withUserTx(ctx, async (tx) => {
    const stages = await stagesOf(tx, ctx)
    const q = opts.q?.trim()
    const rows = await tx
      .select({
        id: opportunities.id,
        title: opportunities.title,
        stageId: opportunities.stageId,
        companyId: opportunities.companyId,
        companyName: companies.name,
        primaryContactId: opportunities.primaryContactId,
        contactName: sql<string | null>`nullif(trim(${contacts.firstName} || ' ' || ${contacts.lastName}), '')`,
        valueCents: opportunities.valueCents,
        nextStep: opportunities.nextStep,
        nextStepDate: opportunities.nextStepDate,
        stageChangedAt: opportunities.stageChangedAt,
        lostReason: opportunities.lostReason,
        orderConfirmedAt: opportunities.orderConfirmedAt,
        isDemo: opportunities.isDemo,
      })
      .from(opportunities)
      .innerJoin(companies, eq(companies.id, opportunities.companyId))
      .leftJoin(contacts, eq(contacts.id, opportunities.primaryContactId))
      .where(
        and(
          eq(opportunities.organizationId, ctx.organizationId),
          q ? sql`(${opportunities.title} ilike ${`%${escapeLike(q)}%`} or ${companies.name} ilike ${`%${escapeLike(q)}%`})` : undefined,
        ),
      )
      .orderBy(desc(opportunities.stageChangedAt))
    return {
      stages: stages.map(({ pipelineId: _p, ...s }) => s as BoardStage),
      cards: rows as BoardCard[],
    }
  })
}

export async function listCompanyOpportunities(ctx: RequestContext, companyId: string) {
  return (await getBoard(ctx)).cards.filter((c) => c.companyId === companyId)
}

export async function createOpportunity(tx: Tx, ctx: RequestContext, input: OpportunityInput, opts: TxOptions = {}) {
  const stage = await stageByKey(tx, ctx, input.stageKey)
  if (stage.outcome !== 'open') throw new DomainError('validation', 'Neue Chancen beginnen in einer offenen Phase.')
  const { stageKey: _s, ...rest } = input
  const [row] = await tx
    .insert(opportunities)
    .values({ ...rest, organizationId: ctx.organizationId, pipelineId: stage.pipelineId, stageId: stage.id, createdBy: ctx.userId })
    .returning()
  await recordActivity(
    tx,
    ctx,
    {
      type: 'opportunity',
      title: `Chance angelegt: ${row!.title}`,
      body: row!.valueCents != null ? `Wert: ${formatMoney(row!.valueCents)}` : null,
      companyId: row!.companyId,
      contactId: row!.primaryContactId,
      opportunityId: row!.id,
      metadata: { stage: stage.key },
    },
    opts,
  )
  await emitEvent(tx, ctx, 'OPPORTUNITY_CREATED', { opportunityId: row!.id, companyId: row!.companyId, stage: stage.key }, opts)
  return row!
}

export async function updateOpportunity(tx: Tx, id: string, input: Partial<Omit<OpportunityInput, 'companyId' | 'stageKey'>>) {
  const [row] = await tx.update(opportunities).set(input).where(eq(opportunities.id, id)).returning()
  if (!row) throw new DomainError('not_found', de.errors.notFound)
  return row
}

/**
 * Moves an opportunity to another stage. "Gewonnen" needs a documented order,
 * "Verloren" a reason; without them the caller gets needs_confirmation with the
 * missing field, so the UI can ask instead of silently saving bad data.
 */
export async function moveOpportunity(tx: Tx, ctx: RequestContext, input: OpportunityMove, opts: TxOptions = {}) {
  const [current] = await tx
    .select({ opp: opportunities, fromKey: pipelineStages.key })
    .from(opportunities)
    .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
    .where(eq(opportunities.id, input.id))
  if (!current) throw new DomainError('not_found', de.errors.notFound)
  const target = await stageByKey(tx, ctx, input.stageKey)
  if (current.fromKey === target.key) return current.opp

  const orderConfirmedAt = input.orderConfirmedAt ?? current.opp.orderConfirmedAt
  const lostReason = input.lostReason ?? (target.outcome === 'lost' ? current.opp.lostReason : null)
  if (target.outcome === 'won' && !orderConfirmedAt) {
    throw new DomainError('needs_confirmation', 'Für „Gewonnen“ fehlt der dokumentierte Auftrag.', { required: 'orderConfirmedAt' })
  }
  if (target.outcome === 'lost' && !lostReason) {
    throw new DomainError('needs_confirmation', 'Für „Verloren“ fehlt der Grund.', { required: 'lostReason' })
  }

  const [row] = await tx
    .update(opportunities)
    .set({
      stageId: target.id,
      orderConfirmedAt: target.outcome === 'won' ? orderConfirmedAt : current.opp.orderConfirmedAt,
      lostReason: target.outcome === 'lost' ? lostReason : null,
    })
    .where(eq(opportunities.id, input.id))
    .returning()

  const from = current.fromKey as PipelineStageKey
  await recordActivity(
    tx,
    ctx,
    {
      type: 'stage_change',
      title: `${row!.title}: ${de.pipelineStage[from]} → ${de.pipelineStage[target.key as PipelineStageKey]}`,
      body: target.outcome === 'lost' ? `Grund: ${lostReason}` : null,
      companyId: row!.companyId,
      contactId: row!.primaryContactId,
      opportunityId: row!.id,
      metadata: { field: 'opportunity.stage', from, to: target.key },
    },
    opts,
  )
  await emitEvent(tx, ctx, 'OPPORTUNITY_STAGE_CHANGED', { opportunityId: row!.id, companyId: row!.companyId, from, to: target.key }, opts)
  if (target.outcome === 'won') await emitEvent(tx, ctx, 'PILOT_WON', { opportunityId: row!.id, companyId: row!.companyId }, opts)
  if (target.outcome === 'lost') await emitEvent(tx, ctx, 'PILOT_LOST', { opportunityId: row!.id, companyId: row!.companyId, reason: lostReason }, opts)
  if (target.key === 'proposal') await emitEvent(tx, ctx, 'PILOT_PROPOSED', { opportunityId: row!.id, companyId: row!.companyId }, opts)
  return row!
}

export async function deleteOpportunity(tx: Tx, id: string) {
  const rows = await tx.delete(opportunities).where(eq(opportunities.id, id)).returning({ id: opportunities.id })
  if (!rows.length) throw new DomainError('forbidden', 'Nur Administratoren können Chancen löschen.')
}
