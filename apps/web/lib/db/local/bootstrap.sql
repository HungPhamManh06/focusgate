-- Local development bootstrap.
-- Mirrors the pieces of Supabase that the migrations depend on: the auth schema,
-- auth.users, auth.uid() and the API roles. Production uses Supabase Auth and
-- never this file.

create schema if not exists auth;

create table if not exists auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table if not exists auth.local_meta (
    key text primary key,
    value text not null,
    created_at timestamptz not null default now()
);

do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin;
    end if;
end $$;

grant usage on schema auth to anon, authenticated;
grant select on auth.users to authenticated;
