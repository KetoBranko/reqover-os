import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withUserTx, type RequestContext } from '@/server/db/context'
import { closeDb } from '@/server/db/client'
import { companyInput, opportunityInput } from '@/domain/schemas'
import { createCompany } from '@/server/services/companies'
import { createOpportunity } from '@/server/services/opportunities'
import { ask, getConversation } from '@/server/services/assistant'
import { applyProposal, getProposal } from '@/server/services/proposals'
import { runTool } from '@/server/ai/assistant-tools'
import { listTasks } from '@/server/services/tasks'
import type { ProposalAction } from '@/domain/ai'
import { admin, createOrgFor, createUser } from '../support/db'

let a: RequestContext
let b: RequestContext
let companyId: string

beforeAll(async () => {
  a = await createOrgFor(await createUser('AssiA'), 'Assi A')
  b = await createOrgFor(await createUser('AssiB'), 'Assi B')
  companyId = (await withUserTx(a, (tx) => createCompany(tx, a, companyInput.parse({ name: 'Fragefirma' })))).id
})

afterAll(async () => {
  await closeDb()
  await admin.end()
})

describe('Assistent (Testmodus)', () => {
  it('Lese-Werkzeuge sehen nur Daten der eigenen Organisation', async () => {
    const own = await runTool(a, 'suche', { begriff: 'Fragefirma' })
    expect(own).toMatchObject({ kind: 'read', result: [expect.objectContaining({ id: companyId, name: 'Fragefirma' })] })
    expect(await runTool(b, 'suche', { begriff: 'Fragefirma' })).toEqual({ kind: 'read', result: { hinweis: 'Keine Treffer.' } })
    expect(await runTool(b, 'unternehmen_kontext', { unternehmenId: companyId })).toEqual({ kind: 'error', message: 'Unternehmen nicht gefunden.' })
    expect(await runTool(b, 'notiz_vorschlagen', { unternehmenId: companyId, text: 'x' })).toMatchObject({ kind: 'error' })
  })

  it('ungültige Eingaben und unbekannte Werkzeuge werden abgelehnt', async () => {
    expect(await runTool(a, 'loesche_alles', {})).toMatchObject({ kind: 'error' })
    expect(await runTool(a, 'unternehmen_kontext', { unternehmenId: 'nope' })).toMatchObject({ kind: 'error', message: expect.stringContaining('unternehmenId') })
  })

  it('beantwortet Fragen aus Daten und nennt die Quelle', async () => {
    const r = await ask(a, { conversationId: null, text: 'Was muss ich heute machen?', aiLevel: 2, firstName: 'Test' })
    const c = (await getConversation(a, r.conversationId))!
    expect(c.entries.map((e) => e.role)).toEqual(['user', 'assistant'])
    expect(c.entries[1]).toMatchObject({ sources: ['Priorisierung'], proposal: null })
    expect(c.entries[1]!.text).toMatch(/^Testmodus:/)
    // Another organisation cannot open this conversation.
    expect(await getConversation(b, r.conversationId)).toBeNull()
    await expect(ask(b, { conversationId: r.conversationId, text: 'Hallo', aiLevel: 2, firstName: null })).rejects.toThrow()
  })

  it('Änderungen entstehen nur als Vorschlag und erst nach Bestätigung', async () => {
    const r = await ask(a, { conversationId: null, text: 'Lege eine Aufgabe an: Angebot an Fragefirma schicken für morgen', aiLevel: 2, firstName: null })
    expect(r.proposalId).toBeTruthy()
    const before = await listTasks(a, { status: 'open', limit: 100 })
    expect(before.some((t) => t.task.title === 'Angebot an Fragefirma schicken')).toBe(false)

    const p = (await getProposal(a, r.proposalId!))!
    expect(p.proposal).toMatchObject({ status: 'pending', source: 'assistant', discoveryId: null, conversationId: r.conversationId })
    expect(p.actions).toEqual([expect.objectContaining({ type: 'task.create', title: 'Angebot an Fragefirma schicken' })])
    await expect(getProposal(b, r.proposalId!)).resolves.toBeNull()

    await applyProposal(a, { proposalId: r.proposalId!, accepted: p.actions })
    const after = await listTasks(a, { status: 'open', limit: 100 })
    expect(after.some((t) => t.task.title === 'Angebot an Fragefirma schicken')).toBe(true)
    const [audit] = await admin`select actor, proposal_id from audit_logs where table_name = 'tasks' and proposal_id = ${r.proposalId!} limit 1`
    expect(audit).toMatchObject({ actor: 'ai' })
  })

  it('„Gewonnen“ ohne Auftrag nur mit ausdrücklicher Entscheidung', async () => {
    const o = await withUserTx(a, (tx) => createOpportunity(tx, a, opportunityInput.parse({ companyId, title: 'Pilot Fragefirma', stageKey: 'proposal' })))
    const tool = await runTool(a, 'phase_vorschlagen', { chanceId: o.id, phase: 'won', grund: null })
    expect(tool).toMatchObject({ kind: 'proposal', confirmation: expect.stringContaining('keine bestätigte Beauftragung') })
    expect(await runTool(a, 'phase_vorschlagen', { chanceId: o.id, phase: 'lost', grund: null })).toMatchObject({ kind: 'error' })
    if (tool.kind !== 'proposal') throw new Error('expected proposal')

    const [row] = await admin`insert into ai_action_proposals (organization_id, source, summary, actions, model, requested_by)
      values (${a.organizationId}, 'assistant', 'Test', ${admin.json([{ ...tool.action, id: 'a1' }] as never)}, 'testmodus', ${a.userId}) returning id`
    const id = row!.id as string
    const action = { ...tool.action, id: 'a1' } as ProposalAction
    await expect(applyProposal(a, { proposalId: id, accepted: [action] })).rejects.toMatchObject({ code: 'needs_confirmation' })
    const [still] = await admin`select s.key from opportunities o join pipeline_stages s on s.id = o.stage_id where o.id = ${o.id}`
    expect(still).toEqual({ key: 'proposal' })

    await applyProposal(a, { proposalId: id, accepted: [{ ...action, wonWithoutOrder: true } as ProposalAction] })
    const [won] = await admin`select s.key, o.won_without_order from opportunities o join pipeline_stages s on s.id = o.stage_id where o.id = ${o.id}`
    expect(won).toEqual({ key: 'won', won_without_order: true })
  })
})
