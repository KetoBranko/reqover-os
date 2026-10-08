'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { runAction } from '@/server/action'
import { uuid } from '@/domain/schemas'
import { ask, startConversation } from '@/server/services/assistant'
import { enforceLimit } from '@/server/rate-limit'

export async function askAction(input: unknown) {
  return runAction(z.object({ conversationId: uuid.nullable(), text: z.string().trim().min(1, 'Bitte eine Frage eingeben.').max(4000) }), input, async (s, data) => {
    enforceLimit(`ai:${s.userId}`, 20, 'Zu viele Anfragen in kurzer Zeit. Bitte kurz warten.')
    const r = await ask(s.ctx, { ...data, aiLevel: s.organization.settings.aiLevel, firstName: s.firstName ?? null })
    refresh()
    return r
  })
}

export async function newConversationAction(input: unknown) {
  return runAction(z.object({}), input, async (s) => {
    const id = await startConversation(s.ctx)
    refresh()
    return { conversationId: id }
  })
}
