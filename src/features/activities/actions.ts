'use server'

import { refresh } from 'next/cache'
import { runAction } from '@/server/action'
import { withUserTx } from '@/server/db/context'
import { activityInput } from '@/domain/schemas'
import { recordActivity } from '@/server/services/activities'
import { contacts } from '@/server/db/schema'
import { eq } from 'drizzle-orm'

export async function createActivityAction(input: unknown) {
  const result = await runAction(activityInput, input, (s, data) =>
    withUserTx(s.ctx, async (tx) => {
      let companyId = data.companyId ?? null
      if (!companyId && data.contactId) {
        const [c] = await tx.select({ companyId: contacts.companyId }).from(contacts).where(eq(contacts.id, data.contactId))
        companyId = c?.companyId ?? null
      }
      const row = await recordActivity(tx, s.ctx, {
        ...data,
        companyId,
        occurredAt: data.occurredAt ? new Date(data.occurredAt) : undefined,
      })
      return { id: row.id }
    }),
  )
  if (result.ok) refresh()
  return result
}
