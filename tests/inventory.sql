-- Run against an isolated PostgreSQL database after schema.sql + inventory.sql.
-- All fixtures, test helper functions and assertions roll back. Production data
-- is never required, and no Stripe or email request is made.
begin;
set local statement_timeout = '20s';

create function pg_temp.assert_true(p_ok boolean, p_message text) returns void
language plpgsql as $$ begin if p_ok is distinct from true then raise exception 'Assertion failed: %',p_message; end if; end $$;
create function pg_temp.expect_error(p_sql text, p_fragment text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_fragment in sqlerrm) = 0 then raise exception 'Unexpected error (wanted %): %',p_fragment,sqlerrm; end if;
    return;
  end;
  raise exception 'Expected an error containing: %',p_fragment;
end;
$$;

insert into public.paintings(id,slug,title,year,series,medium,w,h,price,status,note) values
('inventory-test-a','inventory-test-a','Test A',2026,'abstract','Acrylic on canvas',20,16,500,'available',null),
('inventory-test-b','inventory-test-b','Test B',2026,'abstract','Acrylic on canvas',20,16,600,'available',null),
('inventory-test-c','inventory-test-c','Test C',2026,'abstract','Acrylic on canvas',20,16,700,'available',null),
('inventory-test-offer','inventory-test-offer','Test offer',2026,'abstract','Acrylic on canvas',20,16,1000,'available',null),
('inventory-test-release-offer','inventory-test-release-offer','Test expire offer',2026,'abstract','Acrylic on canvas',20,16,1000,'available',null),
('inventory-test-sold','inventory-test-sold','Test sold',2026,'abstract','Acrylic on canvas',20,16,400,'sold',null),
('inventory-test-deleted','inventory-test-deleted','Test deleted',2026,'abstract','Acrylic on canvas',20,16,400,'available','__rm_deleted__'),
('inventory-test-zero','inventory-test-zero','Test zero',2026,'abstract','Acrylic on canvas',20,16,0,'available',null),
('inventory-test-legacy','inventory-test-legacy','Test legacy',2026,'abstract','Acrylic on canvas',20,16,800,'reserved',null),
('inventory-test-manual','inventory-test-manual','Test manual hold',2026,'abstract','Acrylic on canvas',20,16,800,'reserved',null);

insert into public.offers(id,painting_id,name,email,amount,status) values
('10000000-0000-4000-8000-000000000001','inventory-test-offer','Test Buyer','buyer@example.test',900,'new'),
('10000000-0000-4000-8000-000000000002','inventory-test-release-offer','Test Buyer','buyer@example.test',900,'countered');

-- Input rejection and all-or-none ownership.
select pg_temp.expect_error($q$select public.reserve_inventory('20000000-0000-4000-8000-000000000001',array['inventory-test-c','inventory-test-c'],'{}')$q$,'unique');
select pg_temp.expect_error($q$select public.reserve_inventory('20000000-0000-4000-8000-000000000001',array['inventory-test-c',null],'{}')$q$,'nonempty');
select pg_temp.expect_error($q$select public.reserve_inventory('20000000-0000-4000-8000-000000000001',array['inventory-test-c','inventory-test-sold'],'{}')$q$,'no longer available');
select pg_temp.expect_error($q$select public.reserve_inventory('20000000-0000-4000-8000-000000000001',array['inventory-test-deleted'],'{}')$q$,'no longer available');
select pg_temp.expect_error($q$select public.reserve_inventory('20000000-0000-4000-8000-000000000001',array['inventory-test-zero'],'{}')$q$,'no longer available');
select pg_temp.expect_error($q$select public.reserve_inventory('20000000-0000-4000-8000-000000000001',array['inventory-test-missing'],'{}')$q$,'not found');
select pg_temp.assert_true((select status='available' from public.paintings where id='inventory-test-c'),'failed carts did not reserve their available item');
select pg_temp.assert_true((select count(*)=0 from public.inventory_reservations where id='20000000-0000-4000-8000-000000000001'),'failed carts created no reservation');

