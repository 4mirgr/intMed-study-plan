-- Private original PDF figures; apply after content_jobs.sql and content_review.sql.
begin;
create table if not exists public.intmed_content_figures (
 id uuid primary key default gen_random_uuid(),
 ingest_id uuid not null references public.intmed_content_ingest(id) on delete cascade,
 job_id uuid not null references public.intmed_content_jobs(id) on delete cascade,
 page integer not null check(page between 1 and 2000),
 xref integer not null check(xref>0),
 width integer not null check(width>=128),height integer not null check(height>=128),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 storage_path text not null,
 mime_type text not null check(mime_type in ('image/png','image/jpeg')),
 byte_size integer not null check(byte_size between 1 and 5242880),
 stored boolean not null default false,
 created_at timestamptz not null default now(),
 unique(ingest_id,sha256,page),
 check(width::bigint*height<=100000000),
 check(storage_path='figures/'||ingest_id::text||'/'||sha256||case mime_type when 'image/png' then '.png' else '.jpg' end)
);
alter table public.intmed_content_figures enable row level security;
revoke all on public.intmed_content_figures from public,anon,authenticated;
grant all on public.intmed_content_figures to service_role;

create or replace function public.guard_intmed_content_figure() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 -- Serialize quota checks per PDF, including concurrent requests/retries.
 perform 1 from public.intmed_content_ingest where id=new.ingest_id and kind='pdf' for update;
 if not found then raise exception 'PDF parent required'; end if;
 if not exists(select 1 from public.intmed_content_jobs where id=new.job_id and ingest_id=new.ingest_id and kind='extract' and status='running') then raise exception 'running extraction required'; end if;
 if exists(select 1 from public.intmed_content_figures where ingest_id=new.ingest_id and sha256=new.sha256 and page=new.page) then return null; end if;
 if (select count(*) from public.intmed_content_figures where ingest_id=new.ingest_id)>=80 or
    (select coalesce(sum(byte_size),0) from public.intmed_content_figures where ingest_id=new.ingest_id)+new.byte_size>31457280 then raise exception 'figure storage limit'; end if;
 return new;
end $$;
revoke all on function public.guard_intmed_content_figure() from public,anon,authenticated;
drop trigger if exists intmed_content_figure_guard on public.intmed_content_figures;
create trigger intmed_content_figure_guard before insert on public.intmed_content_figures for each row execute function public.guard_intmed_content_figure();

alter table public.intmed_content_ingest add column if not exists derived_figure_id uuid unique references public.intmed_content_figures(id);
-- One original can occur on several pages. Child rows share the private object;
-- retain Telegram object uniqueness without blocking distinct figure provenance.
alter table public.intmed_content_ingest drop constraint if exists intmed_content_ingest_storage_path_key;
create unique index if not exists intmed_content_ingest_telegram_storage_unique on public.intmed_content_ingest(storage_path) where derived_figure_id is null;
alter table public.intmed_content_ingest alter column telegram_update_id drop not null;
alter table public.intmed_content_ingest alter column telegram_chat_id drop not null;
alter table public.intmed_content_ingest alter column telegram_message_id drop not null;
alter table public.intmed_content_ingest drop constraint if exists intmed_content_ingest_origin_check;
alter table public.intmed_content_ingest add constraint intmed_content_ingest_origin_check check(
 (derived_figure_id is null and telegram_update_id is not null and telegram_chat_id is not null and telegram_message_id is not null)
 or (derived_figure_id is not null and telegram_update_id is null and telegram_chat_id is null and telegram_message_id is null and telegram_file_id is null)
);
alter table public.intmed_content_ingest drop constraint if exists intmed_content_ingest_payload_check;
alter table public.intmed_content_ingest add constraint intmed_content_ingest_payload_check check(
 (derived_figure_id is null and kind='text' and mime_type='text/plain' and telegram_file_id is null and storage_path is null and content_text is not null and char_length(content_text) between 1 and 12000 and byte_size between 1 and 65536)
 or (derived_figure_id is null and kind in ('pdf','image') and mime_type in ('application/pdf','image/jpeg','image/png','image/webp') and telegram_file_id is not null and storage_path is not null and content_text is null and byte_size between 1 and 20971520)
 or (derived_figure_id is not null and kind='image' and mime_type in ('image/jpeg','image/png') and telegram_file_id is null and storage_path is not null and content_text is null and byte_size between 1 and 5242880)
);

create or replace function public.intmed_materialize_figure(p_figure_id uuid,p_reviewer_id uuid,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare figure public.intmed_content_figures%rowtype; parent public.intmed_content_drafts%rowtype;
 child_id uuid; child_draft uuid; reused boolean:=false;
begin
 if not exists(select 1 from public.profiles where id=p_reviewer_id and role='admin' and approved and not rejected) then raise exception 'admin required'; end if;
 select * into figure from public.intmed_content_figures where id=p_figure_id and stored;
 if not found then raise exception 'figure not found'; end if;
 select * into parent from public.intmed_content_drafts where ingest_id=figure.ingest_id for update;
 if not found or p_expected_revision is null or parent.review_revision<>p_expected_revision then raise exception 'stale review revision'; end if;
 if parent.status in ('publishing','publish_requested','rejected','processing') or exists(select 1 from public.intmed_content_jobs where ingest_id=figure.ingest_id and status in ('queued','running')) then raise exception 'parent busy'; end if;
 select id into child_id from public.intmed_content_ingest where derived_figure_id=figure.id;
 if child_id is not null then reused:=true;
 else
  insert into public.intmed_content_ingest(derived_figure_id,kind,mime_type,byte_size,storage_path,sha256,original_filename,status,caption)
  values(figure.id,'image',figure.mime_type,figure.byte_size,figure.storage_path,figure.sha256,'figure-page-'||figure.page||case figure.mime_type when 'image/png' then '.png' else '.jpg' end,'accepted','Private PDF figure; page '||figure.page)
  returning id into child_id;
 end if;
 insert into public.intmed_content_drafts(ingest_id,status,title,source_summary,target_content_kind,target_source_class,review_revision,draft_json)
 values(child_id,'draft_ready','تصویر صفحه '||figure.page,'تصویر اصلی استخراج‌شده از PDF خصوصی؛ تفسیر علمی، عنوان و حقوق استفاده باید توسط مدرس بررسی شود. Parent ingest: '||figure.ingest_id||'; page: '||figure.page||'; SHA-256: '||figure.sha256,'image',null,0,
  jsonb_build_object('figureOrigin',jsonb_build_object('figureId',figure.id,'ingestId',figure.ingest_id,'page',figure.page,'xref',figure.xref,'sha256',figure.sha256),'warnings',jsonb_build_array('حقوق استفاده و تفسیر تصویر نیازمند بررسی مدرس است.')))
 on conflict(ingest_id) do nothing;
 select id into child_draft from public.intmed_content_drafts where ingest_id=child_id;
 return jsonb_build_object('ingestId',child_id,'draftId',child_draft,'reused',reused);
end $$;
revoke all on function public.intmed_materialize_figure(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.intmed_materialize_figure(uuid,uuid,integer) to service_role;
commit;
