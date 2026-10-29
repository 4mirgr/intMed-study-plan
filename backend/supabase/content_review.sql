-- Admin-only review queue for drafts produced by the Telegram/LM Studio pipeline.
-- This migration never publishes canonical educational content.
begin;

alter table public.intmed_content_drafts
  drop constraint if exists intmed_content_drafts_status_check;
alter table public.intmed_content_drafts
  add constraint intmed_content_drafts_status_check
  check(status in ('queued','waiting_provider','processing','draft_ready','approved','publish_requested','publishing','published','publish_error','error','rejected'));

alter table public.intmed_content_drafts
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewer_note text,
  add column if not exists target_category_id text
    check(target_category_id is null or target_category_id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  add column if not exists target_topic_label text
    check(target_topic_label is null or char_length(target_topic_label) between 2 and 160),
  add column if not exists target_topic_is_new boolean not null default false,
  add column if not exists target_content_kind text not null default 'lesson'
    check(target_content_kind in ('lesson','image','pbs','algorithm','table','tracing','radiology','pathology','clinical','chart')),
  add column if not exists target_source_class text
    check(target_source_class is null or target_source_class in ('harrison-private','authored','open-license')),
  add column if not exists target_rights_note text
    check(target_rights_note is null or char_length(target_rights_note) between 5 and 600),
  add column if not exists publish_requested_by uuid references public.profiles(id) on delete set null,
  add column if not exists publish_requested_at timestamptz,
  add column if not exists publishing_started_at timestamptz,
  add column if not exists publishing_runner text,
  add column if not exists published_at timestamptz,
  add column if not exists published_commit text,
  add column if not exists publish_error text,
  add column if not exists review_revision integer not null default 0
    check(review_revision between 0 and 1000000);

create table if not exists public.intmed_content_review_events(
  id bigint generated always as identity primary key,
  draft_id uuid not null references public.intmed_content_drafts(id) on delete cascade,
  reviewer_id uuid references public.profiles(id) on delete set null,
  action text not null check(action in ('save','approve','reject','reopen','publish')),
  status_before text,
  status_after text not null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.intmed_content_review_events drop constraint if exists intmed_content_review_events_action_check;
alter table public.intmed_content_review_events add constraint intmed_content_review_events_action_check
check(action in ('save','approve','reject','reopen','publish'));
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
  new_status text, new_title text, new_topic text, new_summary text, new_note text,
  new_category text, new_topic_label text, new_topic_is_new boolean,
  new_content_kind text, new_source_class text, new_rights_note text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare before_status text; saved public.intmed_content_drafts%rowtype;
begin
  if not exists(select 1 from public.profiles where id=reviewer and role='admin' and approved and not rejected) then
    raise exception 'admin required';
  end if;
  if review_action not in ('save','approve','reject','reopen','publish')
     or new_status not in ('draft_ready','approved','rejected','publish_requested') then
    raise exception 'invalid review action';
  end if;
  if new_content_kind not in ('lesson','image','pbs','algorithm','table','tracing','radiology','pathology','clinical','chart')
     or (new_content_kind <> 'lesson' and new_source_class not in ('harrison-private','authored','open-license')) then
    raise exception 'invalid content routing';
  end if;
  if new_topic_is_new and (nullif(new_category,'') is null or char_length(new_topic_label) < 2) then
    raise exception 'invalid new topic';
  end if;
  select status into before_status from public.intmed_content_drafts
  where id=target_draft and review_revision=expected_revision for update;
  if not found then raise exception 'stale review revision'; end if;
  if review_action='publish' and before_status not in ('approved','publish_error') then
    raise exception 'draft not approved for publish';
  end if;
  update public.intmed_content_drafts set
    status=new_status,title=new_title,topic_id=nullif(new_topic,''),source_summary=new_summary,
    target_category_id=nullif(new_category,''),target_topic_label=nullif(new_topic_label,''),
    target_topic_is_new=new_topic_is_new,target_content_kind=new_content_kind,
    target_source_class=nullif(new_source_class,''),target_rights_note=nullif(new_rights_note,''),
    publish_requested_by=case when review_action='publish' then reviewer else publish_requested_by end,
    publish_requested_at=case when review_action='publish' then now() else publish_requested_at end,
    publish_error=case when review_action='publish' then null else publish_error end,
    reviewer_note=nullif(new_note,''),reviewed_by=reviewer,reviewed_at=now(),
    review_revision=review_revision+1,updated_at=now()
  where id=target_draft and review_revision=expected_revision returning * into saved;
  if not found then raise exception 'stale review revision'; end if;
  insert into public.intmed_content_review_events(
    draft_id,reviewer_id,action,status_before,status_after,note
  ) values(target_draft,reviewer,review_action,before_status,new_status,nullif(new_note,''));
  return to_jsonb(saved);
end $$;
revoke all on function public.apply_intmed_content_review(uuid,uuid,integer,text,text,text,text,text,text,text,text,boolean,text,text,text)
from public,anon,authenticated;
grant execute on function public.apply_intmed_content_review(uuid,uuid,integer,text,text,text,text,text,text,text,text,boolean,text,text,text)
to service_role;

create or replace function public.claim_intmed_content_publish(claimant uuid, local_runner_id text)
returns uuid language plpgsql security definer set search_path=public as $$
declare claimed uuid;
begin
  if not exists(select 1 from public.profiles where id=claimant and role='admin' and approved and not rejected) then
    raise exception 'admin required';
  end if;
  select id into claimed from public.intmed_content_drafts
  where status='publish_requested' or (status='publishing' and publishing_started_at<now()-interval '30 minutes')
  order by publish_requested_at nulls last,updated_at for update skip locked limit 1;
  if claimed is null then return null; end if;
  update public.intmed_content_drafts set status='publishing',publishing_started_at=now(),
    publishing_runner=left(local_runner_id,80),publish_error=null,updated_at=now()
  where id=claimed;
  return claimed;
end $$;

create or replace function public.complete_intmed_content_publish(
  target_draft uuid, claimant uuid, local_runner_id text, commit_sha text
) returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.profiles where id=claimant and role='admin' and approved and not rejected) then
    raise exception 'admin required';
  end if;
  update public.intmed_content_drafts set status='published',published_at=now(),
    published_commit=left(commit_sha,80),publish_error=null,updated_at=now()
  where id=target_draft and status='publishing' and publishing_runner=left(local_runner_id,80);
  return found;
end $$;

create or replace function public.fail_intmed_content_publish(
  target_draft uuid, claimant uuid, local_runner_id text, failure text
) returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.profiles where id=claimant and role='admin' and approved and not rejected) then
    raise exception 'admin required';
  end if;
  update public.intmed_content_drafts set status='publish_error',publish_error=left(failure,1000),updated_at=now()
  where id=target_draft and status='publishing' and publishing_runner=left(local_runner_id,80);
  return found;
end $$;

revoke all on function public.claim_intmed_content_publish(uuid,text),
  public.complete_intmed_content_publish(uuid,uuid,text,text),
  public.fail_intmed_content_publish(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_intmed_content_publish(uuid,text),
  public.complete_intmed_content_publish(uuid,uuid,text,text),
  public.fail_intmed_content_publish(uuid,uuid,text,text) to service_role;

-- Draft/source tables remain service-only. The browser can reach them solely through the
-- role-checking Edge Function, so an authenticated non-admin cannot enumerate private inbox data.
commit;