select pg_temp.assert_true(
  (public.reserve_inventory('20000000-0000-4000-8000-000000000001',array['inventory-test-b','inventory-test-a'],'{"email":"buyer@example.test"}') ->> 'amount_total')::integer=110000,
  'price snapshot is computed in cents from locked rows');
select pg_temp.assert_true((select painting_ids=array['inventory-test-a','inventory-test-b'] and status='pending' and items->0->>'id'='inventory-test-a' from public.inventory_reservations where id='20000000-0000-4000-8000-000000000001'),'ordered ID set and immutable item snapshots');
select pg_temp.assert_true((select count(*)=2 from public.inventory_holds where reservation_id='20000000-0000-4000-8000-000000000001'),'both items have unique ownership');
select pg_temp.assert_true((public.reserve_inventory('20000000-0000-4000-8000-000000000001',array['inventory-test-a','inventory-test-b'],'{"email":"buyer@example.test"}')->>'status')='pending','same logical request resumes reservation');
select pg_temp.expect_error($q$select public.reserve_inventory('20000000-0000-4000-8000-000000000001',array['inventory-test-a','inventory-test-b'],'{"email":"other@example.test"}')$q$,'does not match');
select pg_temp.expect_error($q$select public.reserve_inventory('20000000-0000-4000-8000-000000000002',array['inventory-test-c','inventory-test-a'],'{}')$q$,'no longer available');
select pg_temp.assert_true((select status='available' from public.paintings where id='inventory-test-c'),'overlapping losing cart left other inventory untouched');
update public.inventory_reservations set expires_at=now()-interval '1 second' where id='20000000-0000-4000-8000-000000000001';
select pg_temp.expect_error($q$select public.reserve_inventory('20000000-0000-4000-8000-000000000002',array['inventory-test-a'],'{}')$q$,'no longer available');
select pg_temp.expect_error($q$update public.paintings set status='available' where id='inventory-test-a'$q$,'held by an active checkout');
select pg_temp.expect_error($q$update public.paintings set price=1 where id='inventory-test-a'$q$,'held by an active checkout');
select pg_temp.expect_error($q$delete from public.paintings where id='inventory-test-a'$q$,'held by an active checkout');

-- Bound payments cannot be substituted or finalize the wrong amount/cart.
select pg_temp.assert_true((public.bind_inventory_payment('20000000-0000-4000-8000-000000000001','pi_inventory_one')->>'status')='active','payment binding activates checkout');
select pg_temp.assert_true((public.bind_inventory_payment('20000000-0000-4000-8000-000000000001','pi_inventory_one')->>'stripe_payment_intent')='pi_inventory_one','binding replay is idempotent');
select pg_temp.expect_error($q$select public.bind_inventory_payment('20000000-0000-4000-8000-000000000001','pi_inventory_two')$q$,'different payment');
select pg_temp.expect_error($q$select public.finalize_inventory_sale('pi_inventory_one',array['inventory-test-a','inventory-test-b'],1,'usd',null,null,null,'20000000-0000-4000-8000-000000000001')$q$,'does not match');
select pg_temp.expect_error($q$select public.finalize_inventory_sale('pi_inventory_wrong',array['inventory-test-a','inventory-test-b'],110000,'usd',null,null,null,'20000000-0000-4000-8000-000000000001')$q$,'does not own');
select pg_temp.expect_error($q$select public.finalize_inventory_sale('pi_inventory_legacy_intruder',array['inventory-test-a'],50000,'usd',null,null,null)$q$,'held by a different checkout');
select pg_temp.assert_true((select count(*)=0 from public.orders where stripe_payment_intent like 'pi_inventory%'),'failed finalizations created no order');

