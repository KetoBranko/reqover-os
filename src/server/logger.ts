import 'server-only'

// Structured JSON logging. Never log secrets, tokens or full personal data;
// pass ids and error objects, not request bodies.
type Level = 'debug' | 'info' | 'warn' | 'error'

function serialize(meta: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    out[k] = v instanceof Error ? { name: v.name, message: v.message, stack: v.stack?.split('\n').slice(0, 5).join('\n') } : v
  }
  return out
}

function log(level: Level, event: string, meta: Record<string, unknown> = {}) {
  if (level === 'debug' && process.env.APP_ENV === 'production') return
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...serialize(meta) })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (event: string, meta?: Record<string, unknown>) => log('debug', event, meta),
  info: (event: string, meta?: Record<string, unknown>) => log('info', event, meta),
  warn: (event: string, meta?: Record<string, unknown>) => log('warn', event, meta),
  error: (event: string, meta?: Record<string, unknown>) => log('error', event, meta),
}
