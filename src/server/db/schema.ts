// Drizzle mirror of db/migrations/*.sql. The SQL migrations are the source of
// truth (they also carry RLS, triggers and functions); this file gives typed
// queries. tests/db/schema-drift.test.ts fails when the two diverge.
import {
  bigint,
  boolean,
  char,
  date,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export const membershipRole = pgEnum('membership_role', ['owner', 'admin', 'member'])
export const actorKind = pgEnum('actor_kind', ['human', 'ai', 'system'])
export const companyStatus = pgEnum('company_status', ['researched', 'qualified', 'not_a_fit', 'customer'])
export const insightKind = pgEnum('insight_kind', ['fact', 'hypothesis', 'customer_quote', 'interpretation', 'surprise'])
export const hypothesisStatus = pgEnum('hypothesis_status', ['open', 'confirmed', 'refuted'])
export const insightSource = pgEnum('insight_source', ['manual', 'discovery', 'website', 'research', 'ai'])
export const decisionRole = pgEnum('decision_role', [
  'decision_maker',
  'budget_owner',
  'influencer',
  'champion',
  'user',
  'gatekeeper',
  'unknown',
])
export const relationshipStatus = pgEnum('relationship_status', ['new', 'contacted', 'in_conversation', 'trusted', 'inactive'])
export const activityType = pgEnum('activity_type', [
  'call',
  'meeting',
  'email',
  'note',
  'discovery',
  'task',
  'stage_change',
  'opportunity',
  'ai_action',
  'system',
])
export const taskStatus = pgEnum('task_status', ['open', 'done', 'cancelled'])
export const taskPriority = pgEnum('task_priority', ['low', 'normal', 'high'])
export const stageOutcome = pgEnum('stage_outcome', ['open', 'won', 'lost'])
export const discoveryStatus = pgEnum('discovery_status', ['planned', 'in_progress', 'draft', 'completed'])
export const signalValue = pgEnum('signal_value', ['yes', 'no', 'unclear'])
export const evidenceCategory = pgEnum('evidence_category', [
  'problem',
  'frequency',
  'economic_relevance',
  'current_effort',
  'backlog',
  'capacity',
  'externalization',
  'data_access',
  'budget',
  'next_step',
])
export const proposalStatus = pgEnum('proposal_status', ['pending', 'applied', 'partially_applied', 'rejected', 'failed'])
export const proposalSource = pgEnum('proposal_source', ['assistant', 'discovery_extraction', 'evidence_scoring', 'automation'])

const authSchema = pgSchema('auth')
export const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
  email: text('email'),
})

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  settings: jsonb('settings').$type<unknown>().notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name').notNull(),
  firstName: text('first_name'),
  timezone: text('timezone').notNull(),
  locale: text('locale').notNull(),
  lastSeenAt: ts('last_seen_at'),
  lastBriefingAt: ts('last_briefing_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const memberships = pgTable('memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  userId: uuid('user_id').notNull(),
  role: membershipRole('role').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
})

const tenant = {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}