select pg_temp.assert_true(public.finalize_inventory_sale('pi_inventory_one',array['inventory-test-b','inventory-test-a'],110000,'usd','buyer@example.test','Test Buyer','{}','20000000-0000-4000-8000-000000000001')->>'status'='paid','paid order finalized');
select pg_temp.assert_true((select count(*)=2 from public.inventory_sales where stripe_payment_intent='pi_inventory_one'),'one owner per paid painting');
select pg_temp.assert_true((select count(*)=2 from public.paintings where id in ('inventory-test-a','inventory-test-b') and status='sold'),'both paid paintings sold atomically');
select pg_temp.assert_true((select count(*)=0 from public.inventory_holds where reservation_id='20000000-0000-4000-8000-000000000001'),'paid ownership removed from active holds');
select pg_temp.assert_true((public.finalize_inventory_sale('pi_inventory_one',array['inventory-test-a','inventory-test-b'],110000,'usd',null,null,null,'20000000-0000-4000-8000-000000000001')->>'already_recorded')::boolean,'callback replay is idempotent');
select pg_temp.assert_true((select count(*)=1 from public.orders where stripe_payment_intent='pi_inventory_one'),'callback replay creates one order');
select pg_temp.assert_true(public.release_inventory('20000000-0000-4000-8000-000000000001')->>'status'='paid','release cannot reopen paid stock');
select pg_temp.expect_error($q$update public.paintings set status='available' where id='inventory-test-a'$q$,'cannot be made available');
select pg_temp.expect_error($q$select public.finalize_inventory_sale('pi_inventory_other_buyer',array['inventory-test-a'],50000,'usd',null,null,null)$q$,'already been sold');
select pg_temp.expect_error($q$select public.finalize_inventory_sale('pi_inventory_manual_sold',array['inventory-test-sold'],40000,'usd',null,null,null)$q$,'no longer available');

-- Release is explicit; the server calls it only after Stripe cancellation.
select public.reserve_inventory('20000000-0000-4000-8000-000000000002',array['inventory-test-c'],'{}');
select public.bind_inventory_payment('20000000-0000-4000-8000-000000000002','pi_inventory_canceled');
select pg_temp.assert_true(public.release_inventory('20000000-0000-4000-8000-000000000002')->>'status'='released','explicit canceled checkout released');
select pg_temp.assert_true((select status='available' from public.paintings where id='inventory-test-c'),'released painting available');
select pg_temp.assert_true(public.release_inventory('20000000-0000-4000-8000-000000000002')->>'status'='released','release replay is idempotent');
select pg_temp.expect_error($q$select public.bind_inventory_payment('20000000-0000-4000-8000-000000000002','pi_inventory_canceled')$q$,'no longer active');
select pg_temp.expect_error($q$select public.finalize_inventory_sale('pi_inventory_canceled',array['inventory-test-c'],70000,'usd',null,null,null,'20000000-0000-4000-8000-000000000002')$q$,'not ready');

-- Force a failure after the order insert and before sold status to prove that
-- the entire finalization (order, sale identity, hold removal) rolls back.
select public.reserve_inventory('20000000-0000-4000-8000-000000000003',array['inventory-test-c'],'{}');
select public.bind_inventory_payment('20000000-0000-4000-8000-000000000003','pi_inventory_fault');
create function pg_temp.reject_test_sale() returns trigger language plpgsql as $$
begin if new.id='inventory-test-c' and new.status='sold' then raise exception 'Synthetic inventory write failure'; end if; return new; end $$;
create trigger inventory_test_failure before update on public.paintings for each row execute function pg_temp.reject_test_sale();
select pg_temp.expect_error($q$select public.finalize_inventory_sale('pi_inventory_fault',array['inventory-test-c'],70000,'usd',null,null,null,'20000000-0000-4000-8000-000000000003')$q$,'Synthetic inventory write failure');
select pg_temp.assert_true((select count(*)=0 from public.orders where stripe_payment_intent='pi_inventory_fault'),'order rolled back with failed inventory write');
select pg_temp.assert_true((select count(*)=0 from public.inventory_sales where stripe_payment_intent='pi_inventory_fault'),'sale identity rolled back');
select pg_temp.assert_true((select count(*)=1 from public.inventory_holds where reservation_id='20000000-0000-4000-8000-000000000003'),'ownership preserved after failed finalization');
select pg_temp.assert_true((select status='active' from public.inventory_reservations where id='20000000-0000-4000-8000-000000000003'),'failed finalization remains retryable');
drop trigger inventory_test_failure on public.paintings;
select public.finalize_inventory_sale('pi_inventory_fault',array['inventory-test-c'],70000,'usd',null,null,null,'20000000-0000-4000-8000-000000000003');

