import 'server-only'
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { activities, companies, contacts, tasks } from '@/server/db/schema'
import { emitEvent, withUserTx, type RequestContext, type Tx, type TxOptions } from '@/server/db/context'
import type { ContactInput } from '@/domain/schemas'
import { DomainError } from '@/server/action'
import { de } from '@/i18n/de'
import { escapeLike } from './companies'

export async function listContacts(ctx: RequestContext, opts: { q?: string; companyId?: string; limit?: number; offset?: number } = {}) {
  const where: SQL[] = [eq(contacts.organizationId, ctx.organizationId)]
  if (opts.companyId) where.push(eq(contacts.companyId, opts.companyId))
  const q = opts.q?.trim()
  if (q) {
    const like = `%${escapeLike(q)}%`
    where.push(or(ilike(contacts.lastName, like), ilike(contacts.firstName, like), ilike(contacts.email, like), ilike(companies.name, like))!)
  }
  return withUserTx(ctx, async (tx) => {
    const rows = await tx
      .select({
        contact: contacts,
        companyName: companies.name,
        lastContactAt: sql<Date | null>`(select max(a.occurred_at) from activities a
          where a.contact_id = contacts.id and a.type in ('call','meeting','email','discovery'))`.mapWith((v) => (v ? new Date(v) : null)),
        nextContactDate: sql<string | null>`(select min(t.due_date)::text from tasks t where t.contact_id = contacts.id and t.status = 'open')`,
      })
      .from(contacts)
      .innerJoin(companies, eq(companies.id, contacts.companyId))
      .where(and(...where))
      .orderBy(asc(contacts.lastName), asc(contacts.firstName))
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0)
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(contacts)
      .innerJoin(companies, eq(companies.id, contacts.companyId))
      .where(and(...where))
    return { items: rows, total: count?.n ?? 0 }
  })
}

export async function getContact(ctx: RequestContext, id: string) {
  return withUserTx(ctx, async (tx) => {
    const [row] = await tx
      .select({ contact: contacts, companyName: companies.name })
      .from(contacts)
      .innerJoin(companies, eq(companies.id, contacts.companyId))
      .where(and(eq(contacts.id, id), eq(contacts.organizationId, ctx.organizationId)))
    if (!row) return null
    const [openTasks, timeline] = await Promise.all([
      tx.select().from(tasks).where(and(eq(tasks.contactId, id), eq(tasks.status, 'open'))).orderBy(sql`${tasks.dueDate} asc nulls last`),
      tx.select().from(activities).where(eq(activities.contactId, id)).orderBy(desc(activities.occurredAt)).limit(100),
    ])
    return { ...row, openTasks, timeline }
  })
}

export async function createContact(tx: Tx, ctx: RequestContext, input: ContactInput, opts: TxOptions = {}) {
  const [row] = await tx
    .insert(contacts)
    .values({ ...input, organizationId: ctx.organizationId, createdBy: ctx.userId })
    .returning()
  await emitEvent(tx, ctx, 'CONTACT_CREATED', { contactId: row!.id, companyId: row!.companyId }, opts)
  return row!
}

export async function updateContact(tx: Tx, id: string, input: Partial<ContactInput>) {
  const [row] = await tx.update(contacts).set(input).where(eq(contacts.id, id)).returning()
  if (!row) throw new DomainError('not_found', de.errors.notFound)
  return row
}

export async function deleteContact(tx: Tx, id: string) {
  const rows = await tx.delete(contacts).where(eq(contacts.id, id)).returning({ id: contacts.id })
  if (!rows.length) throw new DomainError('forbidden', 'Nur Administratoren können Kontakte löschen.')
}

export async function contactOptions(ctx: RequestContext, companyId?: string) {
  return withUserTx(ctx, (tx) =>
    tx
      .select({ id: contacts.id, name: sql<string>`trim(${contacts.firstName} || ' ' || ${contacts.lastName})`, companyId: contacts.companyId })
      .from(contacts)
      .where(and(eq(contacts.organizationId, ctx.organizationId), companyId ? eq(contacts.companyId, companyId) : undefined))
      .orderBy(asc(contacts.lastName))
      .limit(1000),
  )
}