export const companies = pgTable('companies', {
  ...tenant,
  name: text('name').notNull(),
  website: text('website'),
  phone: text('phone'),
  city: text('city'),
  country: text('country').notNull().default('DE'),
  industry: text('industry'),
  employeeCount: integer('employee_count'),
  sizeClass: text('size_class'),
  businessModel: text('business_model'),
  hasProjectBusiness: boolean('has_project_business'),
  hasQuoteBusiness: boolean('has_quote_business'),
  salesStructure: text('sales_structure'),
  source: text('source'),
  status: companyStatus('status').notNull().default('researched'),
  fitScore: smallint('fit_score'),
  recoveryUseCase: text('recovery_use_case'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdBy: uuid('created_by'),
})

export const contacts = pgTable('contacts', {
  ...tenant,
  companyId: uuid('company_id').notNull(),
  firstName: text('first_name').notNull().default(''),
  lastName: text('last_name').notNull(),
  jobTitle: text('job_title'),
  phone: text('phone'),
  email: text('email'),
  linkedinUrl: text('linkedin_url'),
  decisionRole: decisionRole('decision_role').notNull().default('unknown'),
  relationshipStatus: relationshipStatus('relationship_status').notNull().default('new'),
  notes: text('notes'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdBy: uuid('created_by'),
})

export const pipelines = pgTable('pipelines', {
  ...tenant,
  key: text('key').notNull(),
  name: text('name').notNull(),
})

export const pipelineStages = pgTable('pipeline_stages', {
  ...tenant,
  pipelineId: uuid('pipeline_id').notNull(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  position: smallint('position').notNull(),
  outcome: stageOutcome('outcome').notNull(),
})

export const opportunities = pgTable('opportunities', {
  ...tenant,
  companyId: uuid('company_id').notNull(),
  pipelineId: uuid('pipeline_id').notNull(),
  stageId: uuid('stage_id').notNull(),
  primaryContactId: uuid('primary_contact_id'),
  title: text('title').notNull(),
  valueCents: bigint('value_cents', { mode: 'number' }),
  currency: char('currency', { length: 3 }).notNull().default('EUR'),
  nextStep: text('next_step'),
  nextStepDate: date('next_step_date', { mode: 'string' }),
  orderConfirmedAt: date('order_confirmed_at', { mode: 'string' }),
  lostReason: text('lost_reason'),
  stageChangedAt: ts('stage_changed_at').notNull().defaultNow(),
  closedAt: ts('closed_at'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdBy: uuid('created_by'),
})

export const discoveryQuestions = pgTable('discovery_questions', {
  ...tenant,
  key: text('key').notNull(),
  section: text('section').notNull(),
  prompt: text('prompt').notNull(),
  answerType: text('answer_type').notNull(),
  options: jsonb('options').$type<string[]>().notNull(),
  position: smallint('position').notNull(),
  isCore: boolean('is_core').notNull(),
  isActive: boolean('is_active').notNull(),
  version: smallint('version').notNull(),
})

export const discoveryInterviews = pgTable('discovery_interviews', {
  ...tenant,
  companyId: uuid('company_id').notNull(),
  contactId: uuid('contact_id'),
  opportunityId: uuid('opportunity_id'),
  interviewerId: uuid('interviewer_id'),
  status: discoveryStatus('status').notNull().default('draft'),
  conductedAt: ts('conducted_at'),
  startedAt: ts('started_at'),
  durationSeconds: integer('duration_seconds'),
  rawNotes: text('raw_notes'),
  transcript: text('transcript'),
  coreQuestionAnswer: text('core_question_answer'),
  summary: text('summary'),
  mainPain: text('main_pain'),
  recoveryUseCase: text('recovery_use_case'),
  objections: text('objections').array().notNull().default([]),
  externalizationConcerns: text('externalization_concerns').array().notNull().default([]),
  desiredKpis: text('desired_kpis').array().notNull().default([]),
  signalProblemConfirmed: signalValue('signal_problem_confirmed').notNull().default('unclear'),
  signalRegularBacklog: signalValue('signal_regular_backlog').notNull().default('unclear'),
  signalCapacityCause: signalValue('signal_capacity_cause').notNull().default('unclear'),
  signalExternalOk: signalValue('signal_external_ok').notNull().default('unclear'),
  signalPriceOk: signalValue('signal_price_ok').notNull().default('unclear'),
  signalPilotInterest: signalValue('signal_pilot_interest').notNull().default('unclear'),
  pilotOfferSnapshot: jsonb('pilot_offer_snapshot').$type<unknown>(),
  completedAt: ts('completed_at'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdBy: uuid('created_by'),
})

export const discoveryAnswers = pgTable('discovery_answers', {
  ...tenant,
  discoveryId: uuid('discovery_id').notNull(),
  questionKey: text('question_key').notNull(),
  value: jsonb('value').$type<unknown>(),
  verbatim: text('verbatim'),
  isUncertain: boolean('is_uncertain').notNull().default(false),
  source: actorKind('source').notNull().default('human'),
})

export const evidenceScores = pgTable('evidence_scores', {
  ...tenant,
  discoveryId: uuid('discovery_id').notNull(),
  category: evidenceCategory('category').notNull(),
  points: smallint('points'),
  suggestedPoints: smallint('suggested_points'),
  evidence: text('evidence'),
  rationale: text('rationale'),
  suggestedBy: actorKind('suggested_by'),
  confirmedBy: uuid('confirmed_by'),
  confirmedAt: ts('confirmed_at'),
})

export const insights = pgTable('insights', {
  ...tenant,
  companyId: uuid('company_id').notNull(),
  discoveryId: uuid('discovery_id'),
  kind: insightKind('kind').notNull(),
  statement: text('statement').notNull(),
  source: insightSource('source').notNull().default('manual'),
  sourceDetail: text('source_detail'),
  hypothesisStatus: hypothesisStatus('hypothesis_status'),
  isUncertain: boolean('is_uncertain').notNull().default(false),
  actor: actorKind('actor').notNull().default('human'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdBy: uuid('created_by'),
})

export const tasks = pgTable('tasks', {
  ...tenant,
  title: text('title').notNull(),
  description: text('description'),
  context: text('context'),
  dueDate: date('due_date', { mode: 'string' }),
  priority: taskPriority('priority').notNull().default('normal'),
  status: taskStatus('status').notNull().default('open'),
  completedAt: ts('completed_at'),
  origin: actorKind('origin').notNull().default('human'),
  assigneeId: uuid('assignee_id'),
  companyId: uuid('company_id'),
  contactId: uuid('contact_id'),
  opportunityId: uuid('opportunity_id'),
  discoveryId: uuid('discovery_id'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdBy: uuid('created_by'),
})

export const activities = pgTable('activities', {
  ...tenant,
  type: activityType('type').notNull(),
  occurredAt: ts('occurred_at').notNull().defaultNow(),
  title: text('title').notNull(),
  body: text('body'),
  actor: actorKind('actor').notNull().default('human'),
  companyId: uuid('company_id'),
  contactId: uuid('contact_id'),
  opportunityId: uuid('opportunity_id'),
  discoveryId: uuid('discovery_id'),
  taskId: uuid('task_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  isDemo: boolean('is_demo').notNull().default(false),
  createdBy: uuid('created_by'),
})

export const aiConversations = pgTable('ai_conversations', {
  ...tenant,
  userId: uuid('user_id').notNull(),
  title: text('title'),
})

export const aiMessages = pgTable('ai_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  conversationId: uuid('conversation_id').notNull(),
  role: text('role').$type<'user' | 'assistant' | 'tool'>().notNull(),
  content: jsonb('content').$type<unknown>().notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const aiActionProposals = pgTable('ai_action_proposals', {
  ...tenant,
  source: proposalSource('source').notNull(),
  status: proposalStatus('status').notNull().default('pending'),
  summary: text('summary').notNull(),
  actions: jsonb('actions').$type<unknown>().notNull(),
  decisions: jsonb('decisions').$type<Record<string, unknown>>().notNull().default({}),
  schemaVersion: smallint('schema_version').notNull().default(1),
  model: text('model'),
  conversationId: uuid('conversation_id'),
  companyId: uuid('company_id'),
  discoveryId: uuid('discovery_id'),
  error: text('error'),
  requestedBy: uuid('requested_by'),
  decidedBy: uuid('decided_by'),
  decidedAt: ts('decided_at'),
})

export const domainEvents = pgTable('domain_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  type: text('type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  actor: actorKind('actor').notNull(),
  actorId: uuid('actor_id'),
  proposalId: uuid('proposal_id'),
  occurredAt: ts('occurred_at').notNull().defaultNow(),
})

export const auditLogs = pgTable('audit_logs', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  tableName: text('table_name').notNull(),
  recordId: uuid('record_id').notNull(),
  action: text('action').$type<'insert' | 'update' | 'delete'>().notNull(),
  oldValues: jsonb('old_values').$type<Record<string, unknown>>(),
  newValues: jsonb('new_values').$type<Record<string, unknown>>(),
  changedFields: text('changed_fields').array().notNull(),
  actorId: uuid('actor_id'),
  actor: actorKind('actor').notNull(),
  proposalId: uuid('proposal_id'),
  occurredAt: ts('occurred_at').notNull().defaultNow(),
})
