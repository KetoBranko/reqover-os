-- ReQover OS · 0003 · Opportunity integrity rules enforced in the database
-- * the stage must belong to the opportunity's pipeline
-- * "won" requires a documented order date, "lost" requires a reason
-- * stage_changed_at / closed_at are maintained here, not by clients

create or replace function private.opportunity_rules() returns trigger
language plpgsql set search_path = '' as $$
declare
  stage_pipeline uuid;
  stage_outcome public.stage_outcome;
begin
  select s.pipeline_id, s.outcome into stage_pipeline, stage_outcome
  from public.pipeline_stages s
  where s.id = new.stage_id and s.organization_id = new.organization_id;

  if stage_pipeline is null or stage_pipeline <> new.pipeline_id then
    raise exception 'stage does not belong to pipeline' using errcode = '23514';
  end if;

  if stage_outcome = 'won' and new.order_confirmed_at is null then
    raise exception 'won opportunity requires order_confirmed_at' using errcode = '23514', constraint = 'opportunity_won_requires_order';
  end if;
  if stage_outcome = 'lost' and coalesce(btrim(new.lost_reason), '') = '' then
    raise exception 'lost opportunity requires lost_reason' using errcode = '23514', constraint = 'opportunity_lost_requires_reason';
  end if;

  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    new.stage_changed_at := now();
  end if;
  new.closed_at := case
    when stage_outcome = 'open' then null
    when tg_op = 'UPDATE' and old.closed_at is not null and new.stage_id is not distinct from old.stage_id then old.closed_at
    else now()
  end;
  return new;
end;
$$;

create trigger opportunity_rules
  before insert or update on public.opportunities
  for each row execute function private.opportunity_rules();

create index opportunities_next_step_idx on public.opportunities (organization_id, next_step_date) where closed_at is null;
