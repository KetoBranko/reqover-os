'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import type { ActionResult, ActionError } from '@/lib/result'

/**
 * Runs a server action with pending state, German toasts and field errors.
 * Returns the result so callers can react (close dialog, navigate).
 */
export function useAction<I, O>(action: (input: I) => Promise<ActionResult<O>>, opts: { success?: string } = {}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<ActionError | null>(null)

  function run(input: I): Promise<ActionResult<O>> {
    setError(null)
    return new Promise((resolve) => {
      startTransition(async () => {
        let result: ActionResult<O>
        try {
          result = await action(input)
        } catch {
          result = { ok: false, error: { code: 'internal', message: 'Verbindung fehlgeschlagen. Bitte versuche es erneut.' } }
        }
        if (result.ok) {
          if (opts.success) toast.success(opts.success)
        } else {
          setError(result.error)
          if (!result.error.fieldErrors && result.error.code !== 'needs_confirmation') toast.error(result.error.message)
        }
        resolve(result)
      })
    })
  }

  return { run, pending, error, fieldErrors: error?.fieldErrors ?? {}, reset: () => setError(null) }
}