-- Accepted offers share the same exclusive stock pool and one Session.
select pg_temp.expect_error($q$select public.reserve_inventory('20000000-0000-4000-8000-000000000004',array['inventory-test-offer'],'{"email":"wrong@example.test"}','10000000-0000-4000-8000-000000000001')$q$,'does not match');
select pg_temp.assert_true((public.reserve_inventory('20000000-0000-4000-8000-000000000004',array['inventory-test-offer'],'{"email":"buyer@example.test"}','10000000-0000-4000-8000-000000000001')->>'amount_total')::integer=90000,'offer uses agreed price');
select pg_temp.assert_true((select status='accepted' from public.offers where id='10000000-0000-4000-8000-000000000001'),'acceptance and reservation atomic');
select pg_temp.expect_error($q$select public.reserve_inventory('20000000-0000-4000-8000-000000000005',array['inventory-test-offer'],'{}')$q$,'no longer available');
select public.bind_inventory_payment('20000000-0000-4000-8000-000000000004',null,'cs_test_inventory_offer');
select pg_temp.expect_error($q$select public.finalize_inventory_sale('pi_inventory_offer',array['inventory-test-offer'],90000,'usd',null,null,null,'20000000-0000-4000-8000-000000000004')$q$,'Session does not own');
select public.finalize_inventory_sale('pi_inventory_offer',array['inventory-test-offer'],90000,'usd','buyer@example.test','Test Buyer','{}','20000000-0000-4000-8000-000000000004','cs_test_inventory_offer');
select pg_temp.assert_true((public.finalize_inventory_sale('pi_inventory_offer',array['inventory-test-offer'],90000,'usd',null,null,null,'20000000-0000-4000-8000-000000000004','cs_test_inventory_offer')->>'already_recorded')::boolean,'Session and PI replays converge');
select pg_temp.assert_true((select count(*)=1 from public.orders where stripe_payment_intent='pi_inventory_offer'),'offer creates only one order');
select pg_temp.expect_error($q$select public.finalize_inventory_sale('pi_inventory_offer_again',array['inventory-test-offer'],90000,'usd',null,null,null,'20000000-0000-4000-8000-000000000004','cs_test_inventory_offer')$q$,'does not own');
select public.reserve_inventory('20000000-0000-4000-8000-000000000006',array['inventory-test-release-offer'],'{"email":"buyer@example.test"}','10000000-0000-4000-8000-000000000002');
select public.bind_inventory_payment('20000000-0000-4000-8000-000000000006',null,'cs_test_inventory_expired');
select public.release_inventory('20000000-0000-4000-8000-000000000006');
select pg_temp.assert_true((select status='countered' from public.offers where id='10000000-0000-4000-8000-000000000002'),'expired offer restores prior status');
select pg_temp.assert_true((select status='available' from public.paintings where id='inventory-test-release-offer'),'expired offer releases its painting');

-- Legacy verified payments may claim unowned manual reservations, but not a
-- held painting or a prior sale. No seed painting is created during fulfillment.
select public.finalize_inventory_sale('pi_inventory_legacy',array['inventory-test-legacy'],80000,'usd',null,null,null,null,'cs_test_inventory_legacy');
select pg_temp.assert_true((select status='sold' from public.paintings where id='inventory-test-legacy'),'legacy paid manual reservation finalized');
select pg_temp.expect_error($q$select public.finalize_inventory_sale('pi_inventory_missing',array['inventory-test-missing'],80000,'usd',null,null,null)$q$,'unknown painting');

