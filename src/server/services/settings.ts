import 'server-only'
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import * as s from '@/server/db/schema'
import { emitEvent, withUserTx, type RequestContext } from '@/server/db/context'
import { DomainError } from '@/server/action'
import { organizationSettingsSchema, parseOrganizationSettings, type OrganizationSettings, type PilotOffer } from '@/domain/settings'

export type Role = 'owner' | 'admin' | 'member'

function requireAdmin(role: Role) {
  if (role === 'member') throw new DomainError('forbidden', 'Das dürfen nur Inhaber und Administratoren.')
}

export async function getSettings(ctx: RequestContext) {
  return withUserTx(ctx, async (tx) => {
    const [org] = await tx.select().from(s.organizations).where(eq(s.organizations.id, ctx.organizationId))
    const members = await tx
      .select({ userId: s.memberships.userId, role: s.memberships.role, since: s.memberships.createdAt, displayName: s.profiles.displayName, firstName: s.profiles.firstName, lastSeenAt: s.profiles.lastSeenAt })
      .from(s.memberships)
      .innerJoin(s.profiles, eq(s.profiles.id, s.memberships.userId))
      .where(eq(s.memberships.organizationId, ctx.organizationId))
      .orderBy(s.memberships.createdAt)
    const [me] = await tx.select({ displayName: s.profiles.displayName, firstName: s.profiles.firstName }).from(s.profiles).where(eq(s.profiles.id, ctx.userId))
    const demo = await tx.select({ n: sql<number>`count(*)::int` }).from(s.companies).where(and(eq(s.companies.organizationId, ctx.organizationId), eq(s.companies.isDemo, true)))
    return { name: org!.name, settings: parseOrganizationSettings(org!.settings), members, me: me!, demoCompanies: demo[0]?.n ?? 0 }
  })
}

async function writeSettings(ctx: RequestContext, role: Role, patch: (current: OrganizationSettings) => OrganizationSettings, event: 'SETTINGS_AI_LEVEL_CHANGED' | 'SETTINGS_PILOT_OFFER_CHANGED', payload: Record<string, unknown>) {
  requireAdmin(role)
  return withUserTx(ctx, async (tx) => {
    const [org] = await tx.select({ settings: s.organizations.settings }).from(s.organizations).where(eq(s.organizations.id, ctx.organizationId))
    const next = organizationSettingsSchema.parse(patch(parseOrganizationSettings(org?.settings)))
    const rows = await tx.update(s.organizations).set({ settings: next }).where(eq(s.organizations.id, ctx.organizationId)).returning({ id: s.organizations.id })
    // RLS turns a forbidden update into "0 rows"; never report that as success.
    if (!rows.length) throw new DomainError('forbidden', 'Das dürfen nur Inhaber und Administratoren.')
    await emitEvent(tx, ctx, event, payload)
    return next
  })
}

export async function updateAiLevel(ctx: RequestContext, role: Role, aiLevel: 0 | 1 | 2) {
  return writeSettings(ctx, role, (c) => ({ ...c, aiLevel }), 'SETTINGS_AI_LEVEL_CHANGED', { aiLevel })
}

export async function updatePilotOffer(ctx: RequestContext, role: Role, pilotOffer: PilotOffer) {
  if (pilotOffer.priceMaxCents < pilotOffer.priceMinCents) throw new DomainError('validation', 'Der Höchstpreis muss mindestens so hoch sein wie der Mindestpreis.')
  return writeSettings(ctx, role, (c) => ({ ...c, pilotOffer }), 'SETTINGS_PILOT_OFFER_CHANGED', { ...pilotOffer })
}

export async function renameOrganization(ctx: RequestContext, role: Role, name: string) {
  requireAdmin(role)
  return withUserTx(ctx, async (tx) => {
    const rows = await tx.update(s.organizations).set({ name }).where(eq(s.organizations.id, ctx.organizationId)).returning({ id: s.organizations.id })
    if (!rows.length) throw new DomainError('forbidden', 'Das dürfen nur Inhaber und Administratoren.')
  })
}

export async function updateProfile(ctx: RequestContext, data: { displayName: string; firstName: string | null }) {
  return withUserTx(ctx, async (tx) => {
    await tx.update(s.profiles).set(data).where(eq(s.profiles.id, ctx.userId))
  })
}

/** Removes every record marked as demo data (seed). Real records are untouched. */
export async function removeDemoData(ctx: RequestContext, role: Role) {
  requireAdmin(role)
  return withUserTx(ctx, async (tx) => {
    const org = ctx.organizationId
    const counts: Record<string, number> = {}
    // Children first where they could outlive a demo parent (set-null references).
    for (const [key, table] of [
      ['activities', s.activities],
      ['tasks', s.tasks],
      ['insights', s.insights],
      ['discovery', s.discoveryInterviews],
      ['opportunities', s.opportunities],
      ['contacts', s.contacts],
      ['companies', s.companies],
    ] as const) {
      const rows = await tx
        .delete(table)
        .where(and(eq(table.organizationId, org), eq(table.isDemo, true)))
        .returning({ id: table.id })
      counts[key] = rows.length
    }
    await emitEvent(tx, ctx, 'DEMO_DATA_REMOVED', counts)
    return counts
  })
}

