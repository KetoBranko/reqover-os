import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withUserTx, type RequestContext } from '@/server/db/context'
import { closeDb } from '@/server/db/client'
import { companyInput, contactInput, insightInput, taskInput } from '@/domain/schemas'
import { createCompany, deleteCompany, getCompany360, listCompanies, updateCompany } from '@/server/services/companies'
import { createContact } from '@/server/services/contacts'
import { createTask, listTasks, setTaskDone } from '@/server/services/tasks'
import { listTimeline, recordActivity } from '@/server/services/activities'
import { createInsight } from '@/server/services/insights'
import { globalSearch } from '@/server/services/search'
import { addMember, admin, createOrgFor, createUser, expectDbError } from '../support/db'

let owner: RequestContext
let member: RequestContext
let stranger: RequestContext

beforeAll(async () => {
  owner = await createOrgFor(await createUser('Inhaber'), 'Org A')
  member = await addMember(owner.organizationId, await createUser('Mitglied'), 'member')
  stranger = await createOrgFor(await createUser('Fremd'), 'Org B')
})

afterAll(async () => {
  await closeDb()
  await admin.end()
})

const company = (name: string, extra: Record<string, unknown> = {}) => companyInput.parse({ name, ...extra })

describe('Unternehmen', () => {
  it('legt an, schreibt Audit und Event, und findet per Suche', async () => {
    const c = await withUserTx(owner, (tx) => createCompany(tx, owner, company('Kesselbau Nordlicht GmbH', { industry: 'Anlagenbau', city: 'Bremen' })))
    const audit = await admin`select actor, action from audit_logs where table_name = 'companies' and record_id = ${c.id}`
    expect(audit).toEqual([{ actor: 'human', action: 'insert' }])
    const events = await admin`select type from domain_events where organization_id = ${owner.organizationId} and payload->>'companyId' = ${c.id}`
    expect(events.map((e) => e.type)).toContain('COMPANY_CREATED')

    const { items, total } = await listCompanies(owner, { q: 'nordlicht' })
    expect(total).toBe(1)
    expect(items[0]?.id).toBe(c.id)
    expect((await listCompanies(owner, { q: 'Anlagenbau' })).total).toBe(1)
  })

  it('Statuswechsel erzeugt eine Aktivität im Verlauf', async () => {
    const c = await withUserTx(owner, (tx) => createCompany(tx, owner, company('Statuswechsel AG')))
    await withUserTx(owner, (tx) => updateCompany(tx, owner, c.id, { status: 'qualified' }))
    const { items } = await listTimeline(owner, { companyId: c.id })
    expect(items.map((a) => a.activity.type)).toEqual(['stage_change'])
    expect(items[0]?.activity.title).toBe('Status: Recherchiert → Qualifiziert')
  })

  it('ist für andere Organisationen unsichtbar und nicht änderbar', async () => {
    const c = await withUserTx(owner, (tx) => createCompany(tx, owner, company('Geheim GmbH')))
    expect(await getCompany360(stranger, c.id)).toBeNull()
    expect((await listCompanies(stranger, { q: 'Geheim' })).total).toBe(0)
    await expect(withUserTx(stranger, (tx) => updateCompany(tx, stranger, c.id, { name: 'Übernommen' }))).rejects.toThrow()
    expect(await globalSearch(stranger, 'Geheim')).toEqual([])
  })

  it('Mitglieder dürfen nicht löschen, Inhaber schon (inkl. abhängiger Daten)', async () => {
    const c = await withUserTx(owner, (tx) => createCompany(tx, owner, company('Löschtest KG')))
    await withUserTx(owner, (tx) => createContact(tx, owner, contactInput.parse({ companyId: c.id, lastName: 'Weg' })))
    await expect(withUserTx(member, (tx) => deleteCompany(tx, c.id))).rejects.toThrow(/Administratoren/)
    await withUserTx(owner, (tx) => deleteCompany(tx, c.id))
    const [left] = await admin`select count(*)::int as n from contacts where company_id = ${c.id}`
    expect(left?.n).toBe(0)
  })
})

describe('Kontakte, Aufgaben, Aktivitäten', () => {
  it('360°-Sicht bündelt Kontakte, Aufgaben, Fakten und letzten Kontakt', async () => {
    const c = await withUserTx(owner, (tx) => createCompany(tx, owner, company('Rundumblick GmbH')))
    const k = await withUserTx(owner, (tx) => createContact(tx, owner, contactInput.parse({ companyId: c.id, firstName: 'Mara', lastName: 'Beispiel', email: 'mara@example.invalid' })))
    // Task with only a contact: the company is derived from the contact.
    const t = await withUserTx(owner, (tx) => createTask(tx, owner, taskInput.parse({ title: 'Rückruf Mara', contactId: k.id, dueDate: '2026-10-09' })))
    expect(t.companyId).toBe(c.id)
    await withUserTx(owner, (tx) => recordActivity(tx, owner, { type: 'call', title: 'Anruf', companyId: c.id, contactId: k.id, occurredAt: new Date('2026-10-07T09:00:00Z') }))
    await withUserTx(owner, (tx) => recordActivity(tx, owner, { type: 'note', title: 'Interne Notiz', companyId: c.id, occurredAt: new Date('2026-10-08T09:00:00Z') }))
    await withUserTx(owner, (tx) => createInsight(tx, owner, insightInput.parse({ companyId: c.id, kind: 'hypothesis', statement: 'Backlog vermutlich > 50 Angebote' })))

    const view = await getCompany360(owner, c.id)
    expect(view?.contacts.map((x) => x.lastName)).toEqual(['Beispiel'])
    expect(view?.openTasks.map((x) => x.title)).toEqual(['Rückruf Mara'])
    expect(view?.insights[0]?.hypothesisStatus).toBe('open')
    // A note is not customer contact; the call is.
    expect(view?.lastContactAt?.toISOString()).toBe('2026-10-07T09:00:00.000Z')

    const hits = await globalSearch(owner, 'Mara')
    expect(hits.map((h) => h.kind).sort()).toEqual(['contact', 'task'])
  })

  it('Aufgabe erledigen dokumentiert genau einmal', async () => {
    const t = await withUserTx(owner, (tx) => createTask(tx, owner, taskInput.parse({ title: 'Einmal erledigen' })))
    await withUserTx(owner, (tx) => setTaskDone(tx, owner, t.id, true))
    await withUserTx(owner, (tx) => setTaskDone(tx, owner, t.id, true))
    const rows = await admin`select count(*)::int as n from activities where task_id = ${t.id} and type = 'task'`
    expect(rows[0]?.n).toBe(1)
    const done = await listTasks(owner, { status: 'done' })
    expect(done.some((x) => x.task.id === t.id)).toBe(true)
  })

  it('verhindert Verknüpfungen über Organisationsgrenzen', async () => {
    const foreign = await withUserTx(stranger, (tx) => createCompany(tx, stranger, company('Fremdfirma')))
    await expectDbError(
      withUserTx(owner, (tx) => createContact(tx, owner, contactInput.parse({ companyId: foreign.id, lastName: 'Einschleuser' }))),
      /foreign key|violates/,
    )
  })

  it('Suche ignoriert Platzhalterzeichen und zu kurze Eingaben', async () => {
    expect(await globalSearch(owner, '%')).toEqual([])
    expect(await globalSearch(owner, '%%')).toEqual([])
    expect(await globalSearch(owner, '__')).toEqual([])
  })
})
