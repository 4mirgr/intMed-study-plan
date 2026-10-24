-- Additive, lossless message normalization. The legacy public.tickets table stays writable
-- during rollout; its trigger mirrors changes into these tables so old clients keep working.
begin;

create table if not exists public.intmed_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null default 'پشتیبانی',
  status text not null default 'open' check (status in ('open','closed')),
  legacy_ticket_id text unique,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intmed_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.intmed_conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_role text not null check (sender_role in ('user','admin','system')),
  body text not null check (char_length(btrim(body)) between 1 and 12000),
  client_id uuid,
  legacy_part text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(conversation_id,client_id),
  unique(conversation_id,legacy_part)
);

create table if not exists public.intmed_conversation_reads (
  conversation_id uuid not null references public.intmed_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  last_read_message_id uuid references public.intmed_messages(id) on delete set null,
  primary key(conversation_id,user_id)
);

create index if not exists intmed_conversations_user_recent_idx
  on public.intmed_conversations(user_id,last_message_at desc);
create index if not exists intmed_conversations_status_recent_idx
  on public.intmed_conversations(status,last_message_at desc);
create index if not exists intmed_messages_conversation_created_idx
  on public.intmed_messages(conversation_id,created_at,id);
create index if not exists intmed_messages_sender_created_idx
  on public.intmed_messages(sender_id,created_at desc) where sender_id is not null;

alter table public.intmed_conversations enable row level security;
alter table public.intmed_messages enable row level security;
alter table public.intmed_conversation_reads enable row level security;
revoke all on public.intmed_conversations,public.intmed_messages,public.intmed_conversation_reads from public,anon;
grant select on public.intmed_conversations,public.intmed_messages,public.intmed_conversation_reads to authenticated;
grant all on public.intmed_conversations,public.intmed_messages,public.intmed_conversation_reads to service_role;

