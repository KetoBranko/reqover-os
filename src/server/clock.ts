import 'server-only'
import { cookies } from 'next/headers'
import { env } from '@/server/env'

export const TEST_CLOCK_COOKIE = 'prorendo-testzeit'

/**
 * Current time for a request. Only automated tests (APP_ENV=test) may move it,
 * via a cookie, to check day-dependent behaviour such as "tomorrow's briefing".
 */
export async function requestNow(): Promise<Date> {
  if (env().APP_ENV === 'test') {
    const value = (await cookies()).get(TEST_CLOCK_COOKIE)?.value
    const at = value ? new Date(value) : null
    if (at && !Number.isNaN(at.getTime())) return at
  }
  return new Date()
}
