-- ReQover OS · 0001 · Core schema
-- Tenancy, CRM, pipeline, discovery, evidence score, AI proposals, events, audit.
-- Conventions:
--   * every business table carries organization_id and has RLS enabled
--   * cross-table references inside a tenant use composite FKs (id, organization_id)
--     so a row can never point at another tenant's row
--   * German labels never live in the schema; enum values are stable English keys

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.membership_role as enum ('owner', 'admin', 'member');
create type public.actor_kind as enum ('human', 'ai', 'system');
create type public.company_status as enum ('researched', 'qualified', 'not_a_fit', 'customer');
create type public.insight_kind as enum ('fact', 'hypothesis', 'customer_quote', 'interpretation', 'surprise');
create type public.hypothesis_status as enum ('open', 'confirmed', 'refuted');
create type public.insight_source as enum ('manual', 'discovery', 'website', 'research', 'ai');
create type public.decision_role as enum ('decision_maker', 'budget_owner', 'influencer', 'champion', 'user', 'gatekeeper', 'unknown');
create type public.relationship_status as enum ('new', 'contacted', 'in_conversation', 'trusted', 'inactive');
create type public.activity_type as enum (
  'call', 'meeting', 'email', 'note', 'discovery', 'task', 'stage_change',
  'opportunity', 'ai_action', 'system'
);
create type public.task_status as enum ('open', 'done', 'cancelled');
create type public.task_priority as enum ('low', 'normal', 'high');
create type public.stage_outcome as enum ('open', 'won', 'lost');
create type public.discovery_status as enum ('planned', 'in_progress', 'draft', 'completed');
create type public.signal_value as enum ('yes', 'no', 'unclear');
create type public.evidence_category as enum (
  'problem', 'frequency', 'economic_relevance', 'current_effort', 'backlog',
  'capacity', 'externalization', 'data_access', 'budget', 'next_step'
);
create type public.proposal_status as enum ('pending', 'applied', 'partially_applied', 'rejected', 'failed');
create type public.proposal_source as enum ('assistant', 'discovery_extraction', 'evidence_scoring', 'automation');

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,64}$'),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 120),
  first_name text check (length(first_name) <= 80),
  timezone text not null default 'Europe/Berlin',
  locale text not null default 'de-DE',
  last_seen_at timestamptz,
  last_briefing_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.membership_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- Membership checks used by every policy. SECURITY DEFINER so policies on
-- memberships itself do not recurse; search_path pinned against hijacking.
create or replace function private.is_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_role(org uuid, roles public.membership_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org and m.user_id = (select auth.uid()) and m.role = any (roles)
  );
$$;

-- ---------------------------------------------------------------------------
-- CRM
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  website text check (length(website) <= 300),
  phone text check (length(phone) <= 60),
  city text check (length(city) <= 120),
  country text not null default 'DE' check (length(country) <= 2),
  industry text check (length(industry) <= 120),
  employee_count integer check (employee_count >= 0),
  size_class text check (length(size_class) <= 60),
  business_model text check (length(business_model) <= 2000),
  has_project_business boolean,
  has_quote_business boolean,
  sales_structure text check (length(sales_structure) <= 2000),
  source text check (length(source) <= 200),
  status public.company_status not null default 'researched',
  fit_score smallint check (fit_score between 0 and 100),
  recovery_use_case text check (length(recovery_use_case) <= 2000),
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector('german'::regconfig,
      coalesce(name, '') || ' ' || coalesce(industry, '') || ' ' || coalesce(city, '') || ' ' ||
      coalesce(business_model, '') || ' ' || coalesce(recovery_use_case, ''))
  ) stored,
  unique (id, organization_id)
);
create index companies_org_idx on public.companies (organization_id, status);
create index companies_search_idx on public.companies using gin (search);
create index companies_name_trgm_idx on public.companies using gin (name gin_trgm_ops);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid not null,
  first_name text not null default '' check (length(first_name) <= 80),
  last_name text not null check (length(last_name) between 1 and 80),
  job_title text check (length(job_title) <= 120),
  phone text check (length(phone) <= 60),
  email text check (length(email) <= 254),
  linkedin_url text check (length(linkedin_url) <= 300),
  decision_role public.decision_role not null default 'unknown',
  relationship_status public.relationship_status not null default 'new',
  notes text check (length(notes) <= 10000),
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector('simple'::regconfig,
      coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' ||
      coalesce(job_title, '') || ' ' || coalesce(email, ''))
  ) stored,
  unique (id, organization_id),
  foreign key (company_id, organization_id) references public.companies (id, organization_id) on delete cascade
);
create index contacts_company_idx on public.contacts (company_id);
create index contacts_org_idx on public.contacts (organization_id);
create index contacts_search_idx on public.contacts using gin (search);

