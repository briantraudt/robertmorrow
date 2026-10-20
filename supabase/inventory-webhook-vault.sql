-- Keep the dedicated Stripe signing secret entirely between Stripe, the
-- application server, and Supabase Vault. No operator response contains it.
-- Requires the project's existing supabase_vault extension.
begin;

create table if not exists public.inventory_webhook_config (
  provider_key text primary key default 'stripe_inventory' check (provider_key = 'stripe_inventory'),
  webhook_id text not null unique,
  secret_id uuid not null references vault.secrets(id) on delete restrict,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.inventory_webhook_config enable row level security;
revoke all on public.inventory_webhook_config from public, anon, authenticated, service_role;
grant select on public.inventory_webhook_config to service_role;

-- Definer rights are restricted to this one named configuration and its one
-- Vault record. Callers receive no general Vault access or arbitrary lookup.
create or replace function public.rm_store_inventory_webhook(p_endpoint_id text, p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_config public.inventory_webhook_config%rowtype;
  v_secret_id uuid;
  v_secret text;
begin
  if p_endpoint_id is null or p_endpoint_id !~ '^we_[A-Za-z0-9]{1,100}$'
     or p_secret is null or p_secret !~ '^whsec_[A-Za-z0-9]{1,200}$' then
    raise exception 'Invalid webhook configuration.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('rm-stripe-inventory-webhook',0));
  select * into v_config from public.inventory_webhook_config where provider_key='stripe_inventory' for update;
  if found then
    if v_config.webhook_id <> p_endpoint_id then raise exception 'A different inventory webhook is already configured.'; end if;
    select decrypted_secret into v_secret from vault.decrypted_secrets where id=v_config.secret_id;
    if v_secret is null or v_secret <> p_secret then raise exception 'Stored webhook credential does not match.'; end if;
    return jsonb_build_object('id',v_config.webhook_id,'stored',true);
  end if;
  select vault.create_secret(p_secret,'rm_stripe_inventory_' || p_endpoint_id,'Robert Morrow inventory webhook signing credential') into v_secret_id;
  insert into public.inventory_webhook_config(provider_key,webhook_id,secret_id)
    values('stripe_inventory',p_endpoint_id,v_secret_id);
  return jsonb_build_object('id',p_endpoint_id,'stored',true);
end;
$$;

create or replace function public.rm_get_inventory_webhook()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_config public.inventory_webhook_config%rowtype; v_secret text;
begin
  select * into v_config from public.inventory_webhook_config where provider_key='stripe_inventory';
  if not found then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where id=v_config.secret_id;
  if v_secret is null then raise exception 'Stored webhook credential is unavailable.'; end if;
  return jsonb_build_object('id',v_config.webhook_id,'secret',v_secret,'verified_at',v_config.verified_at);
end;
$$;

create or replace function public.rm_verify_inventory_webhook(p_endpoint_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_config public.inventory_webhook_config%rowtype;
begin
  update public.inventory_webhook_config set verified_at=now()
    where provider_key='stripe_inventory' and webhook_id=p_endpoint_id returning * into v_config;
  if not found then raise exception 'Inventory webhook does not match.'; end if;
  return jsonb_build_object('id',v_config.webhook_id,'verified_at',v_config.verified_at);
end;
$$;

revoke all on function public.rm_store_inventory_webhook(text,text) from public,anon,authenticated;
revoke all on function public.rm_get_inventory_webhook() from public,anon,authenticated;
revoke all on function public.rm_verify_inventory_webhook(text) from public,anon,authenticated;
grant execute on function public.rm_store_inventory_webhook(text,text) to service_role;
grant execute on function public.rm_get_inventory_webhook() to service_role;
grant execute on function public.rm_verify_inventory_webhook(text) to service_role;
commit;
