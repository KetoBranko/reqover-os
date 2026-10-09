-- ProRendo · 0006 · Contact-form inquiries from the landing page.
-- An inquiry arrives without a user session. The server first resolves the
-- receiving organization and its owner with this function, then writes the
-- inquiry as that owner through RLS (withUserTx). The function only answers
-- calls without a signed-in user, so members cannot use it to look up owners.
-- Without an explicit organization it answers only while exactly one exists.

create or replace function private.inquiry_target(p_organization_id uuid default null)
returns table (organization_id uuid, owner_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null then
    raise exception 'only for requests without a user session' using errcode = '42501';
  end if;
  if p_organization_id is null and (select count(*) from public.organizations) <> 1 then
    return;
  end if;
  return query
    select m.organization_id, m.user_id
    from public.memberships m
    where m.role = 'owner'
      and (p_organization_id is null or m.organization_id = p_organization_id)
    order by m.created_at
    limit 1;
end;
$$;

revoke all on function private.inquiry_target(uuid) from public;
grant execute on function private.inquiry_target(uuid) to authenticated;