-- ---------------------------------------------------------------------------
-- Pipeline
-- ---------------------------------------------------------------------------
create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key),
  unique (id, organization_id)
);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  pipeline_id uuid not null,
  key text not null check (key ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  position smallint not null,
  outcome public.stage_outcome not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pipeline_id, key),
  unique (id, organization_id),
  foreign key (pipeline_id, organization_id) references public.pipelines (id, organization_id) on delete cascade
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid not null,
  pipeline_id uuid not null,
  stage_id uuid not null,
  primary_contact_id uuid,
  title text not null check (length(title) between 1 and 200),
  value_cents bigint check (value_cents >= 0),
  currency char(3) not null default 'EUR',
  next_step text check (length(next_step) <= 500),
  next_step_date date,
  order_confirmed_at date,
  lost_reason text check (length(lost_reason) <= 1000),
  stage_changed_at timestamptz not null default now(),
  closed_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (company_id, organization_id) references public.companies (id, organization_id) on delete cascade,
  foreign key (pipeline_id, organization_id) references public.pipelines (id, organization_id),
  foreign key (stage_id, organization_id) references public.pipeline_stages (id, organization_id),
  foreign key (primary_contact_id, organization_id) references public.contacts (id, organization_id) on delete set null (primary_contact_id)
);
create index opportunities_org_stage_idx on public.opportunities (organization_id, stage_id);
create index opportunities_company_idx on public.opportunities (company_id);

-- ---------------------------------------------------------------------------
-- Discovery
-- ---------------------------------------------------------------------------
create table public.discovery_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{2,60}$'),
  section text not null check (section in (
    'company', 'sales_process', 'problem', 'core_question', 'reaction',
    'willingness_to_pay', 'buying_process', 'evidence'
  )),
  prompt text not null,
  answer_type text not null check (answer_type in ('text', 'long_text', 'number', 'range', 'boolean', 'choice', 'multi_choice', 'date')),
  options jsonb not null default '[]'::jsonb,
  position smallint not null,
  is_core boolean not null default false,
  is_active boolean not null default true,
  version smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table public.discovery_interviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid not null,
  contact_id uuid,
  opportunity_id uuid,
  interviewer_id uuid references auth.users (id) on delete set null,
  status public.discovery_status not null default 'draft',
  conducted_at timestamptz,
  started_at timestamptz,
  duration_seconds integer check (duration_seconds >= 0),
  raw_notes text check (length(raw_notes) <= 100000),
  transcript text check (length(transcript) <= 200000),
  core_question_answer text check (length(core_question_answer) <= 10000),
  summary text check (length(summary) <= 10000),
  main_pain text check (length(main_pain) <= 2000),
  recovery_use_case text check (length(recovery_use_case) <= 2000),
  objections text[] not null default '{}',
  externalization_concerns text[] not null default '{}',
  desired_kpis text[] not null default '{}',
  signal_problem_confirmed public.signal_value not null default 'unclear',
  signal_regular_backlog public.signal_value not null default 'unclear',
  signal_capacity_cause public.signal_value not null default 'unclear',
  signal_external_ok public.signal_value not null default 'unclear',
  signal_price_ok public.signal_value not null default 'unclear',
  signal_pilot_interest public.signal_value not null default 'unclear',
  pilot_offer_snapshot jsonb,
  completed_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector('german'::regconfig,
      coalesce(raw_notes, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(core_question_answer, '') || ' ' ||
      coalesce(main_pain, ''))
  ) stored,
  unique (id, organization_id),
  foreign key (company_id, organization_id) references public.companies (id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete set null (contact_id),
  foreign key (opportunity_id, organization_id) references public.opportunities (id, organization_id) on delete set null (opportunity_id)
);
create index discovery_company_idx on public.discovery_interviews (company_id);
create index discovery_org_status_idx on public.discovery_interviews (organization_id, status);
create index discovery_search_idx on public.discovery_interviews using gin (search);

