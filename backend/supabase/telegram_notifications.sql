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
alter table public.intmed_notification_settings enable row level security;
alter table public.intmed_signup_alerts enable row level security;
revoke all on public.intmed_notification_settings,public.intmed_signup_alerts from public,anon,authenticated;
grant all on public.intmed_notification_settings,public.intmed_signup_alerts to service_role;
create or replace function public.claim_intmed_signup_alert(target_user uuid)
returns boolean language plpgsql security definer set search_path=public
as $$ declare claimed uuid; begin
 if not exists(select 1 from public.profiles where id=target_user and not approved and not rejected) then return false; end if;
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
 if new.approved or new.rejected or not exists(select 1 from auth.users where id=new.id and raw_user_meta_data->>'app'='intmed') then return new; end if;
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
