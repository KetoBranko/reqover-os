// Helpers for database tests against the local test database (reqover_test).
// Users are inserted directly into auth.users with the admin connection; every
// assertion then runs through the app's real RLS context (withUserTx).
import postgres from 'postgres'
import { randomUUID } from 'node:crypto'
import type { RequestContext } from '@/server/db/context'

export const admin = postgres(process.env.TEST_ADMIN_DATABASE_URL!, { max: 2, onnotice: () => {} })

export interface TestUser {
  id: string
  email: string
  claims: Record<string, unknown>
}

export async function createUser(name = 'Test'): Promise<TestUser> {
  const id = randomUUID()
  const email = `${name.toLowerCase()}-${id.slice(0, 8)}@test.local`
  await admin`insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${email},
            ${admin.json({ display_name: name, first_name: name })}, now(), now())`
  return { id, email, claims: { sub: id, role: 'authenticated', email } }
}

/** Creates an organization owned by the user, exactly as onboarding does. */
export async function createOrgFor(user: TestUser, name = 'Testorg'): Promise<RequestContext> {
  const [row] = await admin.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(user.claims)}, true), set_config('role', 'authenticated', true)`
    return tx`select private.create_my_organization(${name}, ${`org-${randomUUID().slice(0, 12)}`}) as id`
  })
  return { userId: user.id, organizationId: row!.id as string, claims: user.claims }
}

export async function addMember(ctxOrgId: string, user: TestUser, role: 'admin' | 'member'): Promise<RequestContext> {
  await admin`insert into public.memberships (organization_id, user_id, role) values (${ctxOrgId}, ${user.id}, ${role})`
  return { userId: user.id, organizationId: ctxOrgId, claims: user.claims }
}

/** Drizzle wraps driver errors ("Failed query: …"); match the Postgres message in the cause. */
export async function expectDbError(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  let caught: unknown
  try {
    await promise
  } catch (error) {
    caught = error
  }
  if (!caught) throw new Error(`Erwarteter Datenbankfehler ${pattern} ist nicht aufgetreten.`)
  const err = caught as { message?: string; cause?: { message?: string } }
  const text = `${err.message ?? ''} ${err.cause?.message ?? ''}`
  if (!pattern.test(text)) throw new Error(`Fehler passt nicht zu ${pattern}: ${text}`)
}
