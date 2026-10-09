import 'server-only'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '@/server/env'
import * as schema from './schema'

type Db = PostgresJsDatabase<typeof schema>

const globalForDb = globalThis as unknown as { prorendoSql?: postgres.Sql; prorendoDb?: Db }

// One pool per server process (kept across dev hot reloads).
// prepare: false keeps us compatible with Supabase's transaction pooler.
function create(): Db {
  const sql = postgres(env().DATABASE_URL, { max: 10, prepare: false, idle_timeout: 20 })
  globalForDb.prorendoSql = sql
  return drizzle(sql, { schema })
}

/**
 * Raw database handle. Do NOT use for user requests: it runs without RLS
 * context. Use withUserTx() from ./context instead.
 */
export function rawDb(): Db {
  globalForDb.prorendoDb ??= create()
  return globalForDb.prorendoDb
}

/** Closes the pool (tests and scripts only). */
export async function closeDb() {
  await globalForDb.prorendoSql?.end()
  globalForDb.prorendoDb = undefined
  globalForDb.prorendoSql = undefined
}

export type { Db }
