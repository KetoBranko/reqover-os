// Prepares an isolated E2E account with its own organization, so test runs never
// touch real or demo data, and removes leftovers from earlier (failed) runs.
import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { E2E_EMAIL, E2E_PASSWORD } from './support'

export default async function globalSetup() {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const dbUrl = process.env.MIGRATION_DATABASE_URL
  if (!url || !serviceKey || !dbUrl) throw new Error('E2E braucht NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY und MIGRATION_DATABASE_URL.')
  if (process.env.APP_ENV === 'production') throw new Error('E2E-Setup läuft nie gegen Produktion.')

  const sql = postgres(dbUrl, { max: 1, onnotice: () => {} })
  try {
    let [user] = await sql`select id from auth.users where email = ${E2E_EMAIL}`
    if (!user) {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
      const { data, error } = await admin.auth.admin.createUser({
        email: E2E_EMAIL,
        password: E2E_PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: 'E2E Test', first_name: 'E2E' },
      })
      if (error) throw error
      user = { id: data.user.id }
    }
    const [membership] = await sql`select organization_id from public.memberships where user_id = ${user.id}`
    if (!membership) {
      await sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: user!.id, role: 'authenticated' })}, true), set_config('role', 'authenticated', true)`
        await tx`select private.create_my_organization('E2E Testorganisation', 'e2e-test')`
      })
    } else {
      await sql`delete from public.companies where organization_id = ${membership.organization_id}`
      await sql`delete from public.tasks where organization_id = ${membership.organization_id}`
      await sql`delete from public.activities where organization_id = ${membership.organization_id}`
    }
  } finally {
    await sql.end()
  }
}