-- Admin edits and their primary images commit or roll back together.
select public.rm_admin_save_painting('inventory-test-manual','{"status":"available"}',null,false,'reserved');
select pg_temp.assert_true((select status='available' from public.paintings where id='inventory-test-manual'),'admin can release a manual hold with no payment ownership');
select pg_temp.expect_error($q$select public.rm_admin_save_painting('inventory-test-admin',
  '{"slug":"inventory-test-admin","title":"Admin art","year":2026,"series":"abstract","medium":"Acrylic on canvas","w":20,"h":16,"price":500}',
  '{"url":"https://example.test/art.jpg","width":-1,"height":400}',true)$q$,'dimensions must be positive');
select pg_temp.assert_true((select count(*)=0 from public.paintings where id='inventory-test-admin'),'failed image rolled back new painting');
select public.rm_admin_save_painting('inventory-test-admin',
  '{"slug":"inventory-test-admin","title":"Admin art","year":2026,"series":"abstract","medium":"Acrylic on canvas","w":20,"h":16,"price":500}',
  '{"url":"https://example.test/art.jpg","width":500,"height":400}',true);
select pg_temp.assert_true((select count(*)=1 from public.painting_images where painting_id='inventory-test-admin' and is_primary and alt='Admin art, 2026'),'admin creates primary photo and title alt');
select pg_temp.expect_error($q$select public.rm_admin_save_painting('inventory-test-admin','{"title":"Must roll back"}',
  '{"url":"https://example.test/art2.jpg","width":0,"height":400}',false,'available')$q$,'dimensions must be positive');
select pg_temp.assert_true((select title='Admin art' from public.paintings where id='inventory-test-admin'),'failed photo rolled back metadata edit');
select public.rm_admin_save_painting('inventory-test-admin','{"title":"Renamed art"}',
  '{"url":"https://example.test/art2.jpg","width":600,"height":400}',false,'available');
select pg_temp.assert_true((select count(*)=1 from public.painting_images where painting_id='inventory-test-admin' and is_primary and url='https://example.test/art2.jpg'),'admin replaces primary without duplicating rows');
select pg_temp.expect_error($q$select public.rm_admin_save_painting('inventory-test-admin','{"title":"Stale edit"}',null,false,'reserved')$q$,'Availability changed');
select public.reserve_inventory('20000000-0000-4000-8000-000000000007',array['inventory-test-admin'],'{}');
select pg_temp.expect_error($q$select public.rm_admin_save_painting('inventory-test-admin','{}',
  '{"url":"https://example.test/art3.jpg"}',false,'reserved')$q$,'held by an active checkout');
select public.release_inventory('20000000-0000-4000-8000-000000000007');
select public.rm_admin_save_painting('inventory-test-admin','{"note":"__rm_deleted__"}',null,false,'available');
select pg_temp.assert_true((select note='__rm_deleted__' from public.paintings where id='inventory-test-admin'),'unsold admin deletion uses tombstone');
select pg_temp.expect_error($q$select public.rm_admin_save_painting('inventory-test-a','{"note":"__rm_deleted__"}',null,false,'sold')$q$,'cannot be deleted');

-- Execute the actual RPCs under the same database role used by the server.
set local role service_role;
select public.reserve_inventory('20000000-0000-4000-8000-000000000008',array['inventory-test-release-offer'],'{}');
select public.bind_inventory_payment('20000000-0000-4000-8000-000000000008','pi_inventory_service_role');
select public.finalize_inventory_sale('pi_inventory_service_role',array['inventory-test-release-offer'],100000,'usd',null,null,null,'20000000-0000-4000-8000-000000000008');
reset role;
select pg_temp.assert_true((select status='sold' from public.paintings where id='inventory-test-release-offer'),'service_role executes full inventory lifecycle');

