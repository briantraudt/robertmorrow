-- One-of-a-kind inventory. Apply after schema.sql, as a reviewed migration.
-- The reservation/payment IDs and buyer data below are private to the server.
-- Expiry is a reconciliation deadline, NEVER permission to release inventory:
-- the server must first confirm the Stripe payment is canceled/session expired.

create table if not exists public.inventory_reservations (
  id uuid primary key,
  status text not null default 'pending' check (status in ('pending','active','paid','released')),
  kind text not null check (kind in ('cart','offer')),
  painting_ids text[] not null,
  items jsonb not null,
  amount_total integer not null check (amount_total > 0),
  buyer jsonb not null,
  offer_id uuid references public.offers(id),
  offer_previous_status text,
  stripe_payment_intent text unique,
  stripe_session_id text unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(painting_ids) between 1 and 10),
  check (jsonb_typeof(items) = 'array'),
  check (jsonb_typeof(buyer) = 'object'),
  check ((kind = 'offer') = (offer_id is not null))
);

create index if not exists inventory_reservations_expiry_idx
  on public.inventory_reservations(expires_at) where status in ('pending','active');

create table if not exists public.inventory_holds (
  painting_id text primary key references public.paintings(id) on delete restrict,
  reservation_id uuid not null references public.inventory_reservations(id) on delete restrict
);
create index if not exists inventory_holds_reservation_idx on public.inventory_holds(reservation_id);

