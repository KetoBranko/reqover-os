import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { withUserTx, type RequestContext } from '@/server/db/context'
import { closeDb } from '@/server/db/client'
import { companyInput, taskInput } from '@/domain/schemas'
import { createCompany } from '@/server/services/companies'
import { createTask } from '@/server/services/tasks'
import { deleteOrganization, exportOrganization, getAuditLog, getSettings, removeDemoData, renameOrganization, updateAiLevel, updatePilotOffer } from '@/server/services/settings'
import { runTool, toolDefinitions } from '@/server/ai/assistant-tools'
import { aiStatus } from '@/server/ai/provider'
import { addMember, admin, createOrgFor, createUser } from '../support/db'

let owner: RequestContext
let member: RequestContext
let other: RequestContext

beforeAll(async () => {
  owner = await createOrgFor(await createUser('SetOwner'), 'Einstellungsfirma')
  member = await addMember(owner.organizationId, await createUser('SetMember'), 'member')
  other = await createOrgFor(await createUser('SetOther'), 'Andere Firma')
})

afterAll(async () => {
  await closeDb()
  await admin.end()
})

describe('Einstellungen', () => {
  it('nur Inhaber und Admins ändern Organisation, AI-Stufe und Pilotangebot', async () => {
    await expect(updateAiLevel(member, 'member', 1)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(renameOrganization(member, 'member', 'X')).rejects.toMatchObject({ code: 'forbidden' })
    // Even if the app-level check were bypassed, RLS turns the update into "0 rows" and the service refuses.
    await expect(renameOrganization(member, 'admin', 'X')).rejects.toMatchObject({ code: 'forbidden' })
    expect((await getSettings(owner)).name).toBe('Einstellungsfirma')

    await updateAiLevel(owner, 'owner', 1)
    await updatePilotOffer(owner, 'owner', { maxCases: 50, durationWeeks: 4, priceMinCents: 100_000, priceMaxCents: 200_000 })
    await expect(updatePilotOffer(owner, 'owner', { maxCases: 50, durationWeeks: 4, priceMinCents: 300_000, priceMaxCents: 200_000 })).rejects.toMatchObject({ code: 'validation' })
    const s = await getSettings(member)
    expect(s.settings).toMatchObject({ aiLevel: 1, pilotOffer: { maxCases: 50, durationWeeks: 4 } })
    expect(s.members.map((m) => m.role).sort()).toEqual(['member', 'owner'])
  })

  it('AI-Stufe 1: Assistent liest, schlägt aber nichts vor; Stufe 0: aus', async () => {
    expect(aiStatus(1, 1)).toMatchObject({ available: true })
    expect(aiStatus(1, 2)).toMatchObject({ available: false })
    expect(aiStatus(0, 1)).toMatchObject({ available: false, reason: expect.stringContaining('ausgeschaltet') })
    const names = toolDefinitions(false).map((t) => t.name)
    expect(names).toContain('suche')
    expect(names).not.toContain('aufgabe_vorschlagen')
    expect(await runTool(owner, 'aufgabe_vorschlagen', { titel: 'x', faellig: null, unternehmenId: null, kontext: null }, false)).toMatchObject({ kind: 'error' })
  })

  it('Änderungsprotokoll zeigt Mensch, Feldänderungen und nur die eigene Organisation', async () => {
    const c = await withUserTx(owner, (tx) => createCompany(tx, owner, companyInput.parse({ name: 'Protokollfirma' })))
    await withUserTx(owner, (tx) => tx.execute(sql`update public.companies set city = 'Bremen' where id = ${c.id}`))
    const log = await getAuditLog(owner, { table: 'companies' })
    const update = log.entries.find((e) => e.recordId === c.id && e.action === 'update')!
    expect(update).toMatchObject({ actor: 'human', actorName: 'SetOwner', label: 'Protokollfirma' })
    expect(update.changes).toEqual([{ field: 'city', from: null, to: 'Bremen' }])
    expect((await getAuditLog(other, { table: 'companies' })).entries.some((e) => e.recordId === c.id)).toBe(false)
  })

  it('Export: vollständig, nur eigene Organisation, nur für Inhaber/Admins', async () => {
    await expect(exportOrganization(member, 'member')).rejects.toMatchObject({ code: 'forbidden' })
    await withUserTx(other, (tx) => createCompany(tx, other, companyInput.parse({ name: 'Fremdfirma' })))
    const data = (await exportOrganization(owner, 'owner')) as unknown as Record<string, { name?: string }[]> & { organisation: { name: string } }
    expect(data.organisation.name).toBe('Einstellungsfirma')
    expect(data.unternehmen!.map((c) => c.name)).toContain('Protokollfirma')
    expect(data.unternehmen!.map((c) => c.name)).not.toContain('Fremdfirma')
    expect(data.aenderungsprotokoll!.length).toBeGreaterThan(0)
  })

  it('Demo-Daten entfernen lässt echte Daten stehen', async () => {
    const demo = await withUserTx(owner, (tx) => createCompany(tx, owner, companyInput.parse({ name: 'Demofirma' })))
    await admin`update public.companies set is_demo = true where id = ${demo.id}`
    await withUserTx(owner, (tx) => createTask(tx, owner, taskInput.parse({ title: 'Demo-Aufgabe', companyId: demo.id })))
    await expect(removeDemoData(member, 'member')).rejects.toMatchObject({ code: 'forbidden' })
    const counts = await removeDemoData(owner, 'owner')
    expect(counts.companies).toBe(1)
    const names = (await admin`select name from public.companies where organization_id = ${owner.organizationId}`).map((r) => r.name)
    expect(names).toContain('Protokollfirma')
    expect(names).not.toContain('Demofirma')
    expect(await admin`select 1 from public.tasks where title = 'Demo-Aufgabe' and organization_id = ${owner.organizationId}`).toHaveLength(0)
  })

  it('Organisation löschen: nur Inhaber, nur mit richtigem Namen, entfernt alles inkl. Protokoll', async () => {
    await expect(deleteOrganization(member, 'member', 'Einstellungsfirma')).rejects.toMatchObject({ code: 'forbidden' })
    // The database function checks the role itself, independent of the app.
    await expect(deleteOrganization(member, 'owner', 'Einstellungsfirma')).rejects.toThrow()
    await expect(deleteOrganization(owner, 'owner', 'Falscher Name')).rejects.toMatchObject({ code: 'validation' })

    await deleteOrganization(owner, 'owner', 'Einstellungsfirma')
    const org = owner.organizationId
    for (const table of ['organizations', 'companies', 'memberships', 'tasks']) {
      const col = table === 'organizations' ? 'id' : 'organization_id'
      expect(await admin`select 1 from ${admin(table)} where ${admin(col)} = ${org}`).toHaveLength(0)
    }
    expect(await admin`select 1 from public.audit_logs where organization_id = ${org}`).toHaveLength(0)
    expect(await admin`select 1 from public.domain_events where organization_id = ${org}`).toHaveLength(0)
    expect(await admin`select 1 from public.companies where organization_id = ${other.organizationId}`).toHaveLength(1)
  })
})
