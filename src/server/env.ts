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
  STT_PROVIDER: z.enum(['openai', 'browser', 'fake']).default('browser'),
  OPENAI_API_KEY: z.string().optional(),
  STT_MODEL: z.string().default('gpt-4o-transcribe'),
})

export type ServerEnv = z.infer<typeof schema>

let cached: ServerEnv | undefined

export function env(): ServerEnv {
  if (cached) return cached
  const parsed = schema.safeParse(process.env)
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
