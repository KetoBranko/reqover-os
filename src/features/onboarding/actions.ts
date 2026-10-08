'use server'

import { sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getSession } from '@/server/auth/session'
import { withClaimsTx } from '@/server/db/context'
import { fail, type ActionResult } from '@/lib/result'
import { slugify } from '@/lib/slug'
import { logger } from '@/server/logger'

const schema = z.object({ name: z.string().trim().min(2, 'Mindestens 2 Zeichen.').max(120, 'Höchstens 120 Zeichen.') })

export async function createOrganization(_: unknown, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail('unauthenticated', 'Bitte melde dich an.')
  if (session.organization) redirect('/')

  const parsed = schema.safeParse({ name: form.get('name') })
  if (!parsed.success) {
    return fail('validation', 'Bitte prüfe die Eingabe.', { fieldErrors: { name: parsed.error.issues[0]!.message } })
  }
  const base = slugify(parsed.data.name) || 'organisation'
  const slug = `${base}-${crypto.randomUUID().slice(0, 6)}`
  try {
    const claims = { sub: session.userId, role: 'authenticated', email: session.email }
    await withClaimsTx(claims, (tx) => tx.execute(sql`select private.create_my_organization(${parsed.data.name}, ${slug})`))
  } catch (error) {
    logger.error('onboarding.create_organization_failed', { error })
    return fail('internal', 'Die Organisation konnte nicht angelegt werden. Bitte versuche es erneut.')
  }
  redirect('/')
}
