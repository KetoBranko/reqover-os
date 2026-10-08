import 'server-only'
import { and, eq } from 'drizzle-orm'
import { companies } from '@/server/db/schema'
import { withUserTx, type RequestContext } from '@/server/db/context'

/** True when the tenant contains seed data; the UI then shows a permanent demo banner. */
export async function hasDemoData(ctx: RequestContext): Promise<boolean> {
  const rows = await withUserTx(ctx, (tx) =>
    tx
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.organizationId, ctx.organizationId), eq(companies.isDemo, true)))
      .limit(1),
  )
  return rows.length > 0
}
