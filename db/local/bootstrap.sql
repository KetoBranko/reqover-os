-- LOCAL DEVELOPMENT ONLY.
-- Recreates the parts of a Supabase project that our migrations rely on:
-- the API roles (anon, authenticated, service_role), the auth admin role used
-- by the Supabase Auth server (GoTrue), and a login role for the Next.js
-- server that has no table privileges of its own and no BYPASSRLS.
-- On a hosted Supabase project all of this already exists; never run it there.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin noinherit createrole login password 'local-auth-admin';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_server') then
    create role app_server login noinherit password 'local-app-server';
  end if;
end
$$;

grant anon, authenticated to app_server;

create schema if not exists auth authorization supabase_auth_admin;
grant create on database reqover to supabase_auth_admin;
alter role supabase_auth_admin set search_path = 'auth';
grant usage on schema auth to authenticated, anon, service_role, app_server;
