import 'server-only'
import { z } from 'zod'

// Validated server environment. Secrets are read only here and never exported
// to client components (this module is server-only).
const schema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  DATABASE_URL: z.string().startsWith('postgres'),
  AI_PROVIDER: z.enum(['anthropic', 'none', 'fake']).default('none'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL_EXTRACTION: z.string().default('claude-sonnet-5-5'),
  AI_MODEL_ASSISTANT: z.string().default('claude-sonnet-5-5'),
  STT_PROVIDER: z.enum(['browser', 'openai', 'none', 'fake']).default('browser'),
  OPENAI_API_KEY: z.string().optional(),
  STT_MODEL: z.string().default('gpt-4o-transcribe'),
})

export type ServerEnv = z.infer<typeof schema>

let cached: ServerEnv | undefined

/**
 * Hosted deployments may give only the database password (SUPABASE_DB_PASSWORD)
 * instead of a full connection string; the URL is then built for Supabase's
 * transaction pooler from the project ref and SUPABASE_POOLER_HOST.
 * Keep in sync with scripts/migrate.mjs.
 */
function databaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const password = process.env.SUPABASE_DB_PASSWORD
  const host = process.env.SUPABASE_POOLER_HOST
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
  if (!password || !host || !ref) return undefined
  return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:6543/postgres?sslmode=require`
}

export function env(): ServerEnv {
  if (cached) return cached
  // Claude Code cloud environments do not pass ANTHROPIC_API_KEY through to sessions,
  // so the key may also be stored as PRORENDO_ANTHROPIC_API_KEY (or the older
  // REQOVER_ANTHROPIC_API_KEY from before the rename).
  const parsed = schema.safeParse({
    ...process.env,
    DATABASE_URL: databaseUrl(),
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || process.env.PRORENDO_ANTHROPIC_API_KEY || process.env.REQOVER_ANTHROPIC_API_KEY,
  })
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`Ungültige oder fehlende Umgebungsvariablen: ${fields}. Siehe .env.example.`)
  }
  // Test doubles must never run outside automated tests.
  if (parsed.data.APP_ENV !== 'test' && (parsed.data.AI_PROVIDER === 'fake' || parsed.data.STT_PROVIDER === 'fake')) {
    throw new Error('Test-Provider sind nur mit APP_ENV=test erlaubt.')
  }
  cached = parsed.data
  return cached
}
