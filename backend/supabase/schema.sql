-- IntMed private user data schema. Apply in a private Supabase project.
-- Browser clients receive only the anon key; never expose the service-role key.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  email text,
  full_name text,
  degree text,
  id_number text,
  phone text,
  role text not null default 'user' check (role in ('user', 'admin')),
  approved boolean not null default false,
  rejected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.study_state enable row level security;
alter table public.tickets enable row level security;

revoke all on public.profiles, public.study_state, public.tickets from anon;
grant select on public.profiles, public.study_state, public.tickets to authenticated;
grant insert, update on public.study_state, public.tickets to authenticated;

create or replace function public.is_intmed_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and approved); $$;

create or replace function public.is_intmed_approved()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and approved and not rejected); $$;

revoke all on function public.is_intmed_admin() from public;
revoke all on function public.is_intmed_approved() from public;
grant execute on function public.is_intmed_admin(), public.is_intmed_approved() to authenticated;

drop policy if exists "profile self or admin read" on public.profiles;
drop policy if exists "profile self update" on public.profiles;
drop policy if exists "profile admin update" on public.profiles;
create policy "profile self or admin read" on public.profiles for select
  using (id = auth.uid() or public.is_intmed_admin());
create policy "profile self update" on public.profiles for update
  using (id = auth.uid() and public.is_intmed_approved())
  with check (id = auth.uid() and public.is_intmed_approved());
create policy "profile admin update" on public.profiles for update
  using (public.is_intmed_admin()) with check (public.is_intmed_admin());

-- Prevent a browser client from promoting itself or bypassing approval by changing protected
-- columns directly. Admin approval goes through the checked RPC below.
revoke update on public.profiles from authenticated;
grant update(full_name, degree, id_number, phone, email, updated_at) on public.profiles to authenticated;

create or replace function public.set_intmed_user_approval(target_user uuid, new_approved boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_intmed_admin() then
    raise exception 'admin required' using errcode = '42501';
  end if;
  update public.profiles
  set approved = new_approved, rejected = not new_approved, updated_at = now()
  where id = target_user;
end;
$$;
revoke all on function public.set_intmed_user_approval(uuid, boolean) from public;
grant execute on function public.set_intmed_user_approval(uuid, boolean) to authenticated;

drop policy if exists "state self or admin read" on public.study_state;
drop policy if exists "state self insert" on public.study_state;
drop policy if exists "state self or admin update" on public.study_state;
create policy "state self or admin read" on public.study_state for select
  using ((user_id = auth.uid() and public.is_intmed_approved()) or public.is_intmed_admin());
create policy "state self insert" on public.study_state for insert
  with check ((user_id = auth.uid() and public.is_intmed_approved()) or public.is_intmed_admin());
create policy "state self or admin update" on public.study_state for update
  using ((user_id = auth.uid() and public.is_intmed_approved()) or public.is_intmed_admin())
  with check ((user_id = auth.uid() and public.is_intmed_approved()) or public.is_intmed_admin());

drop policy if exists "ticket owner or admin read" on public.tickets;
drop policy if exists "ticket owner or admin insert" on public.tickets;
drop policy if exists "ticket owner or admin update" on public.tickets;
create policy "ticket owner or admin read" on public.tickets for select
  using ((user_id = auth.uid() and public.is_intmed_approved()) or public.is_intmed_admin());
create policy "ticket owner or admin insert" on public.tickets for insert
  with check ((user_id = auth.uid() and public.is_intmed_approved()) or public.is_intmed_admin());
create policy "ticket owner or admin update" on public.tickets for update
  using ((user_id = auth.uid() and public.is_intmed_approved()) or public.is_intmed_admin())
  with check ((user_id = auth.uid() and public.is_intmed_approved()) or public.is_intmed_admin());

create or replace function public.handle_intmed_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, username, email, full_name, degree, id_number, phone, approved, rejected)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1) || '-' || left(new.id::text, 6)),
    new.email,
    new.raw_user_meta_data->>'fullName',
    new.raw_user_meta_data->>'degree',
    new.raw_user_meta_data->>'idNumber',
    new.raw_user_meta_data->>'phone',
    coalesce(new.raw_user_meta_data->>'app'='intmed', false),
    false
  ) on conflict (id) do nothing;
  insert into public.study_state(user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_intmed_user_created on auth.users;
create trigger on_intmed_user_created after insert on auth.users
for each row execute procedure public.handle_intmed_user();
