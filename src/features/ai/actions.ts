'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { runAction } from '@/server/action'
import { uuid } from '@/domain/schemas'
import { proposalDecision } from '@/domain/ai'
import { analyzeDiscovery, applyProposal, rejectProposal } from '@/server/services/proposals'
import { enforceLimit } from '@/server/rate-limit'

export async function analyzeDiscoveryAction(input: unknown) {
  return runAction(z.object({ id: uuid }), input, (s, { id }) => {
    enforceLimit(`ai:${s.userId}`, 20, 'Zu viele Anfragen in kurzer Zeit. Bitte kurz warten.')
    return analyzeDiscovery(s.ctx, id, s.organization.settings.aiLevel).then((proposalId) => ({ proposalId }))
  })
}

export async function applyProposalAction(input: unknown) {
  return runAction(proposalDecision, input, async (s, data) => {
    const r = await applyProposal(s.ctx, data)
    refresh()
    return r
  })
}

export async function rejectProposalAction(input: unknown) {
  return runAction(z.object({ id: uuid }), input, async (s, { id }) => {
    const r = await rejectProposal(s.ctx, id)
    refresh()
    return r
  })
}
