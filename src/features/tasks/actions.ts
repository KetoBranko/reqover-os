'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { runAction } from '@/server/action'
import { withUserTx } from '@/server/db/context'
import { idInput, taskInput, uuid } from '@/domain/schemas'
import { createTask, deleteTask, setTaskDone, updateTask } from '@/server/services/tasks'

export async function createTaskAction(input: unknown) {
  const result = await runAction(taskInput, input, (s, data) => withUserTx(s.ctx, (tx) => createTask(tx, s.ctx, data)).then((t) => ({ id: t.id })))
  if (result.ok) refresh()
  return result
}

export async function updateTaskAction(input: unknown) {
  const schema = z.object({ id: uuid, data: taskInput.partial() })
  const result = await runAction(schema, input, (s, { id, data }) => withUserTx(s.ctx, (tx) => updateTask(tx, id, data)).then(() => undefined))
  if (result.ok) refresh()
  return result
}

export async function setTaskDoneAction(input: unknown) {
  const schema = z.object({ id: uuid, done: z.boolean() })
  const result = await runAction(schema, input, (s, { id, done }) =>
    withUserTx(s.ctx, (tx) => setTaskDone(tx, s.ctx, id, done)).then((t) => ({ companyId: t.companyId, contactId: t.contactId, title: t.title })),
  )
  if (result.ok) refresh()
  return result
}

export async function deleteTaskAction(input: unknown) {
  const result = await runAction(idInput, input, (s, { id }) => withUserTx(s.ctx, (tx) => deleteTask(tx, id)))
  if (result.ok) refresh()
  return result
}