/** Owner only, with the organization name typed as confirmation. Irreversible. */
export async function deleteOrganization(ctx: RequestContext, role: Role, confirmName: string) {
  if (role !== 'owner') throw new DomainError('forbidden', 'Nur der Inhaber kann die Organisation löschen.')
  return withUserTx(ctx, async (tx) => {
    const [org] = await tx.select({ name: s.organizations.name }).from(s.organizations).where(eq(s.organizations.id, ctx.organizationId))
    if (!org || org.name !== confirmName) throw new DomainError('validation', 'Der eingegebene Name stimmt nicht mit dem Namen der Organisation überein.')
    await tx.execute(sql`select private.delete_organization(${ctx.organizationId}::uuid, ${confirmName})`)
  })
}

const EXPORT_TABLES = {
  unternehmen: s.companies,
  kontakte: s.contacts,
  pipelines: s.pipelines,
  pipelinePhasen: s.pipelineStages,
  chancen: s.opportunities,
  discoveryFragen: s.discoveryQuestions,
  discoveryGespraeche: s.discoveryInterviews,
  discoveryAntworten: s.discoveryAnswers,
  evidenceScores: s.evidenceScores,
  erkenntnisse: s.insights,
  aufgaben: s.tasks,
  aktivitaeten: s.activities,
  aiVorschlaege: s.aiActionProposals,
  ereignisse: s.domainEvents,
  aenderungsprotokoll: s.auditLogs,
} as const

/** Complete machine-readable export of the organization (owner/admin). Assistant chats are private and only the requester's own are included. */
export async function exportOrganization(ctx: RequestContext, role: Role) {
  requireAdmin(role)
  return withUserTx(ctx, async (tx) => {
    const [org] = await tx.select().from(s.organizations).where(eq(s.organizations.id, ctx.organizationId))
    const data: Record<string, unknown[]> = {}
    for (const [key, table] of Object.entries(EXPORT_TABLES)) {
      data[key] = await tx.select().from(table).where(eq(table.organizationId, ctx.organizationId))
    }
    const members = await tx
      .select({ userId: s.memberships.userId, rolle: s.memberships.role, seit: s.memberships.createdAt, name: s.profiles.displayName })
      .from(s.memberships)
      .innerJoin(s.profiles, eq(s.profiles.id, s.memberships.userId))
      .where(eq(s.memberships.organizationId, ctx.organizationId))
    const conversations = await tx.select().from(s.aiConversations).where(and(eq(s.aiConversations.organizationId, ctx.organizationId), eq(s.aiConversations.userId, ctx.userId)))
    const messages = conversations.length ? await tx.select().from(s.aiMessages).where(inArray(s.aiMessages.conversationId, conversations.map((c) => c.id))) : []
    await emitEvent(tx, ctx, 'DATA_EXPORTED', { tables: Object.keys(data).length })
    return {
      format: 'reqover-export',
      version: 1,
      exportiertAm: new Date().toISOString(),
      organisation: { id: org!.id, name: org!.name, einstellungen: parseOrganizationSettings(org!.settings) },
      mitglieder: members,
      ...data,
      eigeneAssistentGespraeche: conversations,
      eigeneAssistentNachrichten: messages,
    }
  })
}

export const AUDIT_TABLES = ['companies', 'contacts', 'opportunities', 'discovery_interviews', 'discovery_answers', 'evidence_scores', 'insights', 'tasks', 'activities', 'ai_action_proposals', 'organizations', 'memberships', 'pipeline_stages'] as const
export type AuditTable = (typeof AUDIT_TABLES)[number]

export interface AuditEntry {
  id: number
  occurredAt: Date
  table: string
  recordId: string
  action: 'insert' | 'update' | 'delete'
  actor: 'human' | 'ai' | 'system'
  actorName: string | null
  confirmedBy: string | null
  changes: { field: string; from: unknown; to: unknown }[]
  label: string | null
}

const NOISE = new Set(['id', 'organization_id', 'created_at', 'updated_at', 'search', 'search_text', 'search_vector', 'created_by', 'actions', 'decisions', 'model', 'source', 'payload', 'schema_version'])
/** Columns holding a user id; shown as that person's name. */
const PERSON_FIELDS = new Set(['decided_by', 'confirmed_by', 'assignee_id', 'interviewer_id', 'requested_by', 'user_id'])
/** Other references are internal ids and say nothing to a reader; the stage is resolved to its name. */
const hidden = (f: string) => NOISE.has(f) || (f.endsWith('_id') && f !== 'stage_id' && !PERSON_FIELDS.has(f))

