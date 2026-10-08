'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { runAction } from '@/server/action'
import { withUserTx } from '@/server/db/context'
import { companyInput, idInput, insightInput, HYPOTHESIS_STATUSES, uuid } from '@/domain/schemas'
import { createCompany, deleteCompany, updateCompany } from '@/server/services/companies'
import { createInsight, deleteInsight, updateInsight } from '@/server/services/insights'

export async function createCompanyAction(input: unknown) {
  const result = await runAction(companyInput, input, (s, data) => withUserTx(s.ctx, (tx) => createCompany(tx, s.ctx, data)).then((c) => ({ id: c.id })))
  if (result.ok) refresh()
  return result
}

export async function updateCompanyAction(input: unknown) {
  const schema = z.object({ id: uuid, data: companyInput.partial() })
  const result = await runAction(schema, input, (s, { id, data }) => withUserTx(s.ctx, (tx) => updateCompany(tx, s.ctx, id, data)).then(() => undefined))
  if (result.ok) refresh()
  return result
}

export async function deleteCompanyAction(input: unknown) {
  const result = await runAction(idInput, input, (s, { id }) => withUserTx(s.ctx, (tx) => deleteCompany(tx, id)))
  return result
}

export async function createInsightAction(input: unknown) {
  const result = await runAction(insightInput, input, (s, data) => withUserTx(s.ctx, (tx) => createInsight(tx, s.ctx, data)).then(() => undefined))
  if (result.ok) refresh()
  return result
}

export async function updateInsightAction(input: unknown) {
  const schema = z.object({
    id: uuid,
    statement: z.string().trim().min(1).max(2000).optional(),
    hypothesisStatus: z.enum(HYPOTHESIS_STATUSES).optional(),
  })
  const result = await runAction(schema, input, (s, { id, ...data }) => withUserTx(s.ctx, (tx) => updateInsight(tx, id, data)).then(() => undefined))
  if (result.ok) refresh()
  return result
}

export async function deleteInsightAction(input: unknown) {
  const result = await runAction(idInput, input, (s, { id }) => withUserTx(s.ctx, (tx) => deleteInsight(tx, id)))
  if (result.ok) refresh()
  return result
}
