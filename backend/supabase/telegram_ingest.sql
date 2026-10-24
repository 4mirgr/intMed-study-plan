-- Private Telegram content inbox. Apply after schema.sql and telegram_notifications.sql.
-- Text and files are quarantined for explicit review; no trigger publishes educational content.
begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'intmed-content-inbox',
  'intmed-content-inbox',
  false,
  20971520,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.intmed_content_ingest(
  id uuid primary key default gen_random_uuid(),
  telegram_update_id bigint not null unique,
  telegram_chat_id text not null,
  telegram_message_id bigint not null,
  telegram_file_id text,
  telegram_file_unique_id text,
  kind text not null,
  original_filename text,
  mime_type text not null,
  byte_size integer not null,
  storage_path text unique,
  sha256 text check(sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  caption text,
  content_text text,
  is_forwarded boolean not null default false,
  source_type text,
  source_name text,
  source_username text,
  source_message_id bigint,
  source_date timestamptz,
  suggested_topic_id text check(suggested_topic_id is null or suggested_topic_id ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  status text not null default 'quarantined' check(status in ('quarantined','pending_review','processing','accepted','rejected','error')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep the draft migration repeatable if an earlier file-only version was applied.
alter table public.intmed_content_ingest alter column telegram_file_id drop not null;
alter table public.intmed_content_ingest alter column storage_path drop not null;
alter table public.intmed_content_ingest add column if not exists content_text text;
alter table public.intmed_content_ingest add column if not exists is_forwarded boolean not null default false;
alter table public.intmed_content_ingest add column if not exists source_type text;
alter table public.intmed_content_ingest add column if not exists source_name text;
alter table public.intmed_content_ingest add column if not exists source_username text;
alter table public.intmed_content_ingest add column if not exists source_message_id bigint;
alter table public.intmed_content_ingest add column if not exists source_date timestamptz;
alter table public.intmed_content_ingest drop constraint if exists intmed_content_ingest_kind_check;
alter table public.intmed_content_ingest drop constraint if exists intmed_content_ingest_mime_type_check;
alter table public.intmed_content_ingest drop constraint if exists intmed_content_ingest_byte_size_check;

do $$ begin
 if not exists(select 1 from pg_constraint where conname='intmed_content_ingest_payload_check' and conrelid='public.intmed_content_ingest'::regclass) then
  alter table public.intmed_content_ingest add constraint intmed_content_ingest_payload_check check(
   (kind='text' and mime_type='text/plain' and telegram_file_id is null and storage_path is null and content_text is not null and char_length(content_text) between 1 and 12000 and byte_size between 1 and 65536)
   or
   (kind in ('pdf','image') and mime_type in ('application/pdf','image/jpeg','image/png','image/webp') and telegram_file_id is not null and storage_path is not null and content_text is null and byte_size between 1 and 20971520)
  );
 end if;
 if not exists(select 1 from pg_constraint where conname='intmed_content_ingest_source_check' and conrelid='public.intmed_content_ingest'::regclass) then
  alter table public.intmed_content_ingest add constraint intmed_content_ingest_source_check check(
   (not is_forwarded and source_type is null and source_name is null and source_username is null and source_message_id is null and source_date is null)
   or
   (is_forwarded and source_type in ('user','hidden_user','chat','channel') and char_length(coalesce(source_name,''))<=300 and (source_username is null or source_username ~ '^[A-Za-z0-9_]{1,64}$'))
  );
 end if;
end $$;

create index if not exists intmed_content_ingest_status_created_idx
on public.intmed_content_ingest(status,created_at desc);
create index if not exists intmed_content_ingest_sha_idx
on public.intmed_content_ingest(sha256) where sha256 is not null;

alter table public.intmed_content_ingest enable row level security;
revoke all on public.intmed_content_ingest from public,anon,authenticated;
grant all on public.intmed_content_ingest to service_role;

commit;
