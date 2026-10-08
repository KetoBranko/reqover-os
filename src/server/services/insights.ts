import 'server-only'
import { eq } from 'drizzle-orm'
import { insights } from '@/server/db/schema'
import type { RequestContext, Tx, TxOptions } from '@/server/db/context'
import type { InsightInput } from '@/domain/schemas'
import { DomainError } from '@/server/action'
import { de } from '@/i18n/de'

export async function createInsight(tx: Tx, ctx: RequestContext, input: InsightInput, opts: TxOptions = {}) {
  const [row] = await tx
    .insert(insights)
    .values({
      ...input,
      // Hypotheses always carry a validation status; other kinds never do (DB check enforces it too).
      hypothesisStatus: input.kind === 'hypothesis' ? (input.hypothesisStatus ?? 'open') : null,
      organizationId: ctx.organizationId,
      createdBy: ctx.userId,
      actor: opts.actor ?? 'human',
    })
    .returning()
  return row!
}

export async function updateInsight(tx: Tx, id: string, input: Partial<Pick<InsightInput, 'statement' | 'hypothesisStatus' | 'isUncertain'>>) {
  const [row] = await tx.update(insights).set(input).where(eq(insights.id, id)).returning()
  if (!row) throw new DomainError('not_found', de.errors.notFound)
  return row
}

export async function deleteInsight(tx: Tx, id: string) {
  const rows = await tx.delete(insights).where(eq(insights.id, id)).returning({ id: insights.id })
  if (!rows.length) throw new DomainError('forbidden', de.errors.forbidden)
}
