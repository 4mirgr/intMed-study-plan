-- Completed machine analysis belongs to the draft review queue, not the active
-- Telegram ingest queue. This one-time repair releases historical false-active rows.
begin;

update public.intmed_content_ingest i
set status='accepted',error_code=null,updated_at=now()
where i.status='pending_review'
  and exists(
    select 1 from public.intmed_content_drafts d
    where d.ingest_id=i.id
      and d.status in ('draft_ready','approved','publish_requested','publishing','published','publish_error','rejected')
  );

commit;
