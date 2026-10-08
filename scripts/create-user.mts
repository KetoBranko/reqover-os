// Creates (invites) a user via the Supabase Auth admin API. Sign-up is closed,
// so this is how accounts are created. Requires SUPABASE_SERVICE_ROLE_KEY.
// Usage: npm run user:create -- --email branko@example.com --name "Branko" [--password ...]
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' }, password: { type: 'string' } },
})
if (!values.email || !values.name) {
  console.error('Bitte --email und --name angeben.')
  process.exit(1)
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY werden benötigt.')
  process.exit(1)
}

const password = values.password ?? randomBytes(12).toString('base64url')
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const { data, error } = await admin.auth.admin.createUser({
  email: values.email,
  password,
  email_confirm: true,
  user_metadata: { display_name: values.name, first_name: values.name.split(' ')[0] },
})
if (error) {
  console.error(`Benutzer konnte nicht angelegt werden: ${error.message}`)
  process.exit(1)
}
console.log(`Benutzer angelegt: ${data.user.email} (${data.user.id})`)
if (!values.password) console.log(`Einmal-Passwort: ${password}  (bitte nach der ersten Anmeldung ändern)`)