-- One payment can contain multiple paintings, but each painting has one owner.
create table if not exists public.inventory_sales (
  painting_id text primary key references public.paintings(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  stripe_payment_intent text not null,
  reservation_id uuid references public.inventory_reservations(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists inventory_sales_payment_idx on public.inventory_sales(stripe_payment_intent);
create index if not exists inventory_sales_order_idx on public.inventory_sales(order_id);
create index if not exists inventory_sales_reservation_idx on public.inventory_sales(reservation_id);

-- Do not silently discard historical duplicate orders. Deployment preflight
-- verified that this site's orders table was empty before this migration.
create unique index if not exists orders_payment_intent_unique
  on public.orders(stripe_payment_intent) where stripe_payment_intent is not null;

alter table public.inventory_reservations enable row level security;
alter table public.inventory_holds enable row level security;
alter table public.inventory_sales enable row level security;
revoke all on public.inventory_reservations, public.inventory_holds, public.inventory_sales from public, anon, authenticated;
grant select, insert, update, delete on public.inventory_reservations, public.inventory_holds, public.inventory_sales to service_role;
grant select, insert, update, delete on public.paintings, public.painting_images, public.offers, public.orders to service_role;

-- Keep signed/admin payment operations on the server. The functions use the
-- caller's privileges; none bypasses RLS by becoming SECURITY DEFINER.
create or replace function public.reserve_inventory(
  p_reservation_id uuid,
  p_painting_ids text[],
  p_buyer jsonb,
  p_offer_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_ids text[];
  v_res public.inventory_reservations%rowtype;
  v_offer public.offers%rowtype;
  v_items jsonb;
  v_amount bigint;
  v_count integer;
begin
  if p_reservation_id is null or p_painting_ids is null
     or cardinality(p_painting_ids) not between 1 and 10
     or p_buyer is null or jsonb_typeof(p_buyer) <> 'object' then
    raise exception 'Invalid reservation request.';
  end if;
  select array_agg(x order by x) into v_ids from (select distinct unnest(p_painting_ids) x) s;
  if cardinality(v_ids) <> cardinality(p_painting_ids)
     or exists(select 1 from unnest(v_ids) x where x is null or btrim(x) = '') then
    raise exception 'Painting IDs must be nonempty and unique.';
  end if;

  -- Serialize even the first request for this id, before its row exists.
  perform pg_advisory_xact_lock(hashtextextended('rm-reservation:' || p_reservation_id::text, 0));
  select * into v_res from public.inventory_reservations where id = p_reservation_id for update;
  if found then
    if v_res.painting_ids is distinct from v_ids or v_res.buyer is distinct from p_buyer
       or v_res.offer_id is distinct from p_offer_id then
      raise exception 'Reservation does not match this checkout.';
    end if;
    return to_jsonb(v_res);
  end if;

  if p_offer_id is not null then
    select * into v_offer from public.offers where id = p_offer_id for update;
    if not found or v_offer.status not in ('new','countered') then
      raise exception 'Offer is no longer available for acceptance.';
    end if;
    if cardinality(v_ids) <> 1 or v_ids[1] <> v_offer.painting_id
       or lower(coalesce(p_buyer ->> 'email', '')) <> lower(v_offer.email)
       or v_offer.amount < 1 then
      raise exception 'Offer does not match this checkout.';
    end if;
  end if;

  -- A consistent lock order avoids overlapping-cart deadlocks. Every requested
  -- painting must pass; no partial cart is reserved if one item is unavailable.
  perform id from public.paintings where id = any(v_ids) order by id for update;
  select count(*) into v_count from public.paintings where id = any(v_ids);
  if v_count <> cardinality(v_ids) then raise exception 'One or more paintings were not found.'; end if;
  if exists(select 1 from public.paintings p where p.id = any(v_ids)
    and (p.status <> 'available' or p.note = '__rm_deleted__' or p.price <= 0))
    or exists(select 1 from public.inventory_holds where painting_id = any(v_ids))
    or exists(select 1 from public.inventory_sales where painting_id = any(v_ids)) then
    raise exception 'One or more paintings are no longer available.';
  end if;

  select jsonb_agg(jsonb_build_object('id',p.id,'slug',p.slug,'title',p.title,
           'unit_amount',case when p_offer_id is null then p.price::bigint * 100 else v_offer.amount::bigint * 100 end) order by p.id),
         sum(case when p_offer_id is null then p.price::bigint * 100 else v_offer.amount::bigint * 100 end)
  into v_items,v_amount from public.paintings p where p.id = any(v_ids);
  if v_amount < 50 or v_amount > 99999999 then raise exception 'Checkout amount is outside the supported range.'; end if;

  insert into public.inventory_reservations(id,kind,painting_ids,items,amount_total,buyer,offer_id,offer_previous_status,expires_at)
  values(p_reservation_id,case when p_offer_id is null then 'cart' else 'offer' end,
    v_ids,v_items,v_amount::integer,p_buyer,p_offer_id,v_offer.status,
    now() + case when p_offer_id is null then interval '30 minutes' else interval '24 hours' end)
  returning * into v_res;
  update public.paintings set status = 'reserved' where id = any(v_ids);
  insert into public.inventory_holds(painting_id,reservation_id) select unnest(v_ids),p_reservation_id;
  if p_offer_id is not null then update public.offers set status = 'accepted' where id = p_offer_id; end if;
  return to_jsonb(v_res);
end;
$$;

create or replace function public.bind_inventory_payment(
  p_reservation_id uuid,
  p_payment_intent text default null,
  p_session_id text default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_res public.inventory_reservations%rowtype;
begin
  if p_reservation_id is null or (p_payment_intent is null) = (p_session_id is null)
    or (p_payment_intent is not null and p_payment_intent !~ '^pi_[A-Za-z0-9_]+$')
    or (p_session_id is not null and p_session_id !~ '^cs_[A-Za-z0-9_]+$') then
    raise exception 'Invalid payment binding.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('rm-reservation:' || p_reservation_id::text, 0));
  select * into v_res from public.inventory_reservations where id = p_reservation_id for update;
  if not found or v_res.status = 'released' then raise exception 'Reservation is no longer active.'; end if;
  if v_res.stripe_payment_intent is not null or v_res.stripe_session_id is not null then
    if (p_payment_intent is not null and v_res.stripe_payment_intent = p_payment_intent)
      or (p_session_id is not null and v_res.stripe_session_id = p_session_id) then return to_jsonb(v_res); end if;
    raise exception 'Reservation already has a different payment.';
  end if;
  if v_res.status <> 'pending' then raise exception 'Reservation is no longer active.'; end if;
  update public.inventory_reservations set stripe_payment_intent = p_payment_intent,
    stripe_session_id = p_session_id, status = 'active', updated_at = now()
  where id = p_reservation_id returning * into v_res;
  return to_jsonb(v_res);
end;
$$;

create or replace function public.release_inventory(p_reservation_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_res public.inventory_reservations%rowtype;
  v_owned text[];
begin
  if p_reservation_id is null then raise exception 'Reservation is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('rm-reservation:' || p_reservation_id::text, 0));
  select * into v_res from public.inventory_reservations where id = p_reservation_id for update;
  if not found then raise exception 'Reservation was not found.'; end if;
  if v_res.status in ('released','paid') then return to_jsonb(v_res); end if;
  perform id from public.paintings where id = any(v_res.painting_ids) order by id for update;
  -- Only release ownership belonging to this reservation; never another buyer's
  -- hold or a painting for which any sale has been recorded.
  select array_agg(painting_id) into v_owned from public.inventory_holds where reservation_id = p_reservation_id;
  delete from public.inventory_holds where reservation_id = p_reservation_id;
  update public.paintings p set status = 'available'
  where p.id = any(v_owned) and p.status = 'reserved'
    and not exists(select 1 from public.inventory_sales s where s.painting_id = p.id);
  if v_res.offer_id is not null then
    update public.offers set status = coalesce(v_res.offer_previous_status,'new')
    where id = v_res.offer_id and status = 'accepted';
  end if;
  update public.inventory_reservations set status = 'released',updated_at = now()
    where id = p_reservation_id returning * into v_res;
  return to_jsonb(v_res);
end;
$$;

create or replace function public.finalize_inventory_sale(
  p_payment_intent text,
  p_painting_ids text[],
  p_amount_total integer,
  p_currency text,
  p_email text,
  p_name text,
  p_shipping jsonb,
  p_reservation_id uuid default null,
  p_session_id text default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_ids text[];
  v_res_id uuid := p_reservation_id;
  v_res public.inventory_reservations%rowtype;
  v_order public.orders%rowtype;
  v_order_ids text[];
  v_count integer;
  v_existing boolean := false;
begin
  if p_payment_intent is null or p_payment_intent !~ '^pi_[A-Za-z0-9_]+$'
    or p_painting_ids is null or cardinality(p_painting_ids) not between 1 and 10
    or p_amount_total is null or p_amount_total <= 0 or lower(coalesce(p_currency,'')) <> 'usd' then
    raise exception 'Invalid paid order.';
  end if;
  select array_agg(x order by x) into v_ids from (select distinct unnest(p_painting_ids) x) s;
  if cardinality(v_ids) <> cardinality(p_painting_ids)
    or exists(select 1 from unnest(v_ids) x where x is null or btrim(x) = '') then
    raise exception 'Painting IDs must be nonempty and unique.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('rm-payment:' || p_payment_intent, 0));
  -- Keep the identity of an owner-confirmed test payment after its inventory
  -- is restored. A delayed webhook or legacy reconciliation must not sell it
  -- again, including while a later genuine buyer holds or owns the painting.
  select * into v_order from public.orders
    where stripe_payment_intent = p_payment_intent and status = 'void_test' for update;
  if found then
    select array_agg(x order by x) into v_order_ids from (select distinct unnest(v_order.painting_ids) x) s;
    if v_order_ids is distinct from v_ids or v_order.amount_total is distinct from p_amount_total
      or lower(v_order.currency) is distinct from lower(p_currency) then
      raise exception 'Retired test payment does not match its recorded details.';
    end if;
    return jsonb_build_object('order_id',v_order.id,'painting_ids',v_ids,'status','void_test','already_recorded',true);
  end if;
  if v_res_id is null then
    select id into v_res_id from public.inventory_reservations
    where stripe_payment_intent = p_payment_intent or (p_session_id is not null and stripe_session_id = p_session_id);
  end if;
  if v_res_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('rm-reservation:' || v_res_id::text, 0));
    select * into v_res from public.inventory_reservations where id = v_res_id for update;
    if not found or v_res.status not in ('active','paid') then raise exception 'Reservation is not ready for payment.'; end if;
    if v_res.painting_ids is distinct from v_ids or v_res.amount_total <> p_amount_total then
      raise exception 'Payment does not match reserved paintings or amount.';
    end if;
    if v_res.stripe_payment_intent is not null and v_res.stripe_payment_intent <> p_payment_intent then
      raise exception 'Payment does not own this reservation.';
    end if;
    if v_res.stripe_session_id is not null and (v_res.stripe_session_id is distinct from p_session_id) then
      raise exception 'Checkout Session does not own this reservation.';
    end if;
    if v_res.stripe_payment_intent is null and v_res.stripe_session_id is null then
      raise exception 'Reservation has no bound payment.';
    end if;
  end if;

  perform id from public.paintings where id = any(v_ids) order by id for update;
  select count(*) into v_count from public.paintings where id = any(v_ids);
  if v_count <> cardinality(v_ids) then raise exception 'Paid order contains an unknown painting.'; end if;
  if exists(select 1 from public.inventory_holds where painting_id = any(v_ids)
      and (v_res_id is null or reservation_id <> v_res_id)) then
    raise exception 'Painting is held by a different checkout.';
  end if;
  if exists(select 1 from public.inventory_sales where painting_id = any(v_ids) and stripe_payment_intent <> p_payment_intent) then
    raise exception 'Painting has already been sold to another payment.';
  end if;

  select * into v_order from public.orders where stripe_payment_intent = p_payment_intent for update;
  v_existing := found;
  if v_existing then
    select array_agg(x order by x) into v_order_ids from (select distinct unnest(v_order.painting_ids) x) s;
    if v_order_ids is distinct from v_ids or v_order.amount_total is distinct from p_amount_total
      or lower(v_order.currency) is distinct from lower(p_currency) or v_order.status <> 'paid' then
      raise exception 'Payment was already recorded with different order details.';
    end if;
  else
    if exists(select 1 from public.paintings p where p.id = any(v_ids)
      and (p.status = 'sold' or p.note = '__rm_deleted__')) then
      raise exception 'Painting is no longer available for this payment.';
    end if;
    if v_res_id is not null and (
      (select count(*) from public.inventory_holds where reservation_id = v_res_id and painting_id = any(v_ids)) <> cardinality(v_ids)
      or exists(select 1 from public.paintings p where p.id = any(v_ids) and p.status <> 'reserved')
    ) then raise exception 'Reservation no longer owns every painting.'; end if;
    insert into public.orders(stripe_session_id,stripe_payment_intent,email,name,amount_total,currency,status,painting_ids,shipping_address)
    values(coalesce(p_session_id,p_payment_intent),p_payment_intent,p_email,p_name,p_amount_total,lower(p_currency),'paid',v_ids,p_shipping)
    returning * into v_order;
  end if;

  insert into public.inventory_sales(painting_id,order_id,stripe_payment_intent,reservation_id)
    select unnest(v_ids),v_order.id,p_payment_intent,v_res_id on conflict (painting_id) do nothing;
  if v_res_id is not null then delete from public.inventory_holds where reservation_id = v_res_id; end if;
  update public.paintings set status = 'sold' where id = any(v_ids);
  if v_res_id is not null then
    update public.inventory_reservations set status = 'paid',stripe_payment_intent = p_payment_intent,
      stripe_session_id = coalesce(stripe_session_id,p_session_id),updated_at = now() where id = v_res_id;
  end if;
  return jsonb_build_object('order_id',v_order.id,'painting_ids',v_ids,'status','paid','already_recorded',v_existing);
end;
$$;

-- Normal admin CRUD cannot reopen paid paintings or modify a buyer's active
-- hold. Internal inventory functions need no privilege bypass: they change
-- ownership and status together while holding the affected painting rows.
create or replace function public.guard_painting_inventory()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if exists(select 1 from public.inventory_holds where painting_id = old.id) then
    if tg_op = 'DELETE' then raise exception 'Painting is held by an active checkout.'; end if;
    if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      raise exception 'Painting is held by an active checkout.';
    end if;
  end if;
  if tg_op = 'DELETE' then
    if old.status = 'sold' or exists(select 1 from public.inventory_sales where painting_id = old.id)
      or exists(select 1 from public.orders where status = 'paid' and old.id = any(painting_ids)) then
      raise exception 'Sold paintings must remain in the order history.';
    end if;
    return old;
  end if;
  if (old.status = 'sold' or exists(select 1 from public.inventory_sales where painting_id = old.id)
      or exists(select 1 from public.orders where status = 'paid' and old.id = any(painting_ids)))
    and (new.status <> 'sold' or new.id <> old.id) then
    raise exception 'A sold painting cannot be made available again.';
  end if;
  return new;
end;
$$;

drop trigger if exists paintings_inventory_guard on public.paintings;
create trigger paintings_inventory_guard before update or delete on public.paintings
  for each row execute function public.guard_painting_inventory();

alter function public.rm_set_updated_at() set search_path = '';

-- Admin metadata and the optional primary photograph are one transaction.
-- This also makes an editor's stale availability check race-safe with checkout.
create or replace function public.rm_admin_save_painting(
  p_id text,
  p_fields jsonb,
  p_image jsonb default null,
  p_create boolean default false,
  p_expected_status text default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_before public.paintings%rowtype;
  v_next public.paintings%rowtype;
  v_image_id uuid;
  v_alt text;
begin
  if p_id is null or btrim(p_id) = '' or length(p_id) > 200 or p_fields is null
    or jsonb_typeof(p_fields) <> 'object' or p_create is null then
    raise exception 'Invalid painting save request.';
  end if;
  if exists(select 1 from jsonb_object_keys(p_fields) k
    where k not in ('slug','title','year','series','medium','w','h','price','status','note','framing','sort_order'))
    or (not p_create and p_fields ? 'slug') then
    raise exception 'Painting save contains unsupported fields.';
  end if;
  if p_image is not null and (jsonb_typeof(p_image) <> 'object'
    or coalesce(btrim(p_image->>'url'),'') = ''
    or exists(select 1 from jsonb_object_keys(p_image) k where k not in ('url','alt','width','height'))) then
    raise exception 'Invalid painting photograph.';
  end if;

  if p_create then
    v_next := jsonb_populate_record(null::public.paintings,p_fields || jsonb_build_object('id',p_id));
    v_next.status := coalesce(v_next.status,'available');
    if v_next.note = '__rm_deleted__' then raise exception 'Cannot create a deleted painting.'; end if;
  else
    select * into v_before from public.paintings where id = p_id for update;
    if not found or v_before.note = '__rm_deleted__' then raise exception 'Painting was not found.'; end if;
    if p_expected_status is null or v_before.status is distinct from p_expected_status then
      raise exception 'Availability changed while you were editing. Refresh before saving.';
    end if;
    if exists(select 1 from public.inventory_holds where painting_id = p_id) then
      raise exception 'Painting is held by an active checkout.';
    end if;
    v_next := jsonb_populate_record(v_before,p_fields);
    if v_next.status <> v_before.status and (v_before.status = 'sold'
      or exists(select 1 from public.inventory_sales where painting_id = p_id)
      or exists(select 1 from public.orders where status = 'paid' and p_id = any(painting_ids))) then
      raise exception 'Sold paintings cannot be made available through editing.';
    end if;
    if v_next.note = '__rm_deleted__' and (v_before.status <> 'available' or p_image is not null) then
      raise exception 'Reserved and sold paintings cannot be deleted.';
    end if;
  end if;

  if v_next.title is null or btrim(v_next.title) = '' or v_next.slug is null or btrim(v_next.slug) = ''
    or v_next.year is null or v_next.year < 0 or v_next.year > 9999
    or v_next.medium is null or btrim(v_next.medium) = ''
    or v_next.w is null or v_next.w <= 0 or v_next.h is null or v_next.h <= 0
    or v_next.price is null or v_next.price < 0 or v_next.price > 999999
    or v_next.series is null or v_next.series not in ('abstract','nature')
    or v_next.status is null or v_next.status not in ('available','reserved','sold') then
    raise exception 'Painting fields are invalid.';
  end if;

  if p_create then
    insert into public.paintings(id,slug,title,year,series,medium,w,h,price,status,note,framing,sort_order)
    values(p_id,v_next.slug,v_next.title,v_next.year,v_next.series,v_next.medium,v_next.w,v_next.h,
      v_next.price,v_next.status,v_next.note,v_next.framing,v_next.sort_order)
    returning * into v_next;
  else
    update public.paintings set title=v_next.title,year=v_next.year,series=v_next.series,medium=v_next.medium,
      w=v_next.w,h=v_next.h,price=v_next.price,status=v_next.status,note=v_next.note,
      framing=v_next.framing,sort_order=v_next.sort_order
    where id=p_id returning * into v_next;
  end if;

  if p_image is not null then
    if (p_image->>'width')::integer <= 0 or (p_image->>'height')::integer <= 0 then
      raise exception 'Photograph dimensions must be positive.';
    end if;
    v_alt := coalesce(nullif(btrim(p_image->>'alt'),''),v_next.title || case when v_next.year > 0 then ', ' || v_next.year::text else '' end);
    select id into v_image_id from public.painting_images where painting_id=p_id and is_primary=true
      order by created_at desc,id limit 1 for update;
    if v_image_id is null then
      insert into public.painting_images(painting_id,url,alt,width,height,is_primary,sort_order)
      values(p_id,p_image->>'url',v_alt,(p_image->>'width')::integer,(p_image->>'height')::integer,true,0)
      returning id into v_image_id;
    else
      update public.painting_images set url=p_image->>'url',alt=v_alt,width=(p_image->>'width')::integer,
        height=(p_image->>'height')::integer,is_primary=true,sort_order=0 where id=v_image_id;
    end if;
    update public.painting_images set is_primary=false where painting_id=p_id and id<>v_image_id and is_primary=true;
  end if;
  return jsonb_build_object('id',v_next.id,'slug',v_next.slug);
end;
$$;

revoke all on function public.reserve_inventory(uuid,text[],jsonb,uuid) from public,anon,authenticated;
revoke all on function public.bind_inventory_payment(uuid,text,text) from public,anon,authenticated;
revoke all on function public.release_inventory(uuid) from public,anon,authenticated;
revoke all on function public.finalize_inventory_sale(text,text[],integer,text,text,text,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.guard_painting_inventory() from public,anon,authenticated;
revoke all on function public.rm_admin_save_painting(text,jsonb,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.reserve_inventory(uuid,text[],jsonb,uuid) to service_role;
grant execute on function public.bind_inventory_payment(uuid,text,text) to service_role;
grant execute on function public.release_inventory(uuid) to service_role;
grant execute on function public.finalize_inventory_sale(text,text[],integer,text,text,text,jsonb,uuid,text) to service_role;
grant execute on function public.guard_painting_inventory() to service_role;
grant execute on function public.rm_admin_save_painting(text,jsonb,jsonb,boolean,text) to service_role;
