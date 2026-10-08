import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withUserTx, type RequestContext } from '@/server/db/context'
import { closeDb } from '@/server/db/client'
import { companyInput, discoveryStart, opportunityInput, opportunityMove, signalInput, taskInput } from '@/domain/schemas'
import { createCompany } from '@/server/services/companies'
import { completeDiscovery, setSignal, startDiscovery } from '@/server/services/discovery'
import { createOpportunity, moveOpportunity } from '@/server/services/opportunities'
import { createTask } from '@/server/services/tasks'
import { getOverview, getPreparation, getValidation } from '@/server/services/overview'
import { berlinDay } from '@/lib/format'
import { admin, createOrgFor, createUser } from '../support/db'

let a: RequestContext
let b: RequestContext
let companyId: string
let opportunityId: string
const today = berlinDay()

beforeAll(async () => {
  a = await createOrgFor(await createUser('OverA'), 'Over A')
  b = await createOrgFor(await createUser('OverB'), 'Over B')
})

afterAll(async () => {
  await closeDb()
  await admin.end()
})

describe('Übersicht', () => {
  it('leere Organisation: keine Aktionen, Kennzahlen 0, kein „seit letztem Besuch“', async () => {
    const o = await getOverview(a)
    expect(o.items).toEqual([])
    expect(o.kpis).toMatchObject({ targetCompanies: 0, discoveriesCompleted: 0, pipelineCount: 0, pipelineValueCents: 0, tasksDue: 0 })
    expect(o.validation.interviews).toBe(0)
    expect(o.changes).toBeNull()
  })

  it('priorisiert aus echten Daten und aktualisiert Kennzahlen', async () => {
    companyId = (await withUserTx(a, (tx) => createCompany(tx, a, companyInput.parse({ name: 'Priofirma', status: 'qualified' })))).id
    const d = await withUserTx(a, (tx) => startDiscovery(tx, a, discoveryStart.parse({ companyId, mode: 'document' })))
    await withUserTx(a, (tx) => setSignal(tx, signalInput.parse({ discoveryId: d.id, signal: 'signal_problem_confirmed', value: 'yes' })))
    await withUserTx(a, (tx) => completeDiscovery(tx, a, d.id))
    opportunityId = (
      await withUserTx(a, (tx) =>
        createOpportunity(tx, a, opportunityInput.parse({ companyId, title: 'Pilot', stageKey: 'pilot_opportunity', valueCents: 250000, nextStep: 'Rückruf', nextStepDate: today })),
      )
    ).id
    await withUserTx(a, (tx) => createTask(tx, a, taskInput.parse({ title: 'Ohne Firma', dueDate: '2020-01-01' })))

    const o = await getOverview(a)
    expect(o.items.map((i) => i.title)).toEqual(['Priofirma', 'Ohne Firma'])
    expect(o.items[0]).toMatchObject({ companyId, high: true })
    expect(o.items[0]!.reasons.map((r) => r.code).sort()).toEqual(['followup_today', 'late_stage', 'need_confirmed'])
    expect(o.kpis).toMatchObject({
      targetCompanies: 1,
      qualifiedCompanies: 1,
      discoveriesCompleted: 1,
      needConfirmed: 1,
      pilotOpportunities: 1,
      pipelineCount: 1,
      pipelineValueCents: 250000,
      tasksDue: 1,
      tasksOverdue: 1,
    })
    expect(o.counts).toEqual({ tasksToday: 0, tasksOverdue: 1, followupsToday: 1, followupsOverdue: 0 })
  })

  it('Validierung zählt Pilotangebote auch nach späterem Verlust', async () => {
    expect((await getValidation(a)).proposed).toBe(0)
    await withUserTx(a, (tx) => moveOpportunity(tx, a, opportunityMove.parse({ id: opportunityId, stageKey: 'proposal' })))
    expect((await getValidation(a)).proposed).toBe(1)
    await withUserTx(a, (tx) => moveOpportunity(tx, a, opportunityMove.parse({ id: opportunityId, stageKey: 'lost', lostReason: 'Budget' })))
    const v = await getValidation(a)
    expect(v).toMatchObject({ interviews: 1, companies: 1, proposed: 1, won: 0 })
    expect(v.signals[0]).toMatchObject({ yes: 1 })
  })

  it('„Seit deinem letzten Besuch“ bleibt über den Tag stabil', async () => {
    const yesterday = new Date(Date.now() - 26 * 3600_000)
    await admin`update profiles set last_seen_at = ${yesterday}, last_briefing_at = null where id = ${a.userId}`
    const first = await getOverview(a)
    expect(first.changes?.since.toISOString()).toBe(yesterday.toISOString())
    expect(first.changes!.byType.reduce((s, c) => s + c.count, 0)).toBeGreaterThan(0)
    const again = await getOverview(a)
    expect(again.changes?.since.toISOString()).toBe(yesterday.toISOString())
  })

  it('Vorbereitung liefert Gründe, letztes Discovery und offene Kernfragen', async () => {
    const p = await getPreparation(a, companyId)
    expect(p.latestDiscovery).not.toBeNull()
    expect(p.openCoreQuestions.length).toBe(p.coreQuestionCount)
    expect(p.coreQuestionCount).toBeGreaterThan(0)
  })

  it('Mandantentrennung: andere Organisation sieht nichts davon', async () => {
    const o = await getOverview(b)
    expect(o.items).toEqual([])
    expect(o.kpis).toMatchObject({ targetCompanies: 0, discoveriesCompleted: 0, tasksDue: 0 })
    expect((await getValidation(b)).interviews).toBe(0)
    const p = await getPreparation(b, companyId)
    expect(p).toMatchObject({ priority: null, latestDiscovery: null, openDiscoveries: 0 })
  })
})
