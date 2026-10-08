'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { runAction } from '@/server/action'
import { pilotOfferSchema } from '@/domain/settings'
import { deleteOrganization, removeDemoData, renameOrganization, updateAiLevel, updatePilotOffer, updateProfile } from '@/server/services/settings'
import { supabaseServer } from '@/server/auth/supabase'

const name = (max: number, msg: string) => z.string().trim().min(1, msg).max(max, `Höchstens ${max} Zeichen.`)

export async function updateProfileAction(input: unknown) {
  return runAction(z.object({ displayName: name(120, 'Bitte einen Namen angeben.'), firstName: z.string().trim().max(80).transform((v) => v || null) }), input, async (s, data) => {
    await updateProfile(s.ctx, data)
    refresh()
  })
}

export async function renameOrganizationAction(input: unknown) {
  return runAction(z.object({ name: name(200, 'Bitte einen Namen angeben.') }), input, async (s, data) => {
    await renameOrganization(s.ctx, s.organization.role, data.name)
    refresh()
  })
}

export async function updateAiLevelAction(input: unknown) {
  return runAction(z.object({ aiLevel: z.union([z.literal(0), z.literal(1), z.literal(2)]) }), input, async (s, data) => {
    await updateAiLevel(s.ctx, s.organization.role, data.aiLevel)
    refresh()
  })
}

export async function updatePilotOfferAction(input: unknown) {
  return runAction(pilotOfferSchema, input, async (s, data) => {
    await updatePilotOffer(s.ctx, s.organization.role, data)
    refresh()
  })
}

export async function removeDemoDataAction(input: unknown) {
  return runAction(z.object({}), input, async (s) => {
    const counts = await removeDemoData(s.ctx, s.organization.role)
    refresh()
    return counts
  })
}

export async function deleteOrganizationAction(input: unknown) {
  const r = await runAction(z.object({ confirmName: z.string() }), input, async (s, data) => {
    await deleteOrganization(s.ctx, s.organization.role, data.confirmName)
    const supabase = await supabaseServer()
    await supabase.auth.signOut()
  })
  if (r.ok) redirect('/anmelden')
  return r
}
