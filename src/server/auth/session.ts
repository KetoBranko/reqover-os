import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { eq } from 'drizzle-orm'
import { supabaseServer } from './supabase'
import { memberships, organizations, profiles } from '@/server/db/schema'
import { withClaimsTx, type RequestContext } from '@/server/db/context'
import { parseOrganizationSettings, type OrganizationSettings } from '@/domain/settings'

export interface AppSession {
  userId: string
  email: string | null
  displayName: string
  firstName: string | null
  lastSeenAt: Date | null
  organization: { id: string; name: string; role: 'owner' | 'admin' | 'member'; settings: OrganizationSettings } | null
  ctx: RequestContext | null
}

/**
 * Verified session for the current request (deduplicated per render).
 * The JWT is verified by Supabase Auth (getClaims); the membership is read
 * under RLS with the user's own claims.
 */
export const getSession = cache(async (): Promise<AppSession | null> => {
  // Session data is per request by definition; never part of a prerendered shell.
  await connection()
  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) return null
  const claims = data.claims as unknown as Record<string, unknown> & { sub: string; email?: string }

  const rows = await withClaimsTx(claims, (tx) =>
    tx
      .select({
        displayName: profiles.displayName,
        firstName: profiles.firstName,
        lastSeenAt: profiles.lastSeenAt,
        orgId: organizations.id,
        orgName: organizations.name,
        orgSettings: organizations.settings,
        role: memberships.role,
      })
      .from(profiles)
      .leftJoin(memberships, eq(memberships.userId, profiles.id))
      .leftJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(eq(profiles.id, claims.sub))
      .orderBy(memberships.createdAt)
      .limit(1),
  )
  const row = rows[0]
  const organization =
    row?.orgId && row.orgName && row.role
      ? { id: row.orgId, name: row.orgName, role: row.role, settings: parseOrganizationSettings(row.orgSettings) }
      : null

  return {
    userId: claims.sub,
    email: claims.email ?? null,
    displayName: row?.displayName ?? '',
    firstName: row?.firstName ?? null,
    lastSeenAt: row?.lastSeenAt ?? null,
    organization,
    ctx: organization ? { userId: claims.sub, organizationId: organization.id, claims } : null,
  }
})

export type ActiveSession = AppSession & {
  organization: NonNullable<AppSession['organization']>
  ctx: RequestContext
}

/** For pages: redirects to login or setup when needed. */
export async function requireSession(): Promise<ActiveSession> {
  const session = await getSession()
  if (!session) redirect('/anmelden')
  if (!session.organization || !session.ctx) redirect('/einrichtung')
  return session as ActiveSession
}

/** For server actions: returns null instead of redirecting. */
export async function actionSession(): Promise<ActiveSession | null> {
  const session = await getSession()
  if (!session?.organization || !session.ctx) return null
  return session as ActiveSession
}
