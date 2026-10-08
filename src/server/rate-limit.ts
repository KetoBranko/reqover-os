import 'server-only'
import { DomainError } from '@/server/action'

const buckets = new Map<string, number[]>()

/**
 * Sliding-window limit per key on this server instance. It stops runaway loops
 * and accidental hammering of paid AI/speech providers; it is not a quota system
 * (several instances each keep their own window).
 */
export function hitLimit(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now()
  const list = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  list.push(now)
  buckets.set(key, list)
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k)
  return list.length > max
}

export function enforceLimit(key: string, max: number, message: string, windowMs = 60_000) {
  if (hitLimit(key, max, windowMs)) throw new DomainError('unavailable', message)
}