function labelOf(v: Record<string, unknown> | null) {
  if (!v) return null
  for (const k of ['name', 'title', 'statement', 'first_name']) {
    if (typeof v[k] === 'string' && v[k]) return k === 'first_name' ? `${v.first_name} ${v.last_name ?? ''}`.trim() : (v[k] as string)
  }
  return null
}

/** Change log, newest first, with names resolved and stage ids shown as stage names. */
export async function getAuditLog(ctx: RequestContext, opts: { table?: AuditTable; actor?: 'human' | 'ai'; before?: number; limit?: number }) {
  const limit = Math.min(opts.limit ?? 50, 200)
  return withUserTx(ctx, async (tx) => {
    const rows = await tx
      .select()
      .from(s.auditLogs)
      .where(
        and(
          eq(s.auditLogs.organizationId, ctx.organizationId),
          opts.table ? eq(s.auditLogs.tableName, opts.table) : inArray(s.auditLogs.tableName, [...AUDIT_TABLES]),
          opts.actor ? eq(s.auditLogs.actor, opts.actor) : undefined,
          opts.before ? lt(s.auditLogs.id, opts.before) : undefined,
        ),
      )
      .orderBy(desc(s.auditLogs.id))
      .limit(limit + 1)
    const page = rows.slice(0, limit)
    const proposalIds = [...new Set(page.flatMap((r) => (r.proposalId ? [r.proposalId] : [])))]
    const decided = proposalIds.length ? await tx.select({ id: s.aiActionProposals.id, decidedBy: s.aiActionProposals.decidedBy }).from(s.aiActionProposals).where(inArray(s.aiActionProposals.id, proposalIds)) : []
    const personValues = page.flatMap((r) =>
      [r.oldValues, r.newValues].flatMap((v) => (v ? Object.entries(v).flatMap(([k, x]) => (PERSON_FIELDS.has(k) && typeof x === 'string' ? [x] : [])) : [])),
    )
    const userIds = [...new Set([...page.flatMap((r) => (r.actorId ? [r.actorId] : [])), ...decided.flatMap((d) => (d.decidedBy ? [d.decidedBy] : [])), ...personValues])]
    const people = userIds.length ? await tx.select({ id: s.profiles.id, name: s.profiles.displayName }).from(s.profiles).where(inArray(s.profiles.id, userIds)) : []
    // Updates store only changed fields; the record's name comes from its creation entry.
    const unnamed = [...new Set(page.filter((r) => !labelOf(r.newValues ?? r.oldValues ?? null)).map((r) => r.recordId))]
    const created = unnamed.length
      ? await tx
          .select({ recordId: s.auditLogs.recordId, values: s.auditLogs.newValues })
          .from(s.auditLogs)
          .where(and(eq(s.auditLogs.organizationId, ctx.organizationId), eq(s.auditLogs.action, 'insert'), inArray(s.auditLogs.recordId, unnamed)))
      : []
    const createdLabel = new Map(created.map((c) => [c.recordId, labelOf(c.values)]))
    const stages = await tx.select({ id: s.pipelineStages.id, name: s.pipelineStages.name }).from(s.pipelineStages).where(eq(s.pipelineStages.organizationId, ctx.organizationId))
    const nameOf = new Map(people.map((p) => [p.id, p.name]))
    const stageOf = new Map(stages.map((st) => [st.id, st.name]))
    const decidedBy = new Map(decided.map((d) => [d.id, d.decidedBy]))
    const show = (field: string, v: unknown) =>
      typeof v !== 'string' ? v : field === 'stage_id' ? (stageOf.get(v) ?? v) : PERSON_FIELDS.has(field) ? (nameOf.get(v) ?? 'unbekannte Person') : v

    const entries: AuditEntry[] = page.map((r) => {
      const fields = r.action === 'update' ? r.changedFields : Object.keys((r.action === 'delete' ? r.oldValues : r.newValues) ?? {})
      const changes = fields
        .filter((f) => !hidden(f))
        .map((f) => ({ field: f, from: r.action === 'insert' ? null : show(f, r.oldValues?.[f] ?? null), to: r.action === 'delete' ? null : show(f, r.newValues?.[f] ?? null) }))
        .filter((c) => r.action === 'update' || c.from != null || c.to != null)
      const confirmer = r.proposalId ? decidedBy.get(r.proposalId) : null
      return {
        id: r.id,
        occurredAt: r.occurredAt,
        table: r.tableName,
        recordId: r.recordId,
        action: r.action,
        actor: r.actor,
        actorName: r.actorId ? (nameOf.get(r.actorId) ?? null) : null,
        confirmedBy: confirmer ? (nameOf.get(confirmer) ?? null) : null,
        changes,
        label: labelOf(r.newValues ?? r.oldValues ?? null) ?? createdLabel.get(r.recordId) ?? null,
      }
    })
    return { entries, nextBefore: rows.length > limit ? page[page.length - 1]!.id : null }
  })
}
