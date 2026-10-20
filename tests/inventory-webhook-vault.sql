-- Run only before configuring a real webhook. All synthetic records roll back.
begin;
do $$ begin
  if exists(select 1 from public.inventory_webhook_config) then raise exception 'Run in a disposable empty configuration.'; end if;
  if has_function_privilege('anon','public.rm_get_inventory_webhook()','execute')
    or has_function_privilege('authenticated','public.rm_get_inventory_webhook()','execute')
    or has_table_privilege('anon','public.inventory_webhook_config','select') then
    raise exception 'Anonymous credential access is not denied.';
  end if;
end $$;
set local role service_role;
do $$
declare a jsonb; b jsonb;
begin
  if public.rm_get_inventory_webhook() is not null then raise exception 'Expected empty configuration.'; end if;
  a := public.rm_store_inventory_webhook('we_SyntheticRollbackOnly','whsec_SyntheticRollbackOnly123');
  if a <> jsonb_build_object('id','we_SyntheticRollbackOnly','stored',true) or a ? 'secret' then raise exception 'Unexpected store response.'; end if;
  b := public.rm_store_inventory_webhook('we_SyntheticRollbackOnly','whsec_SyntheticRollbackOnly123');
  if b <> a then raise exception 'Retry was not idempotent.'; end if;
  b := public.rm_get_inventory_webhook();
  if b ->> 'secret' <> 'whsec_SyntheticRollbackOnly123' or b ->> 'verified_at' is not null then raise exception 'Vault round trip failed.'; end if;
  perform public.rm_verify_inventory_webhook('we_SyntheticRollbackOnly');
  if public.rm_get_inventory_webhook() ->> 'verified_at' is null then raise exception 'Verification was not recorded.'; end if;
  begin
    perform public.rm_store_inventory_webhook('we_DifferentSynthetic','whsec_SyntheticRollbackOnly123');
    raise exception 'Unexpected replacement permitted.' using errcode='XX000';
  exception when raise_exception then null; end;
  begin
    perform public.rm_store_inventory_webhook('we_SyntheticRollbackOnly','whsec_DifferentSynthetic123');
    raise exception 'Unexpected secret replacement permitted.' using errcode='XX000';
  exception when raise_exception then null; end;
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.inventory_webhook_config c join vault.secrets s on s.id=c.secret_id where s.secret='whsec_SyntheticRollbackOnly123') then
    raise exception 'Vault did not encrypt the synthetic credential.';
  end if;
end $$;
rollback;
select jsonb_build_object('vault_checks_passed',true,'synthetic_configuration_removed',not exists(select 1 from public.inventory_webhook_config),'synthetic_secret_removed',not exists(select 1 from vault.secrets where name='rm_stripe_inventory_we_SyntheticRollbackOnly')) as verification;
