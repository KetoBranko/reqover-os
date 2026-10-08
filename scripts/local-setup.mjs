// LOCAL DEVELOPMENT ONLY: writes .env.local with a random JWT secret and the
// matching anon/service_role keys for the local Supabase Auth server.
import { createHmac, randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'

const target = new URL('../.env.local', import.meta.url)
if (existsSync(target) && !process.argv.includes('--force')) {
  console.log('.env.local existiert bereits (mit --force überschreiben).')
  process.exit(0)
}

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')
const sign = (payload, secret) => {
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`
}

const secret = randomBytes(32).toString('hex')
const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600
const anon = sign({ iss: 'supabase-local', role: 'anon', exp }, secret)
const service = sign({ iss: 'supabase-local', role: 'service_role', exp }, secret)

writeFileSync(
  target,
  `APP_ENV=development
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}
SUPABASE_SERVICE_ROLE_KEY=${service}
DATABASE_URL=postgres://app_server:local-app-server@127.0.0.1:54322/reqover
MIGRATION_DATABASE_URL=postgres://postgres@127.0.0.1:54322/reqover
AI_PROVIDER=none
STT_PROVIDER=browser
LOCAL_JWT_SECRET=${secret}
`,
)
console.log('.env.local geschrieben.')
