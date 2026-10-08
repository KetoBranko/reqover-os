import 'server-only'
import { and, desc, eq, inArray, lt, sql, type SQL } from 'drizzle-orm'
import { activities, companies, contacts } from '@/server/db/schema'
import { withUserTx, type RequestContext, type Tx, type TxOptions } from '@/server/db/context'

type ActivityType = (typeof activities.$inferInsert)['type']

export interface NewActivity {
  type: ActivityType
  title: string
  body?: string | null
  occurredAt?: Date
  companyId?: string | null
  contactId?: string | null
  opportunityId?: string | null
  discoveryId?: string | null
  taskId?: string | null
  metadata?: Record<string, unknown>
}

/** Adds an entry to the central timeline inside the caller's transaction. */
export async function recordActivity(tx: Tx, ctx: RequestContext, input: NewActivity, opts: TxOptions = {}) {
  const [row] = await tx
    .insert(activities)
    .values({
      organizationId: ctx.organizationId,
      createdBy: ctx.userId,
      actor: opts.actor ?? 'human',
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      companyId: input.companyId ?? null,
      contactId: input.contactId ?? null,
      opportunityId: input.opportunityId ?? null,
      discoveryId: input.discoveryId ?? null,
      taskId: input.taskId ?? null,
      metadata: input.metadata ?? {},
    })
    .returning()
  return row!
}

export interface TimelineFilter {
  companyId?: string
  contactId?: string
  types?: ActivityType[]
  before?: Date
  limit?: number
  q?: string
}

export async function listTimeline(ctx: RequestContext, filter: TimelineFilter = {}) {
  const where: SQL[] = [eq(activities.organizationId, ctx.organizationId)]
  if (filter.companyId) where.push(eq(activities.companyId, filter.companyId))
  if (filter.contactId) where.push(eq(activities.contactId, filter.contactId))
  if (filter.types?.length) where.push(inArray(activities.type, filter.types))
  if (filter.before) where.push(lt(activities.occurredAt, filter.before))
  if (filter.q?.trim()) where.push(sql`activities.search @@ websearch_to_tsquery('german', ${filter.q.trim()})`)
  const limit = filter.limit ?? 50
  return withUserTx(ctx, async (tx) => {
    const rows = await tx
      .select({
        activity: activities,
        companyName: companies.name,
        contactName: sql<string | null>`nullif(trim(${contacts.firstName} || ' ' || ${contacts.lastName}), '')`,
      })
      .from(activities)
      .leftJoin(companies, eq(companies.id, activities.companyId))
      .leftJoin(contacts, eq(contacts.id, activities.contactId))
      .where(and(...where))
      .orderBy(desc(activities.occurredAt), desc(activities.createdAt))
      .limit(limit + 1)
    return { items: rows.slice(0, limit), hasMore: rows.length > limit }
  })
}

export type TimelineItem = Awaited<ReturnType<typeof listTimeline>>['items'][number]