create table public.discovery_answers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  discovery_id uuid not null,
  question_key text not null,
  value jsonb,
  verbatim text check (length(verbatim) <= 10000),
  is_uncertain boolean not null default false,
  source public.actor_kind not null default 'human',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (discovery_id, question_key),
  foreign key (discovery_id, organization_id) references public.discovery_interviews (id, organization_id) on delete cascade,
  foreign key (organization_id, question_key) references public.discovery_questions (organization_id, key) on update cascade
);

create table public.evidence_scores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  discovery_id uuid not null,
  category public.evidence_category not null,
  points smallint check (points between 0 and 2),
  suggested_points smallint check (suggested_points between 0 and 2),
  evidence text check (length(evidence) <= 2000),
  rationale text check (length(rationale) <= 2000),
  suggested_by public.actor_kind,
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (discovery_id, category),
  foreign key (discovery_id, organization_id) references public.discovery_interviews (id, organization_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Insights: facts vs hypotheses, evidence vs interpretation
-- ---------------------------------------------------------------------------
create table public.insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid not null,
  discovery_id uuid,
  kind public.insight_kind not null,
  statement text not null check (length(statement) between 1 and 2000),
  source public.insight_source not null default 'manual',
  source_detail text check (length(source_detail) <= 500),
  hypothesis_status public.hypothesis_status,
  is_uncertain boolean not null default false,
  actor public.actor_kind not null default 'human',
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'hypothesis') = (hypothesis_status is not null)),
  unique (id, organization_id),
  foreign key (company_id, organization_id) references public.companies (id, organization_id) on delete cascade,
  foreign key (discovery_id, organization_id) references public.discovery_interviews (id, organization_id) on delete cascade
);
create index insights_company_idx on public.insights (company_id, kind);

-- ---------------------------------------------------------------------------
-- Tasks and activities
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (length(title) between 1 and 300),
  description text check (length(description) <= 5000),
  context text check (length(context) <= 2000),
  due_date date,
  priority public.task_priority not null default 'normal',
  status public.task_status not null default 'open',
  completed_at timestamptz,
  origin public.actor_kind not null default 'human',
  assignee_id uuid references auth.users (id) on delete set null,
  company_id uuid,
  contact_id uuid,
  opportunity_id uuid,
  discovery_id uuid,
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'done') = (completed_at is not null)),
  unique (id, organization_id),
  foreign key (company_id, organization_id) references public.companies (id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete set null (contact_id),
  foreign key (opportunity_id, organization_id) references public.opportunities (id, organization_id) on delete set null (opportunity_id),
  foreign key (discovery_id, organization_id) references public.discovery_interviews (id, organization_id) on delete set null (discovery_id)
);
create index tasks_open_due_idx on public.tasks (organization_id, status, due_date);
create index tasks_company_idx on public.tasks (company_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type public.activity_type not null,
  occurred_at timestamptz not null default now(),
  title text not null check (length(title) between 1 and 300),
  body text check (length(body) <= 20000),
  actor public.actor_kind not null default 'human',
  company_id uuid,
  contact_id uuid,
  opportunity_id uuid,
  discovery_id uuid,
  task_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector('german'::regconfig, coalesce(title, '') || ' ' || coalesce(body, ''))
  ) stored,
  foreign key (company_id, organization_id) references public.companies (id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete set null (contact_id),
  foreign key (opportunity_id, organization_id) references public.opportunities (id, organization_id) on delete set null (opportunity_id),
  foreign key (discovery_id, organization_id) references public.discovery_interviews (id, organization_id) on delete set null (discovery_id),
  foreign key (task_id, organization_id) references public.tasks (id, organization_id) on delete set null (task_id)
);
create index activities_org_time_idx on public.activities (organization_id, occurred_at desc);
create index activities_company_time_idx on public.activities (company_id, occurred_at desc);
create index activities_contact_time_idx on public.activities (contact_id, occurred_at desc);
create index activities_search_idx on public.activities using gin (search);

