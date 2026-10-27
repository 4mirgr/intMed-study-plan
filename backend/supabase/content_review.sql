-- Admin-only review queue for drafts produced by the Telegram/LM Studio pipeline.
-- This migration never publishes canonical educational content.
begin;

alter table public.intmed_content_drafts
  drop constraint if exists intmed_content_drafts_status_check;
alter table public.intmed_content_drafts
  add constraint intmed_content_drafts_status_check
  check(status in ('queued','waiting_provider','processing','draft_ready','approved','error','rejected'));

alter table public.intmed_content_drafts
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewer_note text,
  add column if not exists review_revision integer not null default 0
    check(review_revision between 0 and 1000000);

create table if not exists public.intmed_content_review_events(
  id bigint generated always as identity primary key,
  draft_id uuid not null references public.intmed_content_drafts(id) on delete cascade,
  reviewer_id uuid references public.profiles(id) on delete set null,
  action text not null check(action in ('save','approve','reject','reopen')),
  status_before text,
  status_after text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists intmed_content_review_events_draft_idx
on public.intmed_content_review_events(draft_id,created_at desc);
create index if not exists intmed_content_review_events_reviewer_idx
on public.intmed_content_review_events(reviewer_id,created_at desc);
create index if not exists intmed_content_drafts_reviewer_idx
on public.intmed_content_drafts(reviewed_by,reviewed_at desc);

alter table public.intmed_content_review_events enable row level security;
revoke all on public.intmed_content_review_events from public,anon,authenticated;
grant all on public.intmed_content_review_events to service_role;

create or replace function public.apply_intmed_content_review(
  target_draft uuid, reviewer uuid, expected_revision integer, review_action text,
  new_status text, new_title text, new_topic text, new_summary text, new_note text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare before_status text; saved public.intmed_content_drafts%rowtype;
begin
  if not exists(select 1 from public.profiles where id=reviewer and role='admin' and approved and not rejected) then
    raise exception 'admin required';
  end if;
  if review_action not in ('save','approve','reject','reopen')
     or new_status not in ('draft_ready','approved','rejected') then
    raise exception 'invalid review action';
  end if;
  select status into before_status from public.intmed_content_drafts
  where id=target_draft and review_revision=expected_revision for update;
  if not found then raise exception 'stale review revision'; end if;
  update public.intmed_content_drafts set
    status=new_status,title=new_title,topic_id=nullif(new_topic,''),source_summary=new_summary,
    reviewer_note=nullif(new_note,''),reviewed_by=reviewer,reviewed_at=now(),
    review_revision=review_revision+1,updated_at=now()
  where id=target_draft and review_revision=expected_revision returning * into saved;
  if not found then raise exception 'stale review revision'; end if;
  insert into public.intmed_content_review_events(
    draft_id,reviewer_id,action,status_before,status_after,note
  ) values(target_draft,reviewer,review_action,before_status,new_status,nullif(new_note,''));
  return to_jsonb(saved);
end $$;
revoke all on function public.apply_intmed_content_review(uuid,uuid,integer,text,text,text,text,text,text)
from public,anon,authenticated;
grant execute on function public.apply_intmed_content_review(uuid,uuid,integer,text,text,text,text,text,text)
to service_role;

-- Draft/source tables remain service-only. The browser can reach them solely through the
-- role-checking Edge Function, so an authenticated non-admin cannot enumerate private inbox data.
commit;