-- An owner-confirmed test keeps a private payment tombstone, not stock ownership.
insert into public.paintings(id,slug,title,year,series,medium,w,h,price,status) values
('inventory-test-void','inventory-test-void','Retired test painting',2026,'abstract','Acrylic on canvas',20,16,400,'available');
insert into public.orders(stripe_session_id,stripe_payment_intent,amount_total,currency,status,painting_ids)
values('pi_inventory_void','pi_inventory_void',500,'usd','void_test',array['inventory-test-void']);
set local role service_role;
select pg_temp.assert_true(public.finalize_inventory_sale('pi_inventory_void',array['inventory-test-void'],500,'usd',null,null,null)->>'status'='void_test','retired test replay is acknowledged without a sale');
select pg_temp.assert_true((select status='available' from public.paintings where id='inventory-test-void'),'retired test replay leaves painting available');
select pg_temp.assert_true((select count(*)=0 from public.inventory_sales where painting_id='inventory-test-void'),'retired test replay creates no stock owner');
select pg_temp.expect_error($q$select public.finalize_inventory_sale('pi_inventory_void',array['inventory-test-void'],40000,'usd',null,null,null)$q$,'does not match');
select pg_temp.expect_error($q$select public.finalize_inventory_sale('pi_inventory_void',array['inventory-test-c'],500,'usd',null,null,null)$q$,'does not match');
select public.reserve_inventory('20000000-0000-4000-8000-000000000009',array['inventory-test-void'],'{}');
select public.bind_inventory_payment('20000000-0000-4000-8000-000000000009','pi_inventory_genuine_after_void');
select pg_temp.assert_true(public.finalize_inventory_sale('pi_inventory_void',array['inventory-test-void'],500,'usd',null,null,null)->>'status'='void_test','retired test replay does not conflict with a new checkout');
select pg_temp.assert_true((select count(*)=1 from public.inventory_holds where painting_id='inventory-test-void' and reservation_id='20000000-0000-4000-8000-000000000009'),'new buyer keeps their hold after a retired test replay');
select pg_temp.assert_true(public.finalize_inventory_sale('pi_inventory_genuine_after_void',array['inventory-test-void'],40000,'usd',null,null,null,'20000000-0000-4000-8000-000000000009')->>'status'='paid','genuine payment can purchase a previously test-sold painting');
select pg_temp.assert_true(public.finalize_inventory_sale('pi_inventory_void',array['inventory-test-void'],500,'usd',null,null,null)->>'status'='void_test','retired test replay remains ignored after a genuine sale');
select pg_temp.assert_true((select stripe_payment_intent='pi_inventory_genuine_after_void' from public.inventory_sales where painting_id='inventory-test-void'),'retired test cannot replace genuine ownership');
select pg_temp.expect_error($q$update public.paintings set status='available' where id='inventory-test-void'$q$,'cannot be made available');
select pg_temp.assert_true((select status='void_test' from public.orders where stripe_payment_intent='pi_inventory_void'),'retired payment stays marked as a test');
reset role;

-- Privileges are part of the invariant: clients cannot reserve, release, sell,
-- read buyer details, or discover a reservation capability through the Data API.
select pg_temp.assert_true(not has_function_privilege('anon','public.reserve_inventory(uuid,text[],jsonb,uuid)','EXECUTE'),'anon cannot reserve');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.release_inventory(uuid)','EXECUTE'),'authenticated cannot release');
select pg_temp.assert_true(not has_function_privilege('anon','public.finalize_inventory_sale(text,text[],integer,text,text,text,jsonb,uuid,text)','EXECUTE'),'anon cannot finalize');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.rm_admin_save_painting(text,jsonb,jsonb,boolean,text)','EXECUTE'),'ordinary authenticated users cannot edit inventory');
select pg_temp.assert_true(has_function_privilege('service_role','public.reserve_inventory(uuid,text[],jsonb,uuid)','EXECUTE'),'server can reserve');
select pg_temp.assert_true(not has_table_privilege('anon','public.inventory_reservations','SELECT'),'buyer details private');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.inventory_holds','SELECT'),'hold identity private');
select pg_temp.assert_true(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('reserve_inventory','bind_inventory_payment','release_inventory','finalize_inventory_sale','guard_painting_inventory') and p.prosecdef),'no SECURITY DEFINER inventory functions');
select pg_temp.assert_true((select count(*)=5 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('reserve_inventory','bind_inventory_payment','release_inventory','finalize_inventory_sale','guard_painting_inventory') and array_to_string(p.proconfig,',') like '%search_path%'),'all inventory function search paths fixed');

rollback;
