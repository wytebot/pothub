-- Run in Supabase SQL editor. Service-role credentials belong on the server only.
create table if not exists public.profiles(github_id text primary key,github_login text not null,display_name text,email text,avatar_url text,device_hash text,credits bigint not null default 25 check(credits>=0),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table public.profiles add column if not exists device_hash text;
alter table public.profiles add column if not exists starter_credits_remaining bigint not null default 0 check(starter_credits_remaining>=0);
create unique index if not exists profiles_device_hash_unique on public.profiles(device_hash) where device_hash is not null;
create table if not exists public.credit_orders(reference text primary key,github_id text not null references public.profiles(github_id) on delete cascade,pack_id text not null,credits bigint not null check(credits>0),amount numeric(12,2) not null check(amount>0),currency text not null check(currency='USD'),status text not null default 'pending' check(status in('pending','paid','failed','refunded')),provider_charge_id text,provider_status text,provider_payload jsonb,created_at timestamptz not null default now(),paid_at timestamptz);
create unique index if not exists credit_orders_charge_unique on public.credit_orders(provider_charge_id) where provider_charge_id is not null;
create table if not exists public.credit_ledger(id bigint generated always as identity primary key,github_id text not null references public.profiles(github_id) on delete cascade,delta bigint not null,balance_after bigint not null,reason text not null,reference text,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create unique index if not exists credit_ledger_ref_unique on public.credit_ledger(reference) where reference is not null and delta>0;
create table if not exists public.repair_tasks(id bigint generated always as identity primary key,github_id text not null references public.profiles(github_id) on delete cascade,repo_full_name text not null,kind text not null,status text not null default 'queued',summary text,report jsonb not null default '{}'::jsonb,credits_spent integer not null default 0,created_at timestamptz not null default now());
alter table public.profiles enable row level security;alter table public.credit_orders enable row level security;alter table public.credit_ledger enable row level security;alter table public.repair_tasks enable row level security;
-- No browser policies: use the service-role client only from the API.
create or replace function public.spend_credits(p_github_id text,p_amount bigint,p_reason text,p_metadata jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public as $$ declare b bigint; begin if p_amount<=0 then return jsonb_build_object('ok',false,'message','Invalid credit amount.');end if;select credits into b from profiles where github_id=p_github_id for update;if b is null then return jsonb_build_object('ok',false,'message','Profile is not initialized.');end if;if b<p_amount then return jsonb_build_object('ok',false,'message','Not enough credits.');end if;update profiles set credits=credits-p_amount,starter_credits_remaining=greatest(0,starter_credits_remaining-least(starter_credits_remaining,p_amount)),updated_at=now() where github_id=p_github_id returning credits into b;insert into credit_ledger(github_id,delta,balance_after,reason,metadata) values(p_github_id,-p_amount,b,p_reason,coalesce(p_metadata,'{}'::jsonb));return jsonb_build_object('ok',true,'credits',b);end;$$;
create or replace function public.grant_credits(p_github_id text,p_amount bigint,p_reference text,p_reason text default 'Credit purchase') returns jsonb language plpgsql security definer set search_path=public as $$ declare b bigint; begin if p_amount<=0 or p_reference is null or length(p_reference)<5 then raise exception 'Invalid credit grant';end if;if exists(select 1 from credit_ledger where reference=p_reference and delta>0) then select credits into b from profiles where github_id=p_github_id;return jsonb_build_object('ok',true,'duplicate',true,'credits',b);end if;update profiles set credits=credits+p_amount,updated_at=now() where github_id=p_github_id returning credits into b;if b is null then raise exception 'Profile not found';end if;insert into credit_ledger(github_id,delta,balance_after,reason,reference) values(p_github_id,p_amount,b,p_reason,p_reference);return jsonb_build_object('ok',true,'duplicate',false,'credits',b);end;$$;


-- Optional notification and webhook monitoring. RLS remains enabled; service-role API only.
create table if not exists public.monitored_projects(
  github_id text not null references public.profiles(github_id) on delete cascade,
  project_id text not null,
  repo_full_name text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(github_id,project_id)
);
create table if not exists public.app_notifications(
  id text primary key,
  github_id text not null references public.profiles(github_id) on delete cascade,
  event_key text not null unique,
  title text not null,
  body text not null,
  repo_full_name text,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists app_notifications_user_recent on public.app_notifications(github_id,created_at desc);
create table if not exists public.notification_subscriptions(
  endpoint text primary key,
  github_id text not null references public.profiles(github_id) on delete cascade,
  kind text not null check(kind in('web','android')),
  subscription jsonb,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.monitored_projects enable row level security;
alter table public.app_notifications enable row level security;
alter table public.notification_subscriptions enable row level security;

-- Atomic first-login initialization. The first account on a device gets the starter grant;
-- later accounts with the same device hash start at zero. Existing balances are never reset.
create or replace function public.initialize_profile(
  p_github_id text,
  p_github_login text,
  p_display_name text,
  p_email text,
  p_avatar_url text,
  p_device_hash text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  owner_id text;
  duplicate_device boolean := false;
  b bigint;
begin
  if p_device_hash is not null and length(p_device_hash)>0 then
    perform pg_advisory_xact_lock(hashtext(p_device_hash));
    select github_id into owner_id from profiles where device_hash=p_device_hash limit 1;
    duplicate_device := owner_id is not null and owner_id <> p_github_id;
  end if;
  insert into profiles(github_id,github_login,display_name,email,avatar_url,device_hash,credits,starter_credits_remaining,updated_at)
  values(p_github_id,p_github_login,p_display_name,p_email,p_avatar_url,
         case when duplicate_device then null else nullif(p_device_hash,'') end,
         case when duplicate_device then 0 else 25 end,case when duplicate_device then 0 else 25 end,now())
  on conflict(github_id) do update set
    github_login=excluded.github_login,
    display_name=excluded.display_name,
    email=excluded.email,
    avatar_url=excluded.avatar_url,
    device_hash=case when profiles.device_hash is null and not duplicate_device then excluded.device_hash else profiles.device_hash end,
    credits=case when duplicate_device then greatest(0,profiles.credits-profiles.starter_credits_remaining) else profiles.credits end,
    starter_credits_remaining=case when duplicate_device then 0 else profiles.starter_credits_remaining end,
    updated_at=now()
  returning credits into b;
  return jsonb_build_object('ok',true,'credits',b,'duplicate_device',duplicate_device);
end; $$;

-- These SECURITY DEFINER RPCs must only be callable by the trusted server role.
revoke all on function public.spend_credits(text,bigint,text,jsonb) from public, anon, authenticated;
revoke all on function public.grant_credits(text,bigint,text,text) from public, anon, authenticated;
revoke all on function public.initialize_profile(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.spend_credits(text,bigint,text,jsonb) to service_role;
grant execute on function public.grant_credits(text,bigint,text,text) to service_role;
grant execute on function public.initialize_profile(text,text,text,text,text,text) to service_role;

-- Per-user Vercel OAuth credentials are encrypted by the API before storage.
create table if not exists public.vercel_connections(
  github_id text primary key references public.profiles(github_id) on delete cascade,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  access_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.vercel_connections enable row level security;

-- One-time Vercel OAuth state nonces; raw nonce is never stored.
create table if not exists public.vercel_oauth_states(
  nonce_hash text primary key,
  github_id text not null references public.profiles(github_id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists vercel_oauth_states_expiry_idx on public.vercel_oauth_states(expires_at);
alter table public.vercel_oauth_states enable row level security;
revoke all on public.vercel_oauth_states from public, anon, authenticated;
