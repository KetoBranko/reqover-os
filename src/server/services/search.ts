import 'server-only'
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm'
import { companies, contacts, tasks } from '@/server/db/schema'
import { withUserTx, type RequestContext } from '@/server/db/context'
import { escapeLike } from './companies'

export interface SearchHit {
  kind: 'company' | 'contact' | 'task'
  id: string
  title: string
  subtitle: string | null
  href: string
}

/** Global quick search for the command bar. RLS scopes everything to the caller's organization. */
export async function globalSearch(ctx: RequestContext, rawQuery: string, perKind = 5): Promise<SearchHit[]> {
  const q = rawQuery.trim().slice(0, 100)
  if (q.length < 2) return []
  const like = `%${escapeLike(q)}%`
  return withUserTx(ctx, async (tx) => {
    const [companyRows, contactRows, taskRows] = await Promise.all([
      tx
        .select({ id: companies.id, name: companies.name, industry: companies.industry, city: companies.city })
        .from(companies)
        .where(
          and(
            eq(companies.organizationId, ctx.organizationId),
            or(ilike(companies.name, like), sql`companies.search @@ websearch_to_tsquery('german', ${q})`),
          ),
        )
        .orderBy(sql`${companies.name} ilike ${`${escapeLike(q)}%`} desc`, asc(companies.name))
        .limit(perKind),
      tx
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          jobTitle: contacts.jobTitle,
          companyName: companies.name,
        })
        .from(contacts)
        .innerJoin(companies, eq(companies.id, contacts.companyId))
        .where(
          and(
            eq(contacts.organizationId, ctx.organizationId),
            or(
              ilike(sql`${contacts.firstName} || ' ' || ${contacts.lastName}`, like),
              ilike(contacts.email, like),
              ilike(contacts.jobTitle, like),
            ),
          ),
        )
        .orderBy(asc(contacts.lastName))
        .limit(perKind),
      tx
        .select({ id: tasks.id, title: tasks.title, dueDate: tasks.dueDate })
        .from(tasks)
        .where(and(eq(tasks.organizationId, ctx.organizationId), eq(tasks.status, 'open'), ilike(tasks.title, like)))
        .orderBy(asc(tasks.dueDate))
        .limit(perKind),
    ])
    return [
      ...companyRows.map((c) => ({
        kind: 'company' as const,
        id: c.id,
        title: c.name,
        subtitle: [c.industry, c.city].filter(Boolean).join(' · ') || null,
        href: `/unternehmen/${c.id}`,
      })),
      ...contactRows.map((c) => ({
        kind: 'contact' as const,
        id: c.id,
        title: `${c.firstName} ${c.lastName}`.trim(),
        subtitle: [c.jobTitle, c.companyName].filter(Boolean).join(' · ') || null,
        href: `/kontakte/${c.id}`,
      })),
      ...taskRows.map((t) => ({ kind: 'task' as const, id: t.id, title: t.title, subtitle: t.dueDate, href: '/aufgaben' })),
    ]
  })
}
