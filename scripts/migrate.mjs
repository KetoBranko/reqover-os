// Applies db/migrations/*.sql in order, once each, inside a transaction per file.
// Uses MIGRATION_DATABASE_URL (admin connection). Run: npm run db:migrate
import { readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import postgres from 'postgres'

const url = process.env.MIGRATION_DATABASE_URL
if (!url) {
  console.error('MIGRATION_DATABASE_URL fehlt (siehe .env.example).')
  process.exit(1)
}

const dir = new URL('../db/migrations/', import.meta.url)
const sql = postgres(url, { max: 1, onnotice: () => {} })

try {
  await sql`create schema if not exists app_migrations`
  await sql`create table if not exists app_migrations.applied (
    name text primary key, checksum text not null, applied_at timestamptz not null default now())`
  const applied = new Map((await sql`select name, checksum from app_migrations.applied`).map((r) => [r.name, r.checksum]))

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const body = readFileSync(new URL(file, dir), 'utf8')
    const checksum = createHash('sha256').update(body).digest('hex')
    if (applied.has(file)) {
      if (applied.get(file) !== checksum) {
        throw new Error(`Migration ${file} wurde nach dem Anwenden verändert. Neue Migration anlegen statt alte ändern.`)
      }
      continue
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(body)
      await tx`insert into app_migrations.applied (name, checksum) values (${file}, ${checksum})`
    })
    console.log(`angewendet: ${file}`)
  }
  console.log('Migrationen aktuell.')
} finally {
  await sql.end()
}
