import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withUserTx, type RequestContext } from '@/server/db/context'
import { closeDb } from '@/server/db/client'
import { companyInput, discoveryNotes, discoveryStart, opportunityInput } from '@/domain/schemas'
import { createCompany } from '@/server/services/companies'
import { createOpportunity } from '@/server/services/opportunities'
import { getDiscovery, startDiscovery, updateDiscoveryNotes } from '@/server/services/discovery'
import { analyzeDiscovery, applyProposal, getProposal, rejectProposal } from '@/server/services/proposals'
import { listTasks } from '@/server/services/tasks'
import type { ProposalAction } from '@/domain/ai'
import { admin, createOrgFor, createUser } from '../support/db'

let a: RequestContext
let b: RequestContext
let companyId: string

const NOTES =
  'Gespräch mit Thomas war gut. Die machen ungefähr 30 bis 40 Angebote im Monat. Nachverfolgung macht jeder Außendienstler selbst, da bleiben Sachen liegen. Datenschutz ist ein Thema. Ich soll ihn nächste Woche anrufen. Ein Pilot wäre denkbar.'

async function newDiscovery(notes = NOTES) {
  const d = await withUserTx(a, (tx) => startDiscovery(tx, a, discoveryStart.parse({ companyId, mode: 'document' })))
  await withUserTx(a, (tx) => updateDiscoveryNotes(tx, d.id, discoveryNotes.parse({ rawNotes: notes })))
  return d.id
}

beforeAll(async () => {
  a = await createOrgFor(await createUser('PropA'), 'Prop A')
  b = await createOrgFor(await createUser('PropB'), 'Prop B')
  companyId = (await withUserTx(a, (tx) => createCompany(tx, a, companyInput.parse({ name: 'Analysefirma' })))).id
})

afterAll(async () => {
  await closeDb()
  await admin.end()
})

