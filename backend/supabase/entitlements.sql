-- Paid-access foundation. Installing this file does not lock any existing content.
-- Only the server-side receipt verifier may mutate purchases or entitlements.
begin;

create extension if not exists pgcrypto;

create table if not exists public.intmed_products (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9._-]{2,79}$'),
  title text not null check (char_length(title) between 1 and 160),
  entitlement_key text not null check (entitlement_key ~ '^[a-z0-9][a-z0-9._-]{2,99}$'),
  duration_days integer check (duration_days is null or duration_days between 1 and 3660),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intmed_store_products (
  provider text not null check (provider in ('bazaar','myket')),
  external_product_id text not null check (char_length(external_product_id) between 1 and 200),
  product_id text not null references public.intmed_products(id) on update cascade on delete restrict,
  package_name text not null check (char_length(package_name) between 3 and 220),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (provider,external_product_id,package_name)
);

create table if not exists public.intmed_purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('bazaar','myket')),
  product_id text not null references public.intmed_products(id) on update cascade on delete restrict,
  external_product_id text not null,
  package_name text not null,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key uuid not null,
  provider_order_id text,
  status text not null default 'pending' check (status in ('pending','verified','rejected','error','refunded','revoked')),
  failure_code text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider,token_hash),
  unique (user_id,idempotency_key)
);

create table if not exists public.intmed_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id text not null references public.intmed_products(id) on update cascade on delete restrict,
  provider text not null check (provider in ('bazaar','myket')),
  provider_order_id text not null,
  status text not null check (status in ('active','expired','refunded','revoked')),
  starts_at timestamptz not null,
  expires_at timestamptz,
  source_receipt_id uuid not null references public.intmed_purchase_receipts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider,provider_order_id),
  unique (source_receipt_id)
);

create table if not exists public.intmed_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entitlement_key text not null,
  source_subscription_id uuid not null references public.intmed_subscriptions(id) on delete cascade,
  valid_from timestamptz not null,
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,entitlement_key,source_subscription_id)
);