create or replace function public.can_access_intmed_conversation(target uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select public.is_intmed_admin() or exists(
    select 1 from public.intmed_conversations c
    where c.id=target and c.user_id=auth.uid() and public.is_intmed_approved()
  );
$$;
revoke all on function public.can_access_intmed_conversation(uuid) from public,anon;
grant execute on function public.can_access_intmed_conversation(uuid) to authenticated;

create or replace function public.send_intmed_message(
  target_conversation uuid,
  target_user uuid,
  message_body text,
  request_id uuid
)
returns uuid language plpgsql security definer set search_path=public
as $$
declare
  actor uuid:=auth.uid();
  actor_admin boolean:=public.is_intmed_admin();
  owner_id uuid;
  conv_id uuid:=target_conversation;
  saved_id uuid;
begin
  if actor is null or not public.is_intmed_approved() then raise exception 'approved account required' using errcode='42501'; end if;
  if request_id is null then raise exception 'request id required'; end if;
  message_body:=btrim(message_body);
  if message_body is null or char_length(message_body) not between 1 and 12000 then raise exception 'invalid message'; end if;
  if (select count(*) from public.intmed_messages where sender_id=actor and created_at>now()-interval '1 minute')>=20 then
    raise exception 'message rate limit' using errcode='P0001';
  end if;
  if conv_id is null then
    owner_id:=case when actor_admin then target_user else actor end;
    if owner_id is null or not exists(select 1 from public.profiles where id=owner_id and approved and not rejected) then
      raise exception 'active recipient required';
    end if;
    insert into public.intmed_conversations(user_id) values(owner_id) returning id into conv_id;
  else
    select user_id into owner_id from public.intmed_conversations where id=conv_id;
    if owner_id is null or not (actor_admin or owner_id=actor) then raise exception 'conversation access denied' using errcode='42501'; end if;
  end if;
  insert into public.intmed_messages(conversation_id,sender_id,sender_role,body,client_id)
  values(conv_id,actor,case when actor_admin then 'admin' else 'user' end,message_body,request_id)
  on conflict(conversation_id,client_id) do nothing returning id into saved_id;
  if saved_id is null then
    select id into saved_id from public.intmed_messages where conversation_id=conv_id and client_id=request_id and sender_id=actor;
    if saved_id is null then raise exception 'request id conflict' using errcode='23505'; end if;
  else
    update public.intmed_conversations set last_message_at=now(),updated_at=now() where id=conv_id;
  end if;
  return conv_id;
end;
$$;
revoke all on function public.send_intmed_message(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.send_intmed_message(uuid,uuid,text,uuid) to authenticated;

create or replace function public.mark_intmed_conversation_read(target_conversation uuid,target_message uuid default null)
returns void language plpgsql security definer set search_path=public
as $$ begin
  if not public.can_access_intmed_conversation(target_conversation) then raise exception 'conversation access denied' using errcode='42501'; end if;
  if target_message is not null and not exists(select 1 from public.intmed_messages where id=target_message and conversation_id=target_conversation) then
    raise exception 'message is not in conversation';
  end if;
  insert into public.intmed_conversation_reads(conversation_id,user_id,last_read_at,last_read_message_id)
  values(target_conversation,auth.uid(),now(),target_message)
  on conflict(conversation_id,user_id) do update set last_read_at=excluded.last_read_at,last_read_message_id=excluded.last_read_message_id;
end $$;
revoke all on function public.mark_intmed_conversation_read(uuid,uuid) from public,anon;
grant execute on function public.mark_intmed_conversation_read(uuid,uuid) to authenticated;

drop policy if exists "conversation participant read" on public.intmed_conversations;
drop policy if exists "conversation participant create" on public.intmed_conversations;
create policy "conversation participant read" on public.intmed_conversations for select to authenticated
  using ((user_id=auth.uid() and public.is_intmed_approved()) or public.is_intmed_admin());
create policy "conversation participant create" on public.intmed_conversations for insert to authenticated
  with check (
    legacy_ticket_id is null and (
      (user_id=auth.uid() and public.is_intmed_approved())
      or (public.is_intmed_admin() and exists(select 1 from public.profiles p where p.id=user_id and p.approved and not p.rejected))
    )
  );

drop policy if exists "message participant read" on public.intmed_messages;
drop policy if exists "message participant create" on public.intmed_messages;
create policy "message participant read" on public.intmed_messages for select to authenticated
  using (public.can_access_intmed_conversation(conversation_id));
create policy "message participant create" on public.intmed_messages for insert to authenticated
  with check (
    public.can_access_intmed_conversation(conversation_id)
    and sender_id=auth.uid()
    and sender_role=case when public.is_intmed_admin() then 'admin' else 'user' end
    and legacy_part is null
  );

drop policy if exists "read cursor participant read" on public.intmed_conversation_reads;
drop policy if exists "read cursor self create" on public.intmed_conversation_reads;
drop policy if exists "read cursor self update" on public.intmed_conversation_reads;
create policy "read cursor participant read" on public.intmed_conversation_reads for select to authenticated
  using (user_id=auth.uid() and public.can_access_intmed_conversation(conversation_id));
create policy "read cursor self create" on public.intmed_conversation_reads for insert to authenticated
  with check (user_id=auth.uid() and public.can_access_intmed_conversation(conversation_id));
create policy "read cursor self update" on public.intmed_conversation_reads for update to authenticated
  using (user_id=auth.uid() and public.can_access_intmed_conversation(conversation_id))
  with check (user_id=auth.uid() and public.can_access_intmed_conversation(conversation_id));

-- Safe timestamp conversion for older JSON payloads. Invalid client timestamps use the row time.
create or replace function public.intmed_ticket_time(value text,fallback timestamptz)
returns timestamptz language plpgsql immutable set search_path=public
as $$ begin
  if value is null or value='' then return fallback; end if;
  begin return value::timestamptz; exception when others then return fallback; end;
end $$;

-- Legacy clients still write tickets during the migration window. RLS proves ownership but did
-- not historically stop an owner from forging admin-shaped JSON. Permit users to create only
-- user messages and, on existing rows, change only their read cursors.
create or replace function public.guard_intmed_legacy_ticket_write()
returns trigger language plpgsql security definer set search_path=public
as $$
declare actor uuid:=auth.uid();
begin
  -- SQL migrations and service-role maintenance do not carry an end-user uid.
  if actor is null or public.is_intmed_admin() then return new; end if;
  if new.user_id<>actor then raise exception 'ticket ownership required' using errcode='42501'; end if;
  if tg_op='INSERT' then
    if lower(coalesce(new.payload->>'fromAdmin',new.payload->>'sentByAdmin','')) in ('true','1','yes')
       or nullif(btrim(new.payload->>'reply'),'') is not null then
      raise exception 'admin message fields are server controlled' using errcode='42501';
    end if;
  elsif new.user_id<>old.user_id
     or (new.payload-'userReadAt'-'replyReadAt')<>(old.payload-'userReadAt'-'replyReadAt') then
    raise exception 'only read cursors may be changed' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_intmed_legacy_ticket_write() from public,anon,authenticated;

drop trigger if exists guard_intmed_legacy_ticket_write on public.tickets;
create trigger guard_intmed_legacy_ticket_write before insert or update on public.tickets
for each row execute function public.guard_intmed_legacy_ticket_write();

create or replace function public.sync_intmed_ticket_messages()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
  conversation uuid;
  admin_id uuid;
  original_body text:=nullif(btrim(new.payload->>'message'),'');
  reply_body text:=nullif(btrim(new.payload->>'reply'),'');
  original_role text:=case when lower(coalesce(new.payload->>'fromAdmin',new.payload->>'sentByAdmin','')) in ('true','1','yes') then 'admin' else 'user' end;
begin
  insert into public.intmed_conversations(user_id,subject,legacy_ticket_id,last_message_at,created_at,updated_at)
  values(
    new.user_id,
    coalesce(nullif(left(btrim(new.payload->>'subject'),160),''),'پشتیبانی'),
    new.id,
    greatest(
      public.intmed_ticket_time(new.payload->>'createdAt',new.updated_at),
      public.intmed_ticket_time(new.payload->>'replyAt',new.updated_at)
    ),
    public.intmed_ticket_time(new.payload->>'createdAt',new.updated_at),
    new.updated_at
  )
  on conflict(legacy_ticket_id) do update set
    user_id=excluded.user_id,subject=excluded.subject,
    last_message_at=greatest(public.intmed_conversations.last_message_at,excluded.last_message_at),
    updated_at=excluded.updated_at
  returning id into conversation;

  if original_body is not null then
    insert into public.intmed_messages(conversation_id,sender_id,sender_role,body,legacy_part,metadata,created_at)
    values(
      conversation,
      case when original_role='user' then new.user_id else null end,
      original_role,
      original_body,
      'message',
      jsonb_build_object('legacyTicketId',new.id),
      public.intmed_ticket_time(new.payload->>'createdAt',new.updated_at)
    ) on conflict(conversation_id,legacy_part) do update set body=excluded.body,metadata=excluded.metadata;
  end if;

  if reply_body is not null then
    insert into public.intmed_messages(conversation_id,sender_id,sender_role,body,legacy_part,metadata,created_at)
    values(
      conversation,null,'admin',reply_body,'reply',
      jsonb_build_object('legacyTicketId',new.id),
      public.intmed_ticket_time(new.payload->>'replyAt',new.updated_at)
    ) on conflict(conversation_id,legacy_part) do update set body=excluded.body,metadata=excluded.metadata;
  end if;

  -- Translate existing booleans/timestamps to cursors without inventing a message id.
  if original_role='user' and lower(coalesce(new.payload->>'read','')) in ('true','1','yes') then
    select id into admin_id from public.profiles where role='admin' and approved and not rejected order by created_at,id limit 1;
    if admin_id is not null then
      insert into public.intmed_conversation_reads(conversation_id,user_id,last_read_at)
      values(conversation,admin_id,new.updated_at)
      on conflict(conversation_id,user_id) do update set last_read_at=greatest(public.intmed_conversation_reads.last_read_at,excluded.last_read_at);
    end if;
  end if;
  if original_role='admin' and new.payload ? 'userReadAt' then
    insert into public.intmed_conversation_reads(conversation_id,user_id,last_read_at)
    values(conversation,new.user_id,public.intmed_ticket_time(new.payload->>'userReadAt',new.updated_at))
    on conflict(conversation_id,user_id) do update set last_read_at=greatest(public.intmed_conversation_reads.last_read_at,excluded.last_read_at);
  end if;
  if original_role='user' and reply_body is not null and new.payload ? 'replyReadAt' then
    insert into public.intmed_conversation_reads(conversation_id,user_id,last_read_at)
    values(conversation,new.user_id,public.intmed_ticket_time(new.payload->>'replyReadAt',new.updated_at))
    on conflict(conversation_id,user_id) do update set last_read_at=greatest(public.intmed_conversation_reads.last_read_at,excluded.last_read_at);
  end if;
  return new;
end;
$$;
revoke all on function public.intmed_ticket_time(text,timestamptz) from public,anon,authenticated;
revoke all on function public.sync_intmed_ticket_messages() from public,anon,authenticated;

drop trigger if exists mirror_intmed_ticket_messages on public.tickets;
create trigger mirror_intmed_ticket_messages after insert or update on public.tickets
for each row execute function public.sync_intmed_ticket_messages();

-- Idempotent backfill. Updating a column to itself replays every legacy row through the same
-- trigger used by old clients, while the unique legacy keys prevent duplicate messages.
update public.tickets set updated_at=updated_at;

-- Realtime is optional in local/test Postgres and idempotent in Supabase.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='intmed_messages') then
      alter publication supabase_realtime add table public.intmed_messages;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='intmed_conversation_reads') then
      alter publication supabase_realtime add table public.intmed_conversation_reads;
    end if;
  end if;
exception when undefined_table or insufficient_privilege then null;
end $$;

commit;