describe('AI-Vorschläge (Testmodus)', () => {
  it('Analyse speichert nur einen Vorschlag und ändert das Gespräch nicht', async () => {
    const id = await newDiscovery()
    const proposalId = await analyzeDiscovery(a, id, 2)
    const p = (await getProposal(a, proposalId))!
    expect(p.proposal).toMatchObject({ status: 'pending', source: 'discovery_extraction', model: 'testmodus', discoveryId: id })
    const types = p.actions.map((x) => x.type)
    expect(types).toEqual(expect.arrayContaining(['discovery.field', 'discovery.answer', 'discovery.signal', 'evidence.score', 'insight.create', 'task.create', 'opportunity.create']))
    expect(p.actions.find((x) => x.type === 'discovery.answer')).toMatchObject({ questionKey: 'quotes_per_month', value: { min: 30, max: 40 }, quoteVerified: true })

    const d = (await getDiscovery(a, id))!
    expect(d.interview.summary).toBeNull()
    expect(d.answers).toEqual({})
    expect(d.total.rated).toBe(0)
  })

  it('ohne Notizen keine Analyse; Level < 2 keine Analyse', async () => {
    const empty = await newDiscovery('kurz')
    await expect(analyzeDiscovery(a, empty, 2)).rejects.toThrow(/fehlen Notizen/)
    const id = await newDiscovery()
    await expect(analyzeDiscovery(a, id, 1)).rejects.toThrow(/deaktiviert/)
  })

  it('übernimmt nur ausgewählte, bearbeitete Punkte; Audit zeigt AI + Bestätigung', async () => {
    const id = await newDiscovery()
    const proposalId = await analyzeDiscovery(a, id, 2)
    const p = (await getProposal(a, proposalId))!
    const pick = (t: ProposalAction['type']) => p.actions.find((x) => x.type === t)!
    const task = pick('task.create') as Extract<ProposalAction, { type: 'task.create' }>
    const answer = pick('discovery.answer')
    const problem = p.actions.find((x) => x.type === 'evidence.score' && x.category === 'problem')!
    const signal = pick('discovery.signal')
    const opp = pick('opportunity.create')

    const res = await applyProposal(a, { proposalId, accepted: [{ ...task, title: 'Thomas anrufen (bearbeitet)' }, answer, problem, signal, opp] })
    expect(res).toMatchObject({ status: 'partially_applied', accepted: 5 })

    const d = (await getDiscovery(a, id))!
    expect(d.answers['quotes_per_month']).toMatchObject({ value: { min: 30, max: 40 }, source: 'ai' })
    expect(d.interview.signalProblemConfirmed).toBe('yes')
    expect(d.interview.summary).toBeNull() // not accepted
    expect(d.interview.opportunityId).not.toBeNull()
    expect(d.evidence.find((e) => e.category === 'problem')).toMatchObject({ points: 2, suggestedBy: 'ai' })
    const tasks = await listTasks(a, { companyId })
    expect(tasks.find((t) => t.task.title === 'Thomas anrufen (bearbeitet)')?.task).toMatchObject({ origin: 'ai', discoveryId: id })

    const [opp2] = await admin`select o.title, s.key from opportunities o join pipeline_stages s on s.id = o.stage_id where o.id = ${d.interview.opportunityId}`
    expect(opp2).toMatchObject({ key: 'need_confirmed' }) // signal applied first

    const audit = await admin`select actor, proposal_id, table_name from audit_logs where proposal_id = ${proposalId}`
    expect(audit.length).toBeGreaterThan(0)
    expect(new Set(audit.map((r) => r.actor))).toEqual(new Set(['ai']))
    const [prop] = await admin`select status, decided_by, decisions from ai_action_proposals where id = ${proposalId}`
    expect(prop).toMatchObject({ status: 'partially_applied', decided_by: a.userId })
    expect(prop!.decisions.edited).toEqual([task.id])
    const [act] = await admin`select title, actor, body from activities where discovery_id = ${id} and type = 'ai_action'`
    expect(act!.title).toBe(`AI-Vorschlag übernommen: 5 von ${p.actions.length} Änderungen`)
    expect(act!.body).toContain('bestätigt durch dich')

    await expect(applyProposal(a, { proposalId, accepted: [] })).rejects.toThrow(/bereits entschieden/)
  })

  it('lehnt manipulierte Aktionen ab (Typ, Frage, unpassender Wert)', async () => {
    const id = await newDiscovery()
    const proposalId = await analyzeDiscovery(a, id, 2)
    const p = (await getProposal(a, proposalId))!
    const answer = p.actions.find((x) => x.type === 'discovery.answer')!
    await expect(applyProposal(a, { proposalId, accepted: [{ ...answer, value: 'kein Bereich' }] })).rejects.toThrow(/ungültig verändert/)
    await expect(applyProposal(a, { proposalId, accepted: [{ ...answer, id: 'a999' }] })).rejects.toThrow(/ungültig verändert/)
    const field = p.actions.find((x) => x.type === 'discovery.field')!
    const sneaky = { ...field, type: 'task.create', title: 'x', dueDate: null, context: null } as ProposalAction
    await expect(applyProposal(a, { proposalId, accepted: [sneaky] })).rejects.toThrow(/ungültig verändert/)
    // Nothing was applied by the failed attempts.
    expect((await getProposal(a, proposalId))!.proposal.status).toBe('pending')
  })

  it('bestehende offene Chance: nächster Schritt aktualisiert sie statt eine neue anzulegen', async () => {
    const c2 = (await withUserTx(a, (tx) => createCompany(tx, a, companyInput.parse({ name: 'Mit Chance' })))).id
    const opp = await withUserTx(a, (tx) => createOpportunity(tx, a, opportunityInput.parse({ companyId: c2, title: 'Bestehend' })))
    const d = await withUserTx(a, (tx) => startDiscovery(tx, a, discoveryStart.parse({ companyId: c2, mode: 'document' })))
    await withUserTx(a, (tx) => updateDiscoveryNotes(tx, d.id, discoveryNotes.parse({ rawNotes: NOTES })))
    const p = (await getProposal(a, await analyzeDiscovery(a, d.id, 2)))!
    expect(p.actions.some((x) => x.type === 'opportunity.create')).toBe(false)
    const step = p.actions.find((x) => x.type === 'opportunity.next_step')!
    expect(step).toMatchObject({ opportunityId: opp.id, nextStep: 'Pilotumfang abstimmen' })
    await applyProposal(a, { proposalId: p.proposal.id, accepted: [step] })
    const [row] = await admin`select next_step from opportunities where id = ${opp.id}`
    expect(row!.next_step).toBe('Pilotumfang abstimmen')
  })

  it('Verwerfen ändert nichts; neue Analyse ersetzt offene Vorschläge', async () => {
    const id = await newDiscovery()
    const first = await analyzeDiscovery(a, id, 2)
    const second = await analyzeDiscovery(a, id, 2)
    expect((await getProposal(a, first))!.proposal.status).toBe('rejected')
    expect(await rejectProposal(a, second)).toMatchObject({ status: 'rejected', accepted: 0 })
    expect((await getDiscovery(a, id))!.interview.signalProblemConfirmed).toBe('unclear')
  })

  it('Mandantentrennung: fremde Organisation kann weder lesen noch anwenden noch analysieren', async () => {
    const id = await newDiscovery()
    const proposalId = await analyzeDiscovery(a, id, 2)
    expect(await getProposal(b, proposalId)).toBeNull()
    await expect(applyProposal(b, { proposalId, accepted: [] })).rejects.toThrow()
    await expect(analyzeDiscovery(b, id, 2)).rejects.toThrow()
    expect((await getProposal(a, proposalId))!.proposal.status).toBe('pending')
  })
})
