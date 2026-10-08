-- ReQover OS · 0002 · Profiles, organization bootstrap, default pipeline and discovery catalog

-- Profile row for every auth user.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, first_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), ''),
    nullif(new.raw_user_meta_data ->> 'first_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Defaults every organization starts with: one pipeline, its stages, the discovery catalog.
create or replace function private.seed_organization_defaults(org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  pipeline uuid;
begin
  insert into public.pipelines (organization_id, key, name)
  values (org, 'sales', 'Vertriebspipeline')
  returning id into pipeline;

  insert into public.pipeline_stages (organization_id, pipeline_id, key, name, position, outcome) values
    (org, pipeline, 'to_contact',          'Kontakt aufnehmen',        1, 'open'),
    (org, pipeline, 'contacted',           'Kontaktiert',              2, 'open'),
    (org, pipeline, 'discovery_scheduled', 'Discovery vereinbart',     3, 'open'),
    (org, pipeline, 'discovery_done',      'Discovery durchgeführt',   4, 'open'),
    (org, pipeline, 'need_confirmed',      'Bedarf bestätigt',         5, 'open'),
    (org, pipeline, 'pilot_opportunity',   'Pilot-Chance',             6, 'open'),
    (org, pipeline, 'proposal',            'Angebot',                  7, 'open'),
    (org, pipeline, 'won',                 'Gewonnen',                 8, 'won'),
    (org, pipeline, 'lost',                'Verloren',                 9, 'lost');

  -- Discovery catalog v1 (sections A–G of the spec; H lives in insights).
  insert into public.discovery_questions (organization_id, key, section, prompt, answer_type, options, position, is_core) values
    (org, 'offering',                 'company',       'Was verkauft das Unternehmen, und in welcher Form (Projekte, Serie, Service)?', 'long_text', '[]', 10, false),
    (org, 'sales_team_size',          'company',       'Wie viele Personen arbeiten im Vertrieb (Innen- und Außendienst)?', 'number', '[]', 20, false),
    (org, 'quotes_per_month',         'sales_process', 'Wie viele Angebote erstellen Sie ungefähr pro Monat?', 'range', '[]', 110, true),
    (org, 'typical_quote_value',      'sales_process', 'Wie hoch ist ein typischer Angebotswert (in €)?', 'range', '[]', 120, true),
    (org, 'sales_cycle',              'sales_process', 'Wie lange dauert ein typischer Sales Cycle?', 'text', '[]', 130, false),
    (org, 'followup_owner',           'sales_process', 'Wer verfolgt Angebote nach?', 'text', '[]', 140, true),
    (org, 'crm_erp',                  'sales_process', 'Welches CRM bzw. ERP nutzen Sie?', 'text', '[]', 150, false),
    (org, 'fixed_followups',          'sales_process', 'Gibt es feste Wiedervorlagen?', 'boolean', '[]', 160, false),
    (org, 'followup_process',         'sales_process', 'Gibt es einen definierten Follow-up-Prozess?', 'boolean', '[]', 170, false),
    (org, 'lost_definition',          'sales_process', 'Wann gilt ein Angebot als verloren?', 'text', '[]', 180, false),
    (org, 'postponed_projects',       'sales_process', 'Was passiert mit verschobenen Projekten?', 'text', '[]', 190, false),
    (org, 'unreachable_customers',    'sales_process', 'Was passiert bei nicht erreichbaren Kunden?', 'text', '[]', 200, false),
    (org, 'inactive_customers_work',  'sales_process', 'Werden inaktive Kunden systematisch bearbeitet?', 'boolean', '[]', 210, false),
    (org, 'old_open_quotes',          'problem',       'Gibt es ältere, ungeklärte Angebote?', 'boolean', '[]', 310, true),
    (org, 'old_open_quotes_count',    'problem',       'Wie viele ältere, ungeklärte Angebote ungefähr?', 'range', '[]', 320, false),
    (org, 'dormant_projects',         'problem',       'Gibt es eingeschlafene Projekte?', 'boolean', '[]', 330, false),
    (org, 'dormant_projects_count',   'problem',       'Wie viele eingeschlafene Projekte ungefähr?', 'range', '[]', 340, false),
    (org, 'inactive_customers',       'problem',       'Gibt es inaktive Bestandskunden?', 'boolean', '[]', 350, false),
    (org, 'stale_leads',              'problem',       'Bleiben Leads oder Messekontakte liegen?', 'boolean', '[]', 360, false),
    (org, 'problem_frequency',        'problem',       'Wie häufig passiert das?', 'text', '[]', 370, false),
    (org, 'problem_cause',            'problem',       'Was ist aus Ihrer Sicht die Ursache?', 'long_text', '[]', 380, true),
    (org, 'economic_impact',          'problem',       'Welche wirtschaftlichen Folgen hat das?', 'long_text', '[]', 390, false),
    (org, 'current_solution',         'problem',       'Wie wird das heute gelöst?', 'long_text', '[]', 400, false),
    (org, 'current_effort',           'problem',       'Welcher Aufwand entsteht dafür heute?', 'text', '[]', 410, false),
    (org, 'who_suffers',              'problem',       'Wer leidet intern darunter?', 'text', '[]', 420, false),
    (org, 'generally_interesting',    'reaction',      'Ist externe Unterstützung bei liegengebliebenen Vorgängen grundsätzlich interessant?', 'boolean', '[]', 510, true),
    (org, 'most_interesting_area',    'reaction',      'Welcher Recovery-Bereich ist am interessantesten?', 'choice',
       '["Offene Angebote","Eingeschlafene Projekte","Inaktive Kunden","Leads und Messekontakte"]', 520, false),
    (org, 'allowed_tasks',            'reaction',      'Welche Aufgaben dürfte ein externer Partner übernehmen?', 'long_text', '[]', 530, false),
    (org, 'forbidden_tasks',          'reaction',      'Welche Aufgaben auf keinen Fall?', 'long_text', '[]', 540, false),
    (org, 'crm_access_ok',            'reaction',      'Wäre CRM-Zugriff denkbar?', 'boolean', '[]', 550, false),
    (org, 'customer_contact_ok',      'reaction',      'Wäre direkter Kundenkontakt denkbar?', 'boolean', '[]', 560, false),
    (org, 'biggest_concern',          'reaction',      'Was ist die größte Sorge?', 'text', '[]', 570, true),
    (org, 'requirements',             'reaction',      'Welche Anforderungen gibt es?', 'long_text', '[]', 580, false),
    (org, 'pilot_reaction',           'willingness_to_pay', 'Wie war die Reaktion auf das Pilotangebot?', 'long_text', '[]', 610, true),
    (org, 'decision_maker',           'buying_process','Wer entscheidet?', 'text', '[]', 710, true),
    (org, 'budget_owner',             'buying_process','Wer verantwortet das Budget?', 'text', '[]', 720, false),
    (org, 'involved_parties',         'buying_process','Wer wäre an einer Entscheidung beteiligt?', 'multi_choice',
       '["Vertrieb","Geschäftsführung","Einkauf","Datenschutz","IT"]', 730, false),
    (org, 'approval_process',         'buying_process','Wie läuft der Freigabeprozess?', 'long_text', '[]', 740, false),
    (org, 'possible_start',           'buying_process','Wann wäre ein Start denkbar?', 'date', '[]', 750, false);
end;
$$;

-- Creates an organization for the calling user, who becomes its owner.
-- Only allowed while the user has no organization yet (invite-only system).
create or replace function private.create_my_organization(org_name text, org_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  org uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from public.memberships where user_id = uid) then
    raise exception 'user already belongs to an organization' using errcode = '42501';
  end if;

  insert into public.organizations (name, slug, settings)
  values (
    org_name,
    org_slug,
    jsonb_build_object(
      'version', 1,
      'aiLevel', 2,
      'pilotOffer', jsonb_build_object('maxCases', 100, 'durationWeeks', 6, 'priceMinCents', 250000, 'priceMaxCents', 300000)
    )
  )
  returning id into org;

  insert into public.memberships (organization_id, user_id, role) values (org, uid, 'owner');
  perform private.seed_organization_defaults(org);
  return org;
end;
$$;

revoke all on function private.create_my_organization(text, text) from public;
grant execute on function private.create_my_organization(text, text) to authenticated;
revoke all on function private.seed_organization_defaults(uuid) from public;
revoke all on function private.handle_new_user() from public;
