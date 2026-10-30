-- One-time, least-privilege capabilities used by GitHub Actions to publish one reviewed draft.
begin;

create table if not exists public.intmed_content_publish_tokens(
  draft_id uuid primary key references public.intmed_content_drafts(id) on delete cascade,
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.intmed_content_publish_tokens enable row level security;
revoke all on public.intmed_content_publish_tokens from public, anon, authenticated;
grant all on public.intmed_content_publish_tokens to service_role;

-- Publication is cloud-owned now. The localhost runner remains responsible for
-- extraction and draft generation, but can no longer race GitHub Actions for a
-- publish request.
create or replace function public.claim_intmed_content_publish(claimant uuid, local_runner_id text)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.profiles where id=claimant and role='admin' and approved and not rejected) then
    raise exception 'admin required';
  end if;
  return null;
end $$;

revoke all on function public.claim_intmed_content_publish(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_intmed_content_publish(uuid,text) to service_role;

commit;
