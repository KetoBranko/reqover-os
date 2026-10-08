import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withUserTx, type RequestContext } from '@/server/db/context'
import { closeDb } from '@/server/db/client'
import { companyInput, discoveryAnswerInput, discoveryNotes, discoveryStart, evidenceInput } from '@/domain/schemas'
import { createCompany } from '@/server/services/companies'
import {
  completeDiscovery,
  endConversation,
  getDiscovery,
  latestEvidenceByCompany,
  listDiscoveries,
  saveAnswer,
  setEvidence,
  setSignal,
  startDiscovery,
  updateDiscoveryNotes,
} from '@/server/services/discovery'
import { listTimeline } from '@/server/services/activities'
import { EVIDENCE_CATEGORIES } from '@/domain/discovery'
import { admin, createOrgFor, createUser } from '../support/db'

let a: RequestContext
let b: RequestContext
let companyId: string

beforeAll(async () => {
  a = await createOrgFor(await createUser('DiscA'), 'Disc A')
  b = await createOrgFor(await createUser('DiscB'), 'Disc B')
  companyId = (await withUserTx(a, (tx) => createCompany(tx, a, companyInput.parse({ name: 'Discoveryfirma' })))).id
})

afterAll(async () => {
  await closeDb()
  await admin.end()
})

const start = (mode: 'live' | 'document', extra: Record<string, unknown> = {}) =>
  withUserTx(a, (tx) => startDiscovery(tx, a, discoveryStart.parse({ companyId, mode, ...extra })))

