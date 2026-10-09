import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { withUserTx, type RequestContext } from '@/server/db/context'
import { closeDb } from '@/server/db/client'
import { websiteInquiryInput } from '@/domain/schemas'
import { receiveWebsiteInquiry } from '@/server/services/inbound'
import { addMember, admin, createOrgFor, createUser, expectDbError } from '../support/db'
import { sql } from 'drizzle-orm'

let owner: RequestContext
let member: RequestContext
let stranger: RequestContext

beforeAll(async () => {
  owner = await createOrgFor(await createUser('Inhaber'), 'Org Anfragen')
  member = await addMember(owner.organizationId, await createUser('Mitglied'), 'member')
  stranger = await createOrgFor(await createUser('Fremd'), 'Org Fremd')
})

afterEach(() => {
  delete process.env.LEAD_ORGANIZATION_ID
})

afterAll(async () => {
  await closeDb()
  await admin.end()
})

const inquiry = (extra: Record<string, unknown> = {}) =>
  websiteInquiryInput.parse({
    name: 'Petra Maria Schulz',
    company: 'Kesselbau Nordlicht GmbH',
    email: 'p.schulz@nordlicht.example',
    phone: '040 123456',
    topic: 'Offene Angebote',
    message: 'Wir haben rund 200 offene Angebote.',
    ...extra,
  })

describe('Website-Anfragen', () => {
  it('legt Unternehmen, Kontakt, Zeitleiste und Aufgabe beim Inhaber an', async () => {
    process.env.LEAD_ORGANIZATION_ID = owner.organizationId
    expect(await receiveWebsiteInquiry(inquiry())).toBe(true)

    const [company] = await admin`select id, source, created_by from companies
      where organization_id = ${owner.organizationId} and name = 'Kesselbau Nordlicht GmbH'`
    expect(company).toMatchObject({ source: 'Website-Anfrage', created_by: owner.userId })
    const [contact] = await admin`select first_name, last_name, email, phone from contacts where company_id = ${company!.id}`
    expect(contact).toEqual({ first_name: 'Petra Maria', last_name: 'Schulz', email: 'p.schulz@nordlicht.example', phone: '040 123456' })
    const [task] = await admin`select title, priority, assignee_id, origin, status from tasks where company_id = ${company!.id}`
    expect(task).toEqual({
      title: 'Website-Anfrage beantworten: Petra Maria Schulz (Kesselbau Nordlicht GmbH)',
      priority: 'high',
      assignee_id: owner.userId,
      origin: 'system',
      status: 'open',
    })
    const [activity] = await admin`select type, title, body, actor from activities where company_id = ${company!.id}`
    expect(activity).toMatchObject({ type: 'email', title: 'Anfrage über die Website', actor: 'system' })
    expect(activity!.body).toContain('Wir haben rund 200 offene Angebote.')
    const audit = await admin`select distinct actor from audit_logs where record_id = ${company!.id}`
    expect(audit).toEqual([{ actor: 'system' }])
  })

  it('verwendet vorhandenes Unternehmen und vorhandenen Kontakt wieder', async () => {
    process.env.LEAD_ORGANIZATION_ID = owner.organizationId
    await receiveWebsiteInquiry(inquiry({ company: 'kesselbau nordlicht gmbh', email: 'P.SCHULZ@nordlicht.example' }))
    const [{ companies } = { companies: -1 }] = await admin<{ companies: number }[]>`select count(*)::int as companies from companies
      where organization_id = ${owner.organizationId} and lower(name) = 'kesselbau nordlicht gmbh'`
    expect(companies).toBe(1)
    const [{ contacts } = { contacts: -1 }] = await admin<{ contacts: number }[]>`select count(*)::int as contacts from contacts
      where organization_id = ${owner.organizationId} and lower(email) = 'p.schulz@nordlicht.example'`
    expect(contacts).toBe(1)
    const [{ tasks } = { tasks: -1 }] = await admin<{ tasks: number }[]>`select count(*)::int as tasks from tasks
      where organization_id = ${owner.organizationId} and title like 'Website-Anfrage%'`
    expect(tasks).toBe(2)
  })

  it('landet nie in einer fremden Organisation und rät nicht bei mehreren Organisationen', async () => {
    expect(await receiveWebsiteInquiry(inquiry({ company: 'Ohne Ziel AG' }))).toBe(false)
    const rows = await admin`select 1 from companies where name = 'Ohne Ziel AG'`
    expect(rows).toHaveLength(0)
    const [{ n } = { n: -1 }] = await admin<{ n: number }[]>`select count(*)::int as n from companies where organization_id = ${stranger.organizationId}`
    expect(n).toBe(0)
  })

  it('verweigert angemeldeten Nutzern die Abfrage des Empfängers', async () => {
    await expectDbError(
      withUserTx(member, (tx) => tx.execute(sql`select * from private.inquiry_target(${owner.organizationId}::uuid)`)),
      /only for requests without a user session/,
    )
  })

  it('lehnt ungültige Eingaben ab', () => {
    expect(websiteInquiryInput.safeParse({ name: 'A', company: 'B', email: 'kein-mail' }).success).toBe(false)
    expect(websiteInquiryInput.safeParse({ name: 'A', company: 'B', email: 'a@b.de', message: 'x'.repeat(5001) }).success).toBe(false)
  })
})
