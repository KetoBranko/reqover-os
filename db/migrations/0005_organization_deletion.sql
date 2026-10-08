-- ReQover OS · 0005 · Spec 35 "Löschbarkeit": an owner can delete the whole
-- organization with all its data. Organizations cannot be deleted through table
-- privileges (revoked in 0001), only through private.delete_organization, which
-- checks the owner role and a typed confirmation of the organization name.
-- Everything, including audit_logs and domain_events, goes with the cascade.

-- The audit trigger must not try to log rows of an organization that no longer
-- exists (the audit row would reference the deleted organization).
create or replace function private.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  old_json jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'search' - 'updated_at' end;
  new_json jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'search' - 'updated_at' end;
  changed text[] := '{}';
  k text;
begin
  -- Rows removed by the cascade of a deleted organization: the organization (and
  -- with it its audit log) is gone, so there is nothing left to attach a row to.
  -- Only private.delete_organization can delete an organization.
  if tg_op = 'DELETE' and tg_table_name <> 'organizations' and not exists (
    select 1 from public.organizations o where o.id = (to_jsonb(old) ->> 'organization_id')::uuid
  ) then
    return old;
  end if;
  if tg_op = 'DELETE' and tg_table_name = 'organizations' then
    return old;
  end if;

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

create or replace function private.delete_organization(org uuid, confirm_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  org_name text;
begin
  if not private.has_role(org, '{owner}') then
    raise exception 'only the owner can delete the organization' using errcode = '42501';
  end if;
  select o.name into org_name from public.organizations o where o.id = org;
  if org_name is null or confirm_name is distinct from org_name then
    raise exception 'confirmation does not match organization name' using errcode = '22023';
  end if;
  delete from public.organizations where id = org;
end
$$;

revoke all on function private.delete_organization(uuid, text) from public;
grant execute on function private.delete_organization(uuid, text) to authenticated;