describe('Discovery', () => {
  it('Gesprächsmodus startet mit Timer, Beenden misst die Dauer', async () => {
    const d = await start('live')
    expect(d.status).toBe('in_progress')
    expect(d.startedAt).not.toBeNull()
    const ended = await withUserTx(a, (tx) => endConversation(tx, d.id))
    expect(ended.status).toBe('draft')
    expect(ended.durationSeconds).toBeGreaterThanOrEqual(0)
  })

  it('Gespräch dokumentieren übernimmt das Datum', async () => {
    const d = await start('document', { conductedOn: '2026-10-01' })
    expect(d.status).toBe('draft')
    expect(d.conductedAt?.toISOString()).toBe('2026-10-01T10:00:00.000Z')
  })

  it('speichert Antworten typgerecht und lehnt unpassende ab', async () => {
    const d = await start('document')
    await withUserTx(a, (tx) => saveAnswer(tx, a, discoveryAnswerInput.parse({ discoveryId: d.id, questionKey: 'quotes_per_month', value: { min: 30, max: 40 }, verbatim: '30 bis 40 im Monat' })))
    await withUserTx(a, (tx) => saveAnswer(tx, a, discoveryAnswerInput.parse({ discoveryId: d.id, questionKey: 'involved_parties', value: ['IT', 'Einkauf'] })))
    await expect(
      withUserTx(a, (tx) => saveAnswer(tx, a, discoveryAnswerInput.parse({ discoveryId: d.id, questionKey: 'involved_parties', value: ['Erfunden'] }))),
    ).rejects.toThrow(/Fragetyp/)
    await expect(
      withUserTx(a, (tx) => saveAnswer(tx, a, discoveryAnswerInput.parse({ discoveryId: d.id, questionKey: 'gibt_es_nicht', value: 'x' }))),
    ).rejects.toThrow(/existiert nicht/)
    // Overwrite, then clear.
    await withUserTx(a, (tx) => saveAnswer(tx, a, discoveryAnswerInput.parse({ discoveryId: d.id, questionKey: 'quotes_per_month', value: { min: 50, max: 50 }, isUncertain: true })))
    let detail = await getDiscovery(a, d.id)
    expect(detail?.answers.quotes_per_month).toMatchObject({ value: { min: 50, max: 50 }, isUncertain: true })
    await withUserTx(a, (tx) => saveAnswer(tx, a, discoveryAnswerInput.parse({ discoveryId: d.id, questionKey: 'involved_parties', value: null })))
    detail = await getDiscovery(a, d.id)
    expect(detail?.answers.involved_parties).toBeUndefined()
    expect(detail?.questions.length).toBe(39)
  })

  it('Evidence Score: Mensch bestätigt, Summe nur über bewertete Kategorien', async () => {
    const d = await start('document')
    await withUserTx(a, (tx) => setEvidence(tx, a, evidenceInput.parse({ discoveryId: d.id, category: 'problem', points: 2, evidence: '„Wir haben bestimmt 60 alte Angebote.“' })))
    await withUserTx(a, (tx) => setEvidence(tx, a, evidenceInput.parse({ discoveryId: d.id, category: 'economic_relevance', points: 1, rationale: 'Kein konkreter wirtschaftlicher Wert genannt.' })))
    const detail = await getDiscovery(a, d.id)
    expect(detail?.total).toMatchObject({ points: 3, rated: 2, complete: false })
    const problem = detail?.evidence.find((e) => e.category === 'problem')
    expect(problem?.confirmedAt).not.toBeNull()
    // Un-rating removes the confirmation.
    await withUserTx(a, (tx) => setEvidence(tx, a, evidenceInput.parse({ discoveryId: d.id, category: 'problem', points: null })))
    expect((await getDiscovery(a, d.id))?.total.points).toBe(1)
  })

  it('Abschluss schreibt Verlauf, Events und Angebots-Snapshot', async () => {
    const d = await start('document')
    await withUserTx(a, (tx) => updateDiscoveryNotes(tx, d.id, discoveryNotes.parse({ summary: 'Backlog bestätigt.', objections: ['Datenschutz'] })))
    await withUserTx(a, (tx) => setSignal(tx, { discoveryId: d.id, signal: 'signal_problem_confirmed', value: 'yes' }))
    for (const category of EVIDENCE_CATEGORIES) {
      await withUserTx(a, (tx) => setEvidence(tx, a, evidenceInput.parse({ discoveryId: d.id, category, points: 1 })))
    }
    await withUserTx(a, (tx) => completeDiscovery(tx, a, d.id))

    const [row] = await admin`select status, pilot_offer_snapshot, objections from discovery_interviews where id = ${d.id}`
    expect(row?.status).toBe('completed')
    expect(row?.pilot_offer_snapshot).toMatchObject({ maxCases: 100, priceMinCents: 250000 })
    expect(row?.objections).toEqual(['Datenschutz'])
    const events = await admin`select type from domain_events where payload->>'discoveryId' = ${d.id}`
    expect(events.map((e) => e.type).sort()).toEqual(['DISCOVERY_COMPLETED', 'DISCOVERY_STARTED', 'EVIDENCE_SCORE_CONFIRMED', 'PAIN_CONFIRMED'])
    const { items } = await listTimeline(a, { companyId })
    const entry = items.find((i) => i.activity.discoveryId === d.id)
    expect(entry?.activity.body).toContain('Evidence Score: 10/20')
    expect(entry?.activity.body).toContain('Problem bestätigt')

    const latest = await withUserTx(a, (tx) => latestEvidenceByCompany(tx, a, [companyId]))
    expect(latest.get(companyId)).toBeDefined()
    expect((await listDiscoveries(a, { companyId })).length).toBeGreaterThan(0)
  })

  it('andere Organisationen sehen keine Gespräche und können nichts eintragen', async () => {
    const d = await start('document')
    expect(await getDiscovery(b, d.id)).toBeNull()
    expect(await listDiscoveries(b)).toEqual([])
    await expect(withUserTx(b, (tx) => setEvidence(tx, b, evidenceInput.parse({ discoveryId: d.id, category: 'problem', points: 2 })))).rejects.toThrow()
    await expect(withUserTx(b, (tx) => setSignal(tx, { discoveryId: d.id, signal: 'signal_price_ok', value: 'yes' }))).rejects.toThrow()
    // Starting an interview for a foreign company fails at the composite FK.
    await expect(withUserTx(b, (tx) => startDiscovery(tx, b, discoveryStart.parse({ companyId, mode: 'live' })))).rejects.toThrow()
  })
})