-- ---------------------------------------------------------------------------
-- AI
-- ---------------------------------------------------------------------------
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text check (length(title) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, organization_id) references public.ai_conversations (id, organization_id) on delete cascade
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

create table public.ai_action_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source public.proposal_source not null,
  status public.proposal_status not null default 'pending',
  summary text not null check (length(summary) <= 2000),
  actions jsonb not null,
  decisions jsonb not null default '{}'::jsonb,
  schema_version smallint not null default 1,
  model text,
  conversation_id uuid,
  company_id uuid,
  discovery_id uuid,
  error text,
  requested_by uuid references auth.users (id) on delete set null,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (conversation_id, organization_id) references public.ai_conversations (id, organization_id) on delete set null (conversation_id),
  foreign key (company_id, organization_id) references public.companies (id, organization_id) on delete cascade,
  foreign key (discovery_id, organization_id) references public.discovery_interviews (id, organization_id) on delete cascade
);
create index ai_proposals_org_status_idx on public.ai_action_proposals (organization_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Domain events (outbox) and audit log
-- ---------------------------------------------------------------------------
create table public.domain_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type text not null check (type ~ '^[A-Z][A-Z_]{2,60}$'),
  payload jsonb not null default '{}'::jsonb,
  actor public.actor_kind not null,
  actor_id uuid,
  proposal_id uuid,
  occurred_at timestamptz not null default now()
);
create index domain_events_org_time_idx on public.domain_events (organization_id, occurred_at desc);
create index domain_events_type_idx on public.domain_events (organization_id, type, occurred_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_values jsonb,
  new_values jsonb,
  changed_fields text[] not null default '{}',
  actor_id uuid,
  actor public.actor_kind not null,
  proposal_id uuid,
  occurred_at timestamptz not null default now()
);
create index audit_logs_record_idx on public.audit_logs (record_id, occurred_at desc);
create index audit_logs_org_time_idx on public.audit_logs (organization_id, occurred_at desc);

-- The server sets these per transaction (see src/server/db/context.ts):
--   app.actor = human | ai | system, app.proposal_id = uuid of the applied proposal
create or replace function private.current_actor() returns public.actor_kind
language sql stable as $$
  select coalesce(nullif(current_setting('app.actor', true), ''), 'system')::public.actor_kind;
$$;

create or replace function private.current_proposal_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.proposal_id', true), '')::uuid;
$$;