create table if not exists public.intmed_entitlement_audit (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  actor text not null check (actor in ('receipt-verifier','reconciliation','admin')),
  action text not null check (char_length(action) between 1 and 80),
  receipt_id uuid references public.intmed_purchase_receipts(id) on delete set null,
  subscription_id uuid references public.intmed_subscriptions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists intmed_receipts_user_created_idx on public.intmed_purchase_receipts(user_id,created_at desc);
create index if not exists intmed_subscriptions_user_status_idx on public.intmed_subscriptions(user_id,status,expires_at);
create index if not exists intmed_entitlements_user_valid_idx on public.intmed_entitlements(user_id,entitlement_key,valid_until) where revoked_at is null;
create index if not exists intmed_entitlement_audit_created_idx on public.intmed_entitlement_audit(created_at desc);

alter table public.intmed_products enable row level security;
alter table public.intmed_store_products enable row level security;
alter table public.intmed_purchase_receipts enable row level security;
alter table public.intmed_subscriptions enable row level security;
alter table public.intmed_entitlements enable row level security;
alter table public.intmed_entitlement_audit enable row level security;

drop policy if exists intmed_products_public_read on public.intmed_products;
create policy intmed_products_public_read on public.intmed_products for select using (active);
drop policy if exists intmed_store_products_public_read on public.intmed_store_products;
create policy intmed_store_products_public_read on public.intmed_store_products for select using (active);
drop policy if exists intmed_receipts_own_read on public.intmed_purchase_receipts;
create policy intmed_receipts_own_read on public.intmed_purchase_receipts for select to authenticated using (user_id=auth.uid());
drop policy if exists intmed_subscriptions_own_read on public.intmed_subscriptions;
create policy intmed_subscriptions_own_read on public.intmed_subscriptions for select to authenticated using (user_id=auth.uid());
drop policy if exists intmed_entitlements_own_read on public.intmed_entitlements;
create policy intmed_entitlements_own_read on public.intmed_entitlements for select to authenticated using (user_id=auth.uid());

revoke all on public.intmed_purchase_receipts,public.intmed_subscriptions,public.intmed_entitlements,public.intmed_entitlement_audit from anon,authenticated;
grant select on public.intmed_products,public.intmed_store_products to anon,authenticated;
grant select on public.intmed_purchase_receipts,public.intmed_subscriptions,public.intmed_entitlements to authenticated;
grant all on public.intmed_products,public.intmed_store_products,public.intmed_purchase_receipts,public.intmed_subscriptions,public.intmed_entitlements,public.intmed_entitlement_audit to service_role;
grant usage,select on sequence public.intmed_entitlement_audit_id_seq to service_role;

create or replace function public.apply_intmed_verified_purchase(
  target_receipt uuid, target_user uuid, verified_order_id text,
  verified_start timestamptz, verified_expiry timestamptz default null
) returns uuid language plpgsql security definer set search_path=public
as $$
declare r public.intmed_purchase_receipts%rowtype; p public.intmed_products%rowtype; subscription_id uuid;
begin
  -- SECURITY DEFINER changes current_user to the function owner. Check the signed PostgREST
  -- request claim instead so only the service-role Edge Function can cross this boundary.
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then raise exception 'service role required'; end if;
  select * into r from public.intmed_purchase_receipts where id=target_receipt and user_id=target_user for update;
  if not found then raise exception 'receipt not found'; end if;
  if r.status='verified' then
    select id into subscription_id from public.intmed_subscriptions where source_receipt_id=r.id;
    return subscription_id;
  end if;
  if r.status<>'pending' then raise exception 'receipt is not pending'; end if;
  select * into p from public.intmed_products where id=r.product_id and active for update;
  if not found then raise exception 'product inactive'; end if;
  if verified_expiry is null and p.duration_days is not null then verified_expiry=verified_start+make_interval(days=>p.duration_days); end if;
  if verified_expiry is not null and verified_expiry<=verified_start then raise exception 'invalid expiry'; end if;
  insert into public.intmed_subscriptions(user_id,product_id,provider,provider_order_id,status,starts_at,expires_at,source_receipt_id)
  values(r.user_id,r.product_id,r.provider,verified_order_id,'active',verified_start,verified_expiry,r.id)
  on conflict(provider,provider_order_id) do nothing
  returning id into subscription_id;
  if subscription_id is null then
    select id into subscription_id from public.intmed_subscriptions
    where provider=r.provider and provider_order_id=verified_order_id and user_id=r.user_id
      and product_id=r.product_id and source_receipt_id=r.id for update;
    if not found then raise exception 'order ownership conflict'; end if;
    update public.intmed_subscriptions set
      expires_at=case
        when expires_at is null or verified_expiry is null then null
        else greatest(expires_at,verified_expiry)
      end,
      status='active',updated_at=now()
    where id=subscription_id;
  end if;
  insert into public.intmed_entitlements(user_id,entitlement_key,source_subscription_id,valid_from,valid_until)
  values(r.user_id,p.entitlement_key,subscription_id,verified_start,verified_expiry)
  on conflict(user_id,entitlement_key,source_subscription_id) do update set valid_until=excluded.valid_until,revoked_at=null,updated_at=now();
  update public.intmed_purchase_receipts set status='verified',provider_order_id=verified_order_id,verified_at=now(),failure_code=null,updated_at=now() where id=r.id;
  insert into public.intmed_entitlement_audit(user_id,actor,action,receipt_id,subscription_id,metadata)
  values(r.user_id,'receipt-verifier','purchase_verified',r.id,subscription_id,jsonb_build_object('provider',r.provider,'productId',r.product_id));
  return subscription_id;
end $$;
revoke all on function public.apply_intmed_verified_purchase(uuid,uuid,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_intmed_verified_purchase(uuid,uuid,text,timestamptz,timestamptz) to service_role;

create or replace function public.intmed_has_entitlement(requested_key text)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.intmed_entitlements where user_id=auth.uid() and entitlement_key=requested_key and revoked_at is null and valid_from<=now() and (valid_until is null or valid_until>now())) $$;
revoke all on function public.intmed_has_entitlement(text) from public,anon;
grant execute on function public.intmed_has_entitlement(text) to authenticated;

-- No content policy references these tables yet. Access becomes paid only in a later reviewed migration.
commit;
