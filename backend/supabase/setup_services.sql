-- Generated with scripts/build_services_setup.py. No credentials or owner rename.

-- SOURCE: dashboard_upgrade.sql
-- Additive upgrade. No users, UUIDs, highlights or study rows are replaced.
begin;
-- The Auth email is authoritative. Profile/contact edits cannot change it.
revoke update(email) on public.profiles from authenticated;
update public.profiles p set email=u.email from auth.users u
where p.id=u.id and u.email_confirmed_at is not null and p.email is distinct from u.email;
create or replace function public.sync_intmed_auth_email()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
  if new.email is distinct from old.email then
    update public.profiles set email=new.email,updated_at=now() where id=new.id;
  end if;
  return new;
end; $$;
drop trigger if exists on_intmed_email_updated on auth.users;
create trigger on_intmed_email_updated after update of email on auth.users
for each row execute function public.sync_intmed_auth_email();

create or replace function public.update_intmed_username(new_username text)
returns void language plpgsql security definer set search_path=public
as $$
declare normalized text:=lower(trim(new_username));
begin
  if not public.is_intmed_approved() then raise exception 'approved account required' using errcode='42501'; end if;
  if normalized is null or normalized !~ '^[a-z0-9_.-]{3,64}$' then raise exception 'Invalid username'; end if;
  update public.profiles set username=normalized,updated_at=now() where id=auth.uid();
end; $$;
revoke all on function public.update_intmed_username(text) from public,anon;
grant execute on function public.update_intmed_username(text) to authenticated;

create or replace function public.set_intmed_user_approval(target_user uuid,new_approved boolean)
returns void language plpgsql security definer set search_path=public
as $$ begin
  if not public.is_intmed_admin() or not public.is_intmed_approved() then raise exception 'admin required' using errcode='42501'; end if;
  if new_approved is null then raise exception 'Approval value required'; end if;
  if target_user=auth.uid() or exists(select 1 from public.profiles where id=target_user and role='admin') then
    raise exception 'Administrator access cannot be suspended here' using errcode='42501';
  end if;
  update public.profiles set approved=new_approved,rejected=not new_approved,updated_at=now() where id=target_user;
end; $$;
revoke all on function public.set_intmed_user_approval(uuid,boolean) from public,anon;
grant execute on function public.set_intmed_user_approval(uuid,boolean) to authenticated;
commit;

-- SOURCE: automatic_access.sql
-- Temporarily remove manual manager approval for new IntMed registrations.
-- Email confirmation remains controlled by Supabase Auth and should stay enabled.
create or replace function public.handle_intmed_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.raw_user_meta_data->>'app'='intmed' then
    if coalesce(new.raw_user_meta_data->>'username','') !~ '^[a-z0-9_.-]{3,64}$'
      or length(trim(coalesce(new.raw_user_meta_data->>'fullName','')))=0
      or coalesce(new.raw_user_meta_data->>'degree','') not in
        ('دانشجوی پزشکی','اینترن','پزشکی عمومی','رزیدنت','متخصص','فلوشیپ','فوق تخصص') then
      raise exception 'Invalid IntMed signup profile';
    end if;
  end if;
  insert into public.profiles(id,username,email,full_name,degree,id_number,phone,specialty,province,approved,rejected)
  values(new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username',''),split_part(new.email,'@',1)||'-'||left(new.id::text,6)),
    new.email,new.raw_user_meta_data->>'fullName',new.raw_user_meta_data->>'degree',
    new.raw_user_meta_data->>'idNumber',new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'specialty',new.raw_user_meta_data->>'province',
    coalesce(new.raw_user_meta_data->>'app'='intmed',false),false)
  on conflict(id) do nothing;
  insert into public.study_state(user_id) values(new.id) on conflict(user_id) do nothing;
  return new;
end;
$$;

-- Activate only older IntMed registrations that were never rejected by a manager.
update public.profiles p set approved=true,updated_at=now()
from auth.users u
where u.id=p.id and u.raw_user_meta_data->>'app'='intmed'
  and not p.approved and not p.rejected;