-- Fields excluded from audit diffs: derived or bookkeeping columns.
create or replace function private.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  old_json jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'search' - 'updated_at' end;
  new_json jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'search' - 'updated_at' end;
  changed text[] := '{}';
  k text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(new_json) loop
      if new_json -> k is distinct from old_json -> k then
        changed := changed || k;
      end if;
    end loop;
    if array_length(changed, 1) is null then
      return new;
    end if;
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into old_json
      from jsonb_each(old_json) where key = any (changed);
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into new_json
      from jsonb_each(new_json) where key = any (changed);
  end if;

  insert into public.audit_logs (
    organization_id, table_name, record_id, action, old_values, new_values,
    changed_fields, actor_id, actor, proposal_id
  ) values (
    coalesce((new_json ->> 'organization_id')::uuid, (old_json ->> 'organization_id')::uuid,
             (to_jsonb(coalesce(new, old)) ->> 'organization_id')::uuid,
             (to_jsonb(coalesce(new, old)) ->> 'id')::uuid),
    tg_table_name,
    (to_jsonb(coalesce(new, old)) ->> 'id')::uuid,
    lower(tg_op),
    old_json,
    new_json,
    changed,
    (select auth.uid()),
    private.current_actor(),
    private.current_proposal_id()
  );
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers: updated_at + audit
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'profiles', 'companies', 'contacts', 'pipelines', 'pipeline_stages',
    'opportunities', 'discovery_questions', 'discovery_interviews', 'discovery_answers',
    'evidence_scores', 'insights', 'tasks', 'activities', 'ai_conversations', 'ai_action_proposals'
  ] loop
    execute format('create trigger touch_updated_at before update on public.%I
      for each row execute function private.touch_updated_at()', t);
  end loop;

  foreach t in array array[
    'organizations', 'memberships', 'companies', 'contacts', 'opportunities',
    'discovery_interviews', 'discovery_answers', 'evidence_scores', 'insights', 'tasks',
    'activities', 'ai_action_proposals', 'pipeline_stages'
  ] loop
    execute format('create trigger audit_row_change after insert or update or delete on public.%I
      for each row execute function private.audit_row_change()', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;

create policy organizations_select on public.organizations for select to authenticated
  using (private.is_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (private.has_role(id, '{owner,admin}')) with check (private.has_role(id, '{owner,admin}'));

create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.memberships mine
      join public.memberships theirs on theirs.organization_id = mine.organization_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy memberships_select on public.memberships for select to authenticated
  using (private.is_member(organization_id));
create policy memberships_insert on public.memberships for insert to authenticated
  with check (private.has_role(organization_id, '{owner,admin}') and role <> 'owner');
create policy memberships_update on public.memberships for update to authenticated
  using (private.has_role(organization_id, '{owner}')) with check (private.has_role(organization_id, '{owner}'));
create policy memberships_delete on public.memberships for delete to authenticated
  using (private.has_role(organization_id, '{owner,admin}') and role <> 'owner');

-- Standard tenant tables: members read and write, owners/admins delete.
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'contacts', 'pipelines', 'pipeline_stages', 'opportunities',
    'discovery_questions', 'discovery_interviews', 'discovery_answers', 'evidence_scores',
    'insights', 'ai_action_proposals'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member(organization_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.is_member(organization_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.is_member(organization_id)) with check (private.is_member(organization_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (private.has_role(organization_id, ''{owner,admin}''))', t || '_delete', t);
  end loop;

  -- Day-to-day records members may also delete themselves.
  foreach t in array array['tasks', 'activities'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member(organization_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.is_member(organization_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.is_member(organization_id)) with check (private.is_member(organization_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (private.is_member(organization_id))', t || '_delete', t);
  end loop;
end
$$;

-- Assistant conversations are private to their user.
alter table public.ai_conversations enable row level security;
create policy ai_conversations_own on public.ai_conversations for all to authenticated
  using (user_id = (select auth.uid()) and private.is_member(organization_id))
  with check (user_id = (select auth.uid()) and private.is_member(organization_id));

alter table public.ai_messages enable row level security;
create policy ai_messages_own on public.ai_messages for all to authenticated
  using (exists (
    select 1 from public.ai_conversations c
    where c.id = ai_messages.conversation_id and c.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.ai_conversations c
    where c.id = ai_messages.conversation_id and c.user_id = (select auth.uid())
  ) and private.is_member(organization_id));

-- Events: append-only. Members insert events for their own org as themselves.
alter table public.domain_events enable row level security;
create policy domain_events_select on public.domain_events for select to authenticated
  using (private.is_member(organization_id));
create policy domain_events_insert on public.domain_events for insert to authenticated
  with check (private.is_member(organization_id) and actor_id = (select auth.uid()));

-- Audit log: written only by the trigger; members read it.
alter table public.audit_logs enable row level security;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (private.is_member(organization_id));

-- ---------------------------------------------------------------------------
-- Grants. anon gets nothing. authenticated gets table privileges; RLS decides rows.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
revoke update, delete on public.domain_events from authenticated;
revoke insert, delete on public.organizations from authenticated;
revoke insert, delete on public.profiles from authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_role(uuid, public.membership_role[]) to authenticated;
grant execute on function private.current_actor() to authenticated;
grant execute on function private.current_proposal_id() to authenticated;
