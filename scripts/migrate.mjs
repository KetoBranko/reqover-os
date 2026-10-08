// Applies db/migrations/*.sql in order, once each, inside a transaction per file.
// Uses MIGRATION_DATABASE_URL (admin connection). Run: npm run db:migrate
import { readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import postgres from 'postgres'

// Hosted deployments may give only SUPABASE_DB_PASSWORD; the URL is then built
// for Supabase's session pooler (keep in sync with src/server/env.ts).
function migrationUrl() {
  if (process.env.MIGRATION_DATABASE_URL) return process.env.MIGRATION_DATABASE_URL
  const password = process.env.SUPABASE_DB_PASSWORD
  const host = process.env.SUPABASE_POOLER_HOST
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
  if (!password || !host || !ref) return undefined
  return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:5432/postgres?sslmode=require`
}

const url = migrationUrl()
if (!url) {
  console.error('MIGRATION_DATABASE_URL bzw. SUPABASE_DB_PASSWORD fehlt (siehe .env.example).')
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
