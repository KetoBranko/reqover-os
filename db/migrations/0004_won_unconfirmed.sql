-- ReQover OS · 0004 · Spec 34: "Gewonnen" without a documented order is possible,
-- but only as an explicit, recorded decision ("Trotzdem als gewonnen markieren").
-- The database keeps enforcing that a won opportunity has either an order date or
-- this explicit flag; nothing slips through silently.

alter table public.opportunities add column won_without_order boolean not null default false;

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

  if stage_outcome = 'won' and new.order_confirmed_at is null and not new.won_without_order then
    raise exception 'won opportunity requires order_confirmed_at or explicit won_without_order' using errcode = '23514', constraint = 'opportunity_won_requires_order';
  end if;
  if stage_outcome <> 'won' then
    new.won_without_order := false;
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
