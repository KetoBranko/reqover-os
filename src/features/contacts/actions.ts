'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { runAction } from '@/server/action'
import { withUserTx } from '@/server/db/context'
import { contactInput, idInput, uuid } from '@/domain/schemas'
import { createContact, deleteContact, updateContact } from '@/server/services/contacts'

export async function createContactAction(input: unknown) {
  const result = await runAction(contactInput, input, (s, data) => withUserTx(s.ctx, (tx) => createContact(tx, s.ctx, data)).then((c) => ({ id: c.id })))
  if (result.ok) refresh()
  return result
}

export async function updateContactAction(input: unknown) {
  const schema = z.object({ id: uuid, data: contactInput.partial() })
  const result = await runAction(schema, input, (s, { id, data }) => withUserTx(s.ctx, (tx) => updateContact(tx, id, data)).then(() => undefined))
  if (result.ok) refresh()
  return result
}

export async function deleteContactAction(input: unknown) {
  return runAction(idInput, input, (s, { id }) => withUserTx(s.ctx, (tx) => deleteContact(tx, id)))
}