-- SOURCE: telegram_notifications.sql
-- Install after dashboard_upgrade.sql. No Telegram secret is stored here.
-- This is the SAME PUBLIC anon key used by the website, not a service key.
begin;
create extension if not exists pg_net with schema extensions;
create table if not exists public.intmed_notification_settings(key text primary key,chat_id text);
insert into public.intmed_notification_settings(key) values('telegram') on conflict do nothing;
create table if not exists public.intmed_signup_alerts(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','processing','sent','error','dismissed')),
 attempts integer not null default 0,
 updated_at timestamptz not null default now()
);
-- Private delivery ledger for login/activity/message alerts and short-lived bot UI state.
-- The browser cannot read or forge either table; the Edge Function validates the signed-in
-- user before creating an alert and derives the displayed summary from server-side rows.
create table if not exists public.intmed_telegram_alerts(
 id uuid primary key default gen_random_uuid(),
 event_type text not null check(event_type in ('login','activity','message')),
 user_id uuid not null references public.profiles(id) on delete cascade,
 dedupe_key text not null unique,
 status text not null default 'pending' check(status in ('pending','processing','sent','error','dismissed')),
 payload jsonb not null default '{}'::jsonb,
 attempts integer not null default 0 check(attempts between 0 and 20),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists intmed_telegram_alerts_pending_idx
 on public.intmed_telegram_alerts(status,created_at) where status in ('pending','error');

create table if not exists public.intmed_bot_sessions(
 chat_id text primary key,
 mode text not null default 'idle' check(mode in ('idle','awaiting_topic_hint')),
 topic_hint text,
 updated_at timestamptz not null default now(),
 check(topic_hint is null or char_length(topic_hint) between 1 and 300)
);
alter table public.intmed_notification_settings enable row level security;
alter table public.intmed_signup_alerts enable row level security;
alter table public.intmed_telegram_alerts enable row level security;
alter table public.intmed_bot_sessions enable row level security;
revoke all on public.intmed_notification_settings,public.intmed_signup_alerts,public.intmed_telegram_alerts,public.intmed_bot_sessions from public,anon,authenticated;
grant all on public.intmed_notification_settings,public.intmed_signup_alerts,public.intmed_telegram_alerts,public.intmed_bot_sessions to service_role;

create or replace function public.claim_intmed_telegram_alert(target_alert uuid)
returns boolean language plpgsql security definer set search_path=public
as $$ declare claimed uuid; begin
 update public.intmed_telegram_alerts set status='processing',attempts=attempts+1,updated_at=now()
 where id=target_alert and attempts<20
 and (status in ('pending','error') or (status='processing' and updated_at<now()-interval '2 minutes'))
 returning id into claimed;
 return claimed is not null;
end; $$;
revoke all on function public.claim_intmed_telegram_alert(uuid) from public,anon,authenticated;
grant execute on function public.claim_intmed_telegram_alert(uuid) to service_role;
create or replace function public.claim_intmed_signup_alert(target_user uuid)
returns boolean language plpgsql security definer set search_path=public
as $$ declare claimed uuid; begin
 if not exists(select 1 from public.profiles where id=target_user and not rejected) then return false; end if;
 update public.intmed_signup_alerts set status='processing',attempts=attempts+1,updated_at=now()
 where user_id=target_user and (status in ('pending','error') or (status='processing' and updated_at<now()-interval '2 minutes'))
 returning user_id into claimed;
 return claimed is not null;
end; $$;
revoke all on function public.claim_intmed_signup_alert(uuid) from public,anon,authenticated;
grant execute on function public.claim_intmed_signup_alert(uuid) to service_role;
create or replace function public.queue_intmed_signup_notification()
returns trigger language plpgsql security definer set search_path=public
as $$ declare public_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwd2JrdHZueWJzanVnZGVnamppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MDU0MDgsImV4cCI6MjEwODA4MTQwOH0.4IPs739cff9qFV6MFy84s37FhBPC66Gh8dKxhB5YV34'; begin
 if new.rejected or not exists(select 1 from auth.users where id=new.id and raw_user_meta_data->>'app'='intmed') then return new; end if;
 insert into public.intmed_signup_alerts(user_id) values(new.id) on conflict do nothing;
 -- pg_net dispatches AFTER commit; provider/network failure cannot roll back signup.
 begin
   perform net.http_post(
     url := 'https://upwbktvnybsjugdegjji.supabase.co/functions/v1/intmed-signup-notify',
     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||public_anon,'apikey',public_anon),
     body := jsonb_build_object('type','INSERT','table','profiles','schema','public','record',jsonb_build_object('id',new.id))
   );
 exception when others then null; -- Pending outbox remains available for admin retry.
 end;
 return new;
