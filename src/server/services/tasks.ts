import 'server-only'
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm'
import { companies, contacts, tasks } from '@/server/db/schema'
import { emitEvent, withUserTx, type RequestContext, type Tx, type TxOptions } from '@/server/db/context'
import type { TaskInput } from '@/domain/schemas'
import { DomainError } from '@/server/action'
import { de } from '@/i18n/de'
import { recordActivity } from './activities'

export async function listTasks(ctx: RequestContext, opts: { status?: 'open' | 'done'; companyId?: string; limit?: number } = {}) {
  const where: SQL[] = [eq(tasks.organizationId, ctx.organizationId)]
  if (opts.status) where.push(eq(tasks.status, opts.status))
  if (opts.companyId) where.push(eq(tasks.companyId, opts.companyId))
  return withUserTx(ctx, (tx) =>
    tx
      .select({
        task: tasks,
        companyName: companies.name,
        contactName: sql<string | null>`nullif(trim(${contacts.firstName} || ' ' || ${contacts.lastName}), '')`,
      })
      .from(tasks)
      .leftJoin(companies, eq(companies.id, tasks.companyId))
      .leftJoin(contacts, eq(contacts.id, tasks.contactId))
      .where(and(...where))
      .orderBy(
        ...(opts.status === 'done'
          ? [desc(tasks.completedAt)]
          : [sql`${tasks.dueDate} asc nulls last`, sql`case ${tasks.priority} when 'high' then 0 when 'normal' then 1 else 2 end`, asc(tasks.createdAt)]),
      )
      .limit(opts.limit ?? 200),
  )
}

export type TaskListItem = Awaited<ReturnType<typeof listTasks>>[number]

/** Fills in the company from a contact/opportunity so tasks always have context. */
async function resolveCompany(tx: Tx, input: Pick<TaskInput, 'companyId' | 'contactId'>) {
  if (input.companyId || !input.contactId) return input.companyId ?? null
  const [c] = await tx.select({ companyId: contacts.companyId }).from(contacts).where(eq(contacts.id, input.contactId))
  return c?.companyId ?? null
}

export async function createTask(tx: Tx, ctx: RequestContext, input: TaskInput, opts: TxOptions = {}) {
  const companyId = await resolveCompany(tx, input)
  const [row] = await tx
    .insert(tasks)
    .values({
      ...input,
      companyId,
      organizationId: ctx.organizationId,
      createdBy: ctx.userId,
      assigneeId: ctx.userId,
      origin: opts.actor ?? 'human',
    })
    .returning()
  await emitEvent(tx, ctx, 'TASK_CREATED', { taskId: row!.id, companyId }, opts)
  return row!
}

export async function updateTask(tx: Tx, id: string, input: Partial<TaskInput>) {
  const [row] = await tx.update(tasks).set(input).where(eq(tasks.id, id)).returning()
  if (!row) throw new DomainError('not_found', de.errors.notFound)
  return row
}

export async function setTaskDone(tx: Tx, ctx: RequestContext, id: string, done: boolean, opts: TxOptions = {}) {
  const [before] = await tx.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, id))
  if (!before) throw new DomainError('not_found', de.errors.notFound)
  const [row] = await tx
    .update(tasks)
    .set({ status: done ? 'done' : 'open', completedAt: done ? new Date() : null })
    .where(eq(tasks.id, id))
    .returning()
  if (!row) throw new DomainError('not_found', de.errors.notFound)
  // Only a real transition is documented; a double click must not log twice.
  if (done && before.status !== 'done') {
    await recordActivity(
      tx,
      ctx,
      { type: 'task', title: `Aufgabe erledigt: ${row.title}`, companyId: row.companyId, contactId: row.contactId, opportunityId: row.opportunityId, taskId: row.id },
      opts,
    )
    await emitEvent(tx, ctx, 'TASK_COMPLETED', { taskId: row.id, companyId: row.companyId }, opts)
  }
  return row
}

export async function deleteTask(tx: Tx, id: string) {
  const rows = await tx.delete(tasks).where(eq(tasks.id, id)).returning({ id: tasks.id })
  if (!rows.length) throw new DomainError('not_found', de.errors.notFound)
}

export async function countOpenTasks(ctx: RequestContext) {
  return withUserTx(ctx, async (tx) => {
    const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(tasks).where(and(eq(tasks.organizationId, ctx.organizationId), eq(tasks.status, 'open')))
    return row?.n ?? 0
  })
}
