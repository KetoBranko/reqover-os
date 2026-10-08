import { z } from 'zod'

// Central input schemas, shared by forms, server actions and AI proposals.
// Messages are German because they reach the user.

const trimmed = (max: number) => z.string().trim().max(max, `Höchstens ${max} Zeichen.`)
const optionalText = (max: number) =>
  trimmed(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
export const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Datum.')
const optionalDay = isoDay.optional().nullable().or(z.literal('').transform(() => null))
export const uuid = z.uuid('Ungültige Referenz.')
const optionalUuid = uuid.optional().nullable().or(z.literal('').transform(() => null))

const url = z
  .string()
  .trim()
  .max(300)
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
  .pipe(z.union([z.literal(''), z.url('Ungültige Adresse.')]))
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))

export const COMPANY_STATUSES = ['researched', 'qualified', 'not_a_fit', 'customer'] as const
export const companyInput = z.object({
  name: trimmed(200).min(1, 'Bitte einen Namen angeben.'),
  website: url,
  phone: optionalText(60),
  city: optionalText(120),
  industry: optionalText(120),
  employeeCount: z.coerce.number().int().min(0).max(10_000_000).optional().nullable().or(z.literal('').transform(() => null)),
  sizeClass: optionalText(60),
  businessModel: optionalText(2000),
  hasProjectBusiness: z.boolean().optional().nullable(),
  hasQuoteBusiness: z.boolean().optional().nullable(),
  salesStructure: optionalText(2000),
  source: optionalText(200),
  status: z.enum(COMPANY_STATUSES).default('researched'),
  fitScore: z.coerce.number().int().min(0, '0–100').max(100, '0–100').optional().nullable().or(z.literal('').transform(() => null)),
  recoveryUseCase: optionalText(2000),
})
export type CompanyInput = z.infer<typeof companyInput>

export const DECISION_ROLES = ['decision_maker', 'budget_owner', 'influencer', 'champion', 'user', 'gatekeeper', 'unknown'] as const
export const RELATIONSHIP_STATUSES = ['new', 'contacted', 'in_conversation', 'trusted', 'inactive'] as const
export const contactInput = z.object({
  companyId: uuid,
  firstName: trimmed(80).default(''),
  lastName: trimmed(80).min(1, 'Bitte einen Nachnamen angeben.'),
  jobTitle: optionalText(120),
  phone: optionalText(60),
  email: z
    .string()
    .trim()
    .max(254)
    .pipe(z.union([z.literal(''), z.email('Ungültige E-Mail-Adresse.')]))
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  linkedinUrl: url,
  decisionRole: z.enum(DECISION_ROLES).default('unknown'),
  relationshipStatus: z.enum(RELATIONSHIP_STATUSES).default('new'),
  notes: optionalText(10_000),
})
export type ContactInput = z.infer<typeof contactInput>

export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const
export const taskInput = z.object({
  title: trimmed(300).min(1, 'Bitte einen Titel angeben.'),
  description: optionalText(5000),
  context: optionalText(2000),
  dueDate: optionalDay,
  priority: z.enum(TASK_PRIORITIES).default('normal'),
  companyId: optionalUuid,
  contactId: optionalUuid,
  opportunityId: optionalUuid,
  discoveryId: optionalUuid,
})
export type TaskInput = z.infer<typeof taskInput>

export const MANUAL_ACTIVITY_TYPES = ['call', 'meeting', 'email', 'note'] as const
export const activityInput = z.object({
  type: z.enum(MANUAL_ACTIVITY_TYPES),
  title: trimmed(300).min(1, 'Bitte einen Titel angeben.'),
  body: optionalText(20_000),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  companyId: optionalUuid,
  contactId: optionalUuid,
  opportunityId: optionalUuid,
  taskId: optionalUuid,
})
export type ActivityInput = z.infer<typeof activityInput>

export const INSIGHT_KINDS = ['fact', 'hypothesis', 'customer_quote', 'interpretation', 'surprise'] as const
export const HYPOTHESIS_STATUSES = ['open', 'confirmed', 'refuted'] as const
export const INSIGHT_SOURCES = ['manual', 'discovery', 'website', 'research', 'ai'] as const
export const insightInput = z.object({
  companyId: uuid,
  discoveryId: optionalUuid,
  kind: z.enum(INSIGHT_KINDS),
  statement: trimmed(2000).min(1, 'Bitte eine Aussage eingeben.'),
  source: z.enum(INSIGHT_SOURCES).default('manual'),
  sourceDetail: optionalText(500),
  hypothesisStatus: z.enum(HYPOTHESIS_STATUSES).optional().nullable(),
  isUncertain: z.boolean().default(false),
})
export type InsightInput = z.infer<typeof insightInput>

export const idInput = z.object({ id: uuid })

export const PIPELINE_STAGE_KEYS = [
  'to_contact',
  'contacted',
  'discovery_scheduled',
  'discovery_done',
  'need_confirmed',
  'pilot_opportunity',
  'proposal',
  'won',
  'lost',
] as const
export type PipelineStageKey = (typeof PIPELINE_STAGE_KEYS)[number]

const optionalCents = z
  .union([z.number().int().min(0).max(100_000_000_00), z.null()])
  .optional()
  .transform((v) => v ?? null)

export const opportunityInput = z.object({
  companyId: uuid,
  title: trimmed(200).min(1, 'Bitte einen Titel angeben.'),
  stageKey: z.enum(PIPELINE_STAGE_KEYS).default('to_contact'),
  primaryContactId: optionalUuid,
  valueCents: optionalCents,
  nextStep: optionalText(500),
  nextStepDate: optionalDay,
})
export type OpportunityInput = z.infer<typeof opportunityInput>

export const opportunityUpdate = opportunityInput.omit({ companyId: true, stageKey: true }).partial()

export const opportunityMove = z.object({
  id: uuid,
  stageKey: z.enum(PIPELINE_STAGE_KEYS),
  orderConfirmedAt: optionalDay,
  /** Explicit "Trotzdem als gewonnen markieren" without a documented order. */
  wonWithoutOrder: z.boolean().default(false),
  lostReason: optionalText(1000),
})
export type OpportunityMove = z.infer<typeof opportunityMove>
