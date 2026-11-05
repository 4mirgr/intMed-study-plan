-- Serialize approved publications without storing private content in another queue.
begin;
create or replace function public.claim_intmed_publication()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare claimed public.intmed_content_drafts%rowtype;
begin
  -- Every cloud publication claimant takes the same transaction-scoped lock.
  perform pg_advisory_xact_lock(742109,1);
  update public.intmed_content_drafts set status='publish_error',
    publish_error='Cloud publication timed out; review the live result before retrying.',updated_at=now()
  where status='publishing' and publishing_runner='github-actions'
    and publishing_started_at<now()-interval '35 minutes';
  if exists(select 1 from public.intmed_content_drafts where status='publishing') then return null; end if;
  select * into claimed from public.intmed_content_drafts
  where status='publish_requested'
  order by publish_requested_at nulls last,updated_at,id
  limit 1 for update skip locked;
  if not found then return null; end if;
  update public.intmed_content_drafts set status='publishing',publishing_runner='github-actions',
    publishing_started_at=now(),publish_error=null,updated_at=now() where id=claimed.id;
  return jsonb_build_object('id',claimed.id,'title',claimed.title);
end $$;
revoke all on function public.claim_intmed_publication() from public,anon,authenticated;
grant execute on function public.claim_intmed_publication() to service_role;
commit;
