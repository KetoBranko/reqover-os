'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { runAction } from '@/server/action'
import { withUserTx } from '@/server/db/context'
import { idInput, opportunityInput, opportunityMove, opportunityUpdate, uuid } from '@/domain/schemas'
import { createOpportunity, deleteOpportunity, moveOpportunity, updateOpportunity } from '@/server/services/opportunities'

export async function createOpportunityAction(input: unknown) {
  const result = await runAction(opportunityInput, input, (s, data) =>
    withUserTx(s.ctx, (tx) => createOpportunity(tx, s.ctx, data)).then((o) => ({ id: o.id })),
  )
  if (result.ok) refresh()
  return result
}

export async function updateOpportunityAction(input: unknown) {
  const schema = z.object({ id: uuid, data: opportunityUpdate })
  const result = await runAction(schema, input, (s, { id, data }) => withUserTx(s.ctx, (tx) => updateOpportunity(tx, id, data)).then(() => undefined))
  if (result.ok) refresh()
  return result
}

export async function moveOpportunityAction(input: unknown) {
  const result = await runAction(opportunityMove, input, (s, data) => withUserTx(s.ctx, (tx) => moveOpportunity(tx, s.ctx, data)).then(() => undefined))
  if (result.ok) refresh()
  return result
}

export async function deleteOpportunityAction(input: unknown) {
  const result = await runAction(idInput, input, (s, { id }) => withUserTx(s.ctx, (tx) => deleteOpportunity(tx, id)))
  if (result.ok) refresh()
  return result
}
