'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { runAction } from '@/server/action'
import { withUserTx } from '@/server/db/context'
import { discoveryAnswerInput, discoveryNotes, discoveryStart, evidenceInput, idInput, signalInput, uuid } from '@/domain/schemas'
import {
  completeDiscovery,
  deleteDiscovery,
  endConversation,
  reopenDiscovery,
  saveAnswer,
  setEvidence,
  setSignal,
  startDiscovery,
  updateDiscoveryNotes,
} from '@/server/services/discovery'

export async function startDiscoveryAction(input: unknown) {
  return runAction(discoveryStart, input, (s, data) => withUserTx(s.ctx, (tx) => startDiscovery(tx, s.ctx, data)).then((d) => ({ id: d.id, status: d.status })))
}

// Autosave actions do not refresh the page: the client already shows what was typed.
export async function saveDiscoveryNotesAction(input: unknown) {
  return runAction(z.object({ id: uuid, data: discoveryNotes }), input, (s, { id, data }) => withUserTx(s.ctx, (tx) => updateDiscoveryNotes(tx, id, data)))
}

export async function saveAnswerAction(input: unknown) {
  return runAction(discoveryAnswerInput, input, (s, data) => withUserTx(s.ctx, (tx) => saveAnswer(tx, s.ctx, data)))
}

export async function setSignalAction(input: unknown) {
  return runAction(signalInput, input, (s, data) => withUserTx(s.ctx, (tx) => setSignal(tx, data)))
}

export async function setEvidenceAction(input: unknown) {
  return runAction(evidenceInput, input, (s, data) => withUserTx(s.ctx, (tx) => setEvidence(tx, s.ctx, data)))
}

export async function endConversationAction(input: unknown) {
  const result = await runAction(idInput, input, (s, { id }) => withUserTx(s.ctx, (tx) => endConversation(tx, id)).then(() => undefined))
  if (result.ok) refresh()
  return result
}

export async function completeDiscoveryAction(input: unknown) {
  const result = await runAction(idInput, input, (s, { id }) => withUserTx(s.ctx, (tx) => completeDiscovery(tx, s.ctx, id)).then(() => undefined))
  if (result.ok) refresh()
  return result
}

export async function reopenDiscoveryAction(input: unknown) {
  const result = await runAction(idInput, input, (s, { id }) => withUserTx(s.ctx, (tx) => reopenDiscovery(tx, id)))
  if (result.ok) refresh()
  return result
}

export async function deleteDiscoveryAction(input: unknown) {
  return runAction(idInput, input, (s, { id }) => withUserTx(s.ctx, (tx) => deleteDiscovery(tx, id)))
}
