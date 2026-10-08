'use server'

import { z } from 'zod'
import { runAction } from '@/server/action'
import { globalSearch } from '@/server/services/search'

export async function searchAction(input: unknown) {
  return runAction(z.object({ q: z.string().max(100) }), input, (s, { q }) => globalSearch(s.ctx, q))
}