end; $$;
drop trigger if exists on_intmed_signup_notify on public.profiles;
create trigger on_intmed_signup_notify after insert on public.profiles for each row execute function public.queue_intmed_signup_notification();
commit;

-- SOURCE: newsletter.sql
-- Run once in Supabase SQL Editor. Existing profiles/study_state are not modified.
begin;
create table if not exists public.intmed_newsletter_deliveries (
  campaign_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  body_hash text not null,
  status text not null check (status in ('processing','sent','error','uncertain')),
  provider_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id,user_id)
);
alter table public.intmed_newsletter_deliveries enable row level security;
revoke all on public.intmed_newsletter_deliveries from public, anon, authenticated;
grant select,insert,update,delete on public.intmed_newsletter_deliveries to service_role;
commit;

-- SOURCE: calendar_events.sql
-- Private idempotency ledger for study-plan reminder emails.
create table if not exists public.intmed_calendar_deliveries(
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  event_hash text not null,
  status text not null default 'processing' check(status in ('processing','sent','error','uncertain')),
  provider_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,plan_id,event_hash)
);
alter table public.intmed_calendar_deliveries enable row level security;
revoke all on public.intmed_calendar_deliveries from public,anon,authenticated;
grant all on public.intmed_calendar_deliveries to service_role;

-- SOURCE: security_hardening.sql
-- IntMed least-privilege update. No user/state content is deleted or rewritten.
begin;
create or replace function public.is_intmed_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and approved and not rejected); $$;
revoke all on function public.is_intmed_admin() from public,anon;
grant execute on function public.is_intmed_admin() to authenticated;
-- Managers retain read access for analytics/PDF. Only an approved owner may write
-- browser study state. Checked server functions retain their explicit duties.
drop policy if exists "state self insert" on public.study_state;
create policy "state self insert" on public.study_state for insert to authenticated
with check(user_id=auth.uid() and public.is_intmed_approved());
drop policy if exists "state self or admin update" on public.study_state;
create policy "state self or admin update" on public.study_state for update to authenticated
using(user_id=auth.uid() and public.is_intmed_approved())
with check(user_id=auth.uid() and public.is_intmed_approved());
commit;

-- SOURCE: recovery_support.sql
-- Additive recovery support. Anonymous writes only through the rate-limited Edge function.
begin;
create table if not exists public.intmed_recovery_tickets (
 id uuid primary key default gen_random_uuid(), full_name text not null,
 email text not null, message text not null, reply text not null default '',
 resolved boolean not null default false, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.intmed_recovery_tickets enable row level security;
revoke all on public.intmed_recovery_tickets from public,anon,authenticated;
grant select,update on public.intmed_recovery_tickets to authenticated;
grant all on public.intmed_recovery_tickets to service_role;
drop policy if exists "admin recovery tickets" on public.intmed_recovery_tickets;
create policy "admin recovery tickets" on public.intmed_recovery_tickets for all to authenticated
using (public.is_intmed_admin() and public.is_intmed_approved())
with check (public.is_intmed_admin() and public.is_intmed_approved());
commit;
