// Uniform result type for server actions: never throw raw errors to the client.
export type ActionErrorCode =
  | 'validation'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'needs_confirmation'
  | 'unavailable'
  | 'rate_limited'
  | 'internal'

export interface ActionError {
  code: ActionErrorCode
  message: string
  fieldErrors?: Record<string, string>
  /** Extra data for needs_confirmation flows (e.g. data-quality warnings). */
  details?: Record<string, unknown>
}

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ActionError }

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data })
export const fail = (code: ActionErrorCode, message: string, extra: Omit<ActionError, 'code' | 'message'> = {}): ActionResult<never> => ({
  ok: false,
  error: { code, message, ...extra },
})
