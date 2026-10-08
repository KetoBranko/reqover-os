import 'server-only'
import { z } from 'zod'
import { actionSession, type ActiveSession } from '@/server/auth/session'
import { fail, ok, type ActionResult } from '@/lib/result'
import { logger } from '@/server/logger'
import { de } from '@/i18n/de'

/** Domain-level error with a user-facing German message. */
export class DomainError extends Error {
  constructor(
    public readonly code: 'not_found' | 'conflict' | 'forbidden' | 'needs_confirmation' | 'validation' | 'unavailable',
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

function pgCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } }
  return e?.cause?.code ?? e?.code
}

/**
 * Wraps every server action: verifies the session, validates input with Zod,
 * maps known errors to German messages and never leaks internals.
 */
export async function runAction<S extends z.ZodType, O>(
  schema: S,
  input: unknown,
  fn: (session: ActiveSession, data: z.infer<S>) => Promise<O>,
): Promise<ActionResult<O>> {
  const session = await actionSession()
  if (!session) return fail('unauthenticated', de.errors.unauthenticated)

  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_'
      fieldErrors[key] ??= issue.message
    }
    return fail('validation', de.errors.validation, { fieldErrors })
  }

  try {
    return ok(await fn(session, parsed.data))
  } catch (error) {
    if (error instanceof DomainError) return fail(error.code, error.message, { details: error.details })
    const code = pgCode(error)
    if (code === '42501') return fail('forbidden', de.errors.forbidden) // RLS / privilege
    if (code === '23503') return fail('not_found', de.errors.notFound) // FK: referenced row not visible
    if (code === '23505') return fail('conflict', 'Dieser Eintrag existiert bereits.')
    if (code === '23514' || code === '22P02') return fail('validation', de.errors.validation)
    logger.error('action.failed', { error, userId: session.userId })
    return fail('internal', de.errors.generic)
  }
}
