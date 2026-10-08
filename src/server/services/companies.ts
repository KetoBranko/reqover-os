import 'server-only'
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { activities, companies, contacts, insights, opportunities, pipelineStages, tasks } from '@/server/db/schema'
import { emitEvent, withUserTx, type RequestContext, type Tx, type TxOptions } from '@/server/db/context'
import type { CompanyInput } from '@/domain/schemas'
import { DomainError } from '@/server/action'
import { de } from '@/i18n/de'
import { recordActivity } from './activities'

export type CompanyStatus = (typeof companies.$inferSelect)['status']

/** Activities that count as real customer contact (for "letzter Kontakt"). */
export const CONTACT_ACTIVITY_TYPES = ['call', 'meeting', 'email', 'discovery'] as const

export interface CompanyListItem {
  id: string
  name: string
  industry: string | null
  city: string | null
  status: CompanyStatus
  fitScore: number | null
  isDemo: boolean
  contactCount: number
  lastContactAt: Date | null
  nextTaskDue: string | null
  nextTaskTitle: string | null
  stageKey: string | null
}

export async function listCompanies(
  ctx: RequestContext,
  opts: { q?: string; status?: CompanyStatus; limit?: number; offset?: number } = {},
): Promise<{ items: CompanyListItem[]; total: number }> {
  const filters: SQL[] = [eq(companies.organizationId, ctx.organizationId)]
  if (opts.status) filters.push(eq(companies.status, opts.status))
  const q = opts.q?.trim()
  if (q) {
    filters.push(
      or(ilike(companies.name, `%${escapeLike(q)}%`), sql`${sql.raw('companies.search')} @@ websearch_to_tsquery('german', ${q})`)!,
    )
  }
  const where = and(...filters)
  return withUserTx(ctx, async (tx) => {
    const lastContact = sql<Date | null>`(select max(a.occurred_at) from activities a
      where a.company_id = companies.id and a.type in ('call','meeting','email','discovery'))`.mapWith((v) => (v ? new Date(v) : null))
    const nextTask = sql<string | null>`(select t.due_date::text || '|' || t.title from tasks t
      where t.company_id = companies.id and t.status = 'open'
      order by t.due_date asc nulls last, t.created_at asc limit 1)`
    const stage = sql<string | null>`(select s.key from opportunities o join pipeline_stages s on s.id = o.stage_id
      where o.company_id = companies.id order by (s.outcome = 'open') desc, o.updated_at desc limit 1)`
    const rows = await tx
      .select({
        id: companies.id,
        name: companies.name,
        industry: companies.industry,
        city: companies.city,
        status: companies.status,
        fitScore: companies.fitScore,
        isDemo: companies.isDemo,
        contactCount: sql<number>`(select count(*)::int from contacts c where c.company_id = companies.id)`,
        lastContactAt: lastContact,
        nextTask,
        stageKey: stage,
      })
      .from(companies)
      .where(where)
      .orderBy(asc(companies.name))
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0)
    const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(companies).where(where)
    return {
      total: count?.n ?? 0,
      items: rows.map(({ nextTask: nt, ...r }) => {
        const [due, ...title] = nt?.split('|') ?? []
        return { ...r, nextTaskDue: due || null, nextTaskTitle: title.length ? title.join('|') : null }
      }),
    }
  })
}

export async function getCompany360(ctx: RequestContext, id: string) {
  return withUserTx(ctx, async (tx) => {
    const [company] = await tx
      .select()
      .from(companies)
      .where(and(eq(companies.id, id), eq(companies.organizationId, ctx.organizationId)))
    if (!company) return null
    const [contactRows, insightRows, openTasks, recentActivities, opportunityRows] = await Promise.all([
      tx.select().from(contacts).where(eq(contacts.companyId, id)).orderBy(asc(contacts.lastName)),
      tx.select().from(insights).where(eq(insights.companyId, id)).orderBy(desc(insights.createdAt)),
      tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.companyId, id), eq(tasks.status, 'open')))
        .orderBy(sql`${tasks.dueDate} asc nulls last`, asc(tasks.createdAt)),
      tx.select().from(activities).where(eq(activities.companyId, id)).orderBy(desc(activities.occurredAt)).limit(100),
      tx
        .select({ opportunity: opportunities, stageKey: pipelineStages.key, stageName: pipelineStages.name, outcome: pipelineStages.outcome })
        .from(opportunities)
        .innerJoin(pipelineStages, eq(pipelineStages.id, opportunities.stageId))
        .where(eq(opportunities.companyId, id))
        .orderBy(desc(opportunities.updatedAt)),
    ])
    const lastContactAt =
      recentActivities.find((a) => (CONTACT_ACTIVITY_TYPES as readonly string[]).includes(a.type))?.occurredAt ?? null
    return { company, contacts: contactRows, insights: insightRows, openTasks, activities: recentActivities, opportunities: opportunityRows, lastContactAt }
  })
}

export type Company360 = NonNullable<Awaited<ReturnType<typeof getCompany360>>>

export async function createCompany(tx: Tx, ctx: RequestContext, input: CompanyInput, opts: TxOptions = {}) {
  const [row] = await tx
    .insert(companies)
    .values({ ...input, organizationId: ctx.organizationId, createdBy: ctx.userId })
    .returning()
  await emitEvent(tx, ctx, 'COMPANY_CREATED', { companyId: row!.id, name: row!.name }, opts)
  return row!
}

export async function updateCompany(tx: Tx, ctx: RequestContext, id: string, input: Partial<CompanyInput>, opts: TxOptions = {}) {
  const [before] = await tx.select({ status: companies.status }).from(companies).where(eq(companies.id, id))
  if (!before) throw new DomainError('not_found', de.errors.notFound)
  const [row] = await tx.update(companies).set(input).where(eq(companies.id, id)).returning()
  if (!row) throw new DomainError('not_found', de.errors.notFound)
  if (input.status && input.status !== before.status) {
    await recordActivity(
      tx,
      ctx,
      {
        type: 'stage_change',
        title: `Status: ${de.companyStatus[before.status]} → ${de.companyStatus[input.status]}`,
        companyId: id,
        metadata: { field: 'company.status', from: before.status, to: input.status },
      },
      opts,
    )
    await emitEvent(tx, ctx, 'COMPANY_STATUS_CHANGED', { companyId: id, from: before.status, to: input.status }, opts)
  }
  return row
}

export async function deleteCompany(tx: Tx, id: string) {
  const rows = await tx.delete(companies).where(eq(companies.id, id)).returning({ id: companies.id })
  if (!rows.length) throw new DomainError('forbidden', 'Nur Administratoren können Unternehmen löschen.')
}

export async function companyOptions(ctx: RequestContext) {
  return withUserTx(ctx, (tx) =>
    tx
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.organizationId, ctx.organizationId))
      .orderBy(asc(companies.name))
      .limit(500),
  )
}

export async function companiesByIds(ctx: RequestContext, ids: string[]) {
  if (!ids.length) return []
  return withUserTx(ctx, (tx) => tx.select({ id: companies.id, name: companies.name }).from(companies).where(inArray(companies.id, ids)))
}

export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

