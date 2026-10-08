import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withUserTx, type RequestContext } from '@/server/db/context'
import { closeDb } from '@/server/db/client'
import { companyInput, opportunityInput } from '@/domain/schemas'
import { createCompany } from '@/server/services/companies'
import { createOpportunity, getBoard, moveOpportunity } from '@/server/services/opportunities'
import { listTimeline } from '@/server/services/activities'
import { admin, createOrgFor, createUser, expectDbError } from '../support/db'

let a: RequestContext
let b: RequestContext
let companyId: string

beforeAll(async () => {
  a = await createOrgFor(await createUser('PipeA'), 'Pipe A')
  b = await createOrgFor(await createUser('PipeB'), 'Pipe B')
  companyId = (await withUserTx(a, (tx) => createCompany(tx, a, companyInput.parse({ name: 'Pipelinefirma' })))).id
})

afterAll(async () => {
  await closeDb()
  await admin.end()
})

const newOpp = (title: string, extra: Record<string, unknown> = {}) =>
  withUserTx(a, (tx) => createOpportunity(tx, a, opportunityInput.parse({ companyId, title, valueCents: 250000, ...extra })))

describe('Vertriebspipeline', () => {
  it('Board zeigt 9 Phasen in Reihenfolge und neue Chancen in „Kontakt aufnehmen“', async () => {
    const o = await newOpp('Pilot A')
    const board = await getBoard(a)
    expect(board.stages.map((s) => s.key)).toEqual([
      'to_contact', 'contacted', 'discovery_scheduled', 'discovery_done', 'need_confirmed', 'pilot_opportunity', 'proposal', 'won', 'lost',
    ])
    const card = board.cards.find((c) => c.id === o.id)
    expect(board.stages.find((s) => s.id === card?.stageId)?.key).toBe('to_contact')
  })

  it('Phasenwechsel schreibt Verlauf und Events', async () => {
    const o = await newOpp('Pilot B')
    await withUserTx(a, (tx) => moveOpportunity(tx, a, { id: o.id, stageKey: 'proposal', orderConfirmedAt: null, lostReason: null, wonWithoutOrder: false }))
    const { items } = await listTimeline(a, { companyId })
    const change = items.find((i) => i.activity.opportunityId === o.id && i.activity.type === 'stage_change')
    expect(change?.activity.title).toBe('Pilot B: Kontakt aufnehmen → Angebot')
    const events = await admin`select type from domain_events where payload->>'opportunityId' = ${o.id}`
    expect(events.map((e) => e.type).sort()).toEqual(['OPPORTUNITY_CREATED', 'OPPORTUNITY_STAGE_CHANGED', 'PILOT_PROPOSED'])
  })

  it('„Gewonnen“ verlangt einen dokumentierten Auftrag', async () => {
    const o = await newOpp('Pilot C')
    await expect(withUserTx(a, (tx) => moveOpportunity(tx, a, { id: o.id, stageKey: 'won', orderConfirmedAt: null, lostReason: null, wonWithoutOrder: false }))).rejects.toMatchObject({
      code: 'needs_confirmation',
      details: { required: 'orderConfirmedAt' },
    })
    await withUserTx(a, (tx) => moveOpportunity(tx, a, { id: o.id, stageKey: 'won', orderConfirmedAt: '2026-10-08', lostReason: null, wonWithoutOrder: false }))
    const [row] = await admin`select closed_at, order_confirmed_at::text from opportunities where id = ${o.id}`
    expect(row?.order_confirmed_at).toBe('2026-10-08')
    expect(row?.closed_at).not.toBeNull()
  })

  it('„Trotzdem als gewonnen“ ist eine ausdrückliche, dokumentierte Entscheidung', async () => {
    const o = await newOpp('Pilot C2')
    await withUserTx(a, (tx) => moveOpportunity(tx, a, { id: o.id, stageKey: 'won', orderConfirmedAt: null, lostReason: null, wonWithoutOrder: true }))
    const [row] = await admin`select won_without_order, order_confirmed_at from opportunities where id = ${o.id}`
    expect(row).toEqual({ won_without_order: true, order_confirmed_at: null })
    const { items } = await listTimeline(a, { companyId })
    expect(items.find((i) => i.activity.opportunityId === o.id && i.activity.type === 'stage_change')?.activity.body).toMatch(/ohne dokumentierte Auftragsbestätigung/)
    // Reopening clears the flag again.
    await withUserTx(a, (tx) => moveOpportunity(tx, a, { id: o.id, stageKey: 'proposal', orderConfirmedAt: null, lostReason: null, wonWithoutOrder: false }))
    const [reopened] = await admin`select won_without_order from opportunities where id = ${o.id}`
    expect(reopened?.won_without_order).toBe(false)
  })

  it('„Verloren“ verlangt einen Grund; Wiedereröffnen setzt closed_at zurück', async () => {
    const o = await newOpp('Pilot D')
    await expect(withUserTx(a, (tx) => moveOpportunity(tx, a, { id: o.id, stageKey: 'lost', orderConfirmedAt: null, lostReason: null, wonWithoutOrder: false }))).rejects.toMatchObject({
      code: 'needs_confirmation',
    })
    await withUserTx(a, (tx) => moveOpportunity(tx, a, { id: o.id, stageKey: 'lost', orderConfirmedAt: null, lostReason: 'Kein Budget', wonWithoutOrder: false }))
    await withUserTx(a, (tx) => moveOpportunity(tx, a, { id: o.id, stageKey: 'contacted', orderConfirmedAt: null, lostReason: null, wonWithoutOrder: false }))
    const [row] = await admin`select closed_at, lost_reason from opportunities where id = ${o.id}`
    expect(row).toEqual({ closed_at: null, lost_reason: null })
  })

  it('Datenbank erzwingt die Regeln auch ohne Service (direktes Update)', async () => {
    const o = await newOpp('Pilot E')
    const [lost] = await admin`select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.organization_id = ${a.organizationId} and s.key = 'lost'`
    await expectDbError(
      withUserTx(a, (tx) => tx.execute(`update opportunities set stage_id = '${lost!.id}' where id = '${o.id}'`)),
      /requires lost_reason/,
    )
    const [won] = await admin`select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.organization_id = ${a.organizationId} and s.key = 'won'`
    await expectDbError(
      withUserTx(a, (tx) => tx.execute(`update opportunities set stage_id = '${won!.id}' where id = '${o.id}'`)),
      /requires order_confirmed_at/,
    )
    // A stage from another organization's pipeline is rejected.
    const [foreign] = await admin`select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.organization_id = ${b.organizationId} and s.key = 'contacted'`
    await expectDbError(withUserTx(a, (tx) => tx.execute(`update opportunities set stage_id = '${foreign!.id}' where id = '${o.id}'`)), /foreign key|stage does not belong/)
  })

  it('Neue Chancen dürfen nicht direkt abgeschlossen starten', async () => {
    await expect(newOpp('Pilot F', { stageKey: 'won' })).rejects.toThrow(/offenen Phase/)
  })

  it('andere Organisationen sehen und bewegen keine fremden Chancen', async () => {
    const o = await newOpp('Pilot G')
    expect((await getBoard(b)).cards).toEqual([])
    await expect(withUserTx(b, (tx) => moveOpportunity(tx, b, { id: o.id, stageKey: 'contacted', orderConfirmedAt: null, lostReason: null, wonWithoutOrder: false }))).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})
