import { afterAll, describe, expect, it } from 'vitest'
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core'
import { getTableName, is } from 'drizzle-orm'
import { PgTable as PgTableClass } from 'drizzle-orm/pg-core'
import * as schema from '@/server/db/schema'
import { admin } from '../support/db'

afterAll(() => admin.end())

// SQL migrations are the source of truth; the Drizzle mirror must match them.
describe('Drizzle schema matches the database', () => {
  const tables = (Object.values(schema) as unknown[]).filter((v): v is PgTable => is(v, PgTableClass))

  it.each(tables.map((t) => [getTableName(t), t] as const))('%s', async (name, table) => {
    const config = getTableConfig(table)
    const rows = await admin`select column_name, is_nullable from information_schema.columns
      where table_schema = ${config.schema ?? 'public'} and table_name = ${name}`
    const dbColumns = new Map(rows.map((r) => [r.column_name as string, r.is_nullable === 'YES']))
    for (const column of config.columns) {
      expect(dbColumns.has(column.name), `${name}.${column.name} fehlt in der Datenbank`).toBe(true)
      if (config.schema !== 'auth') {
        expect(dbColumns.get(column.name), `${name}.${column.name}: NULL-Verhalten weicht ab`).toBe(!column.notNull)
      }
    }
    if (config.schema !== 'auth') {
      const mirrored = new Set(config.columns.map((c) => c.name))
      const missing = [...dbColumns.keys()].filter((c) => !mirrored.has(c) && c !== 'search')
      expect(missing, `${name}: Spalten fehlen im Drizzle-Schema`).toEqual([])
    }
  })
})
