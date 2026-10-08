import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { withUserTx, type RequestContext } from '@/server/db/context'
import { auditLogs, companies, contacts, domainEvents, organizations } from '@/server/db/schema'
import { closeDb, rawDb } from '@/server/db/client'
import { addMember, admin, createOrgFor, createUser, expectDbError } from '../support/db'

let a: RequestContext
let b: RequestContext
let aMember: RequestContext
let bCompanyId: string

beforeAll(async () => {
  a = await createOrgFor(await createUser('Anna'), 'Org A')
  b = await createOrgFor(await createUser('Bernd'), 'Org B')
  aMember = await addMember(a.organizationId, await createUser('Mia'), 'member')
  const [row] = await withUserTx(b, (tx) =>
    tx.insert(companies).values({ organizationId: b.organizationId, name: 'Geheim GmbH' }).returning({ id: companies.id }),
  )
  bCompanyId = row!.id
})

afterAll(async () => {
  await admin.end()
  await closeDb()
})

describe('tenant isolation (RLS)', () => {
  it('does not show another tenant’s companies', async () => {
    const rows = await withUserTx(a, (tx) => tx.select().from(companies))
    expect(rows.find((r) => r.id === bCompanyId)).toBeUndefined()
  })

  it('rejects inserts into another tenant', async () => {
    await expectDbError(withUserTx(a, (tx) => tx.insert(companies).values({ organizationId: b.organizationId, name: 'Eindringling' })), /row-level security/)
  })

  it('rejects references to another tenant’s rows (composite FK)', async () => {
    await expectDbError(withUserTx(a, (tx) =>
        tx.insert(contacts).values({ organizationId: a.organizationId, companyId: bCompanyId, lastName: 'Quer' }),
      ), /foreign key/)
  })

  it('cannot update or delete another tenant’s rows', async () => {
    const updated = await withUserTx(a, (tx) =>
      tx.update(companies).set({ name: 'Übernommen' }).where(eq(companies.id, bCompanyId)).returning(),
    )
    expect(updated).toHaveLength(0)
    const deleted = await withUserTx(a, (tx) => tx.delete(companies).where(eq(companies.id, bCompanyId)).returning())
    expect(deleted).toHaveLength(0)
  })

  it('only sees its own organization', async () => {
    const rows = await withUserTx(a, (tx) => tx.select().from(organizations))
    expect(rows.map((r) => r.id)).toEqual([a.organizationId])
  })

  it('denies everything without a role context (server login role has no table rights)', async () => {
    await expectDbError(rawDb().select().from(companies), /permission denied/)
  })

  it('denies unauthenticated (no claims) access', async () => {
    const anonymous: RequestContext = { userId: '', organizationId: a.organizationId, claims: {} }
    const rows = await withUserTx(anonymous, (tx) => tx.select().from(companies))
    expect(rows).toHaveLength(0)
  })
})

describe('roles', () => {
  it('lets members create but not delete companies', async () => {
    const [row] = await withUserTx(aMember, (tx) =>
      tx.insert(companies).values({ organizationId: a.organizationId, name: 'Mitglied AG' }).returning(),
    )
    const deleted = await withUserTx(aMember, (tx) => tx.delete(companies).where(eq(companies.id, row!.id)).returning())
    expect(deleted).toHaveLength(0)
    const ownerDeleted = await withUserTx(a, (tx) => tx.delete(companies).where(eq(companies.id, row!.id)).returning())
    expect(ownerDeleted).toHaveLength(1)
  })

  it('prevents a second organization per user via onboarding', async () => {
    await expectDbError(withUserTx(a, (tx) => tx.execute(sql`select private.create_my_organization('Zweite', 'zweite-org')`)), /already belongs/)
  })
})

describe('audit log and events', () => {
  it('records actor, changed fields and proposal id', async () => {
    const proposalId = crypto.randomUUID()
    const [row] = await withUserTx(a, (tx) =>
      tx.insert(companies).values({ organizationId: a.organizationId, name: 'Audit KG' }).returning(),
    )
    await withUserTx(a, (tx) => tx.update(companies).set({ status: 'qualified' }).where(eq(companies.id, row!.id)), {
      actor: 'ai',
      proposalId,
    })
    const logs = await withUserTx(a, (tx) => tx.select().from(auditLogs).where(eq(auditLogs.recordId, row!.id)).orderBy(auditLogs.id))
    expect(logs.map((l) => l.action)).toEqual(['insert', 'update'])
    expect(logs[1]).toMatchObject({
      actor: 'ai',
      proposalId,
      actorId: a.userId,
      changedFields: ['status'],
      oldValues: { status: 'researched' },
      newValues: { status: 'qualified' },
    })
  })

  it('does not let users write or alter the audit log', async () => {
    await expectDbError(withUserTx(a, (tx) =>
        tx.execute(sql`insert into public.audit_logs (organization_id, table_name, record_id, action, actor)
          values (${a.organizationId}, 'x', gen_random_uuid(), 'insert', 'human')`),
      ), /permission denied/)
    await expectDbError(withUserTx(a, (tx) => tx.execute(sql`delete from public.audit_logs`)), /permission denied/)
  })

  it('keeps domain events append-only and bound to the acting user', async () => {
    await withUserTx(a, (tx) =>
      tx.insert(domainEvents).values({ organizationId: a.organizationId, type: 'COMPANY_CREATED', payload: {}, actor: 'human', actorId: a.userId }),
    )
    await expectDbError(withUserTx(a, (tx) =>
        tx.insert(domainEvents).values({ organizationId: a.organizationId, type: 'COMPANY_CREATED', payload: {}, actor: 'human', actorId: b.userId }),
      ), /row-level security/)
    await expectDbError(withUserTx(a, (tx) => tx.execute(sql`update public.domain_events set type = 'X_X_X'`)), /permission denied/)
  })
})

describe('schema hygiene', () => {
  it('has RLS enabled on every table in public', async () => {
    const rows = await admin`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`
    expect(rows.map((r) => r.relname)).toEqual([])
  })

  it('grants anon nothing', async () => {
    const rows = await admin`select table_name, privilege_type from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'`
    expect(rows).toEqual([])
  })
})
