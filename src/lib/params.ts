export function str(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' && v.length ? v : undefined
}

export function pageNumber(v: string | string[] | undefined): number {
  const n = Number(str(v))
  return Number.isInteger(n) && n > 0 ? n : 1
}

export function oneOf<T extends string>(v: string | string[] | undefined, allowed: readonly T[]): T | undefined {
  const s = str(v)
  return s && (allowed as readonly string[]).includes(s) ? (s as T) : undefined
}
