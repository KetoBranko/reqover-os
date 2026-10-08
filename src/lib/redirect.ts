/** Only internal redirect targets are allowed (no open redirects via //host or /\\host). */
export function safeNext(value: string | null | undefined): string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/'
}
