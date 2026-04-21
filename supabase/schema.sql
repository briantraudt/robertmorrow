-- =========================================================================
-- Robert Morrow Art — Supabase schema
--
-- Apply this once, from the Supabase SQL editor, right after you create the
-- project. You can also run it with the Supabase CLI:
--   supabase db push
--
-- Tables:
--   paintings          — the catalog
--   painting_images    — one row per photograph
--   offers             — buyer offers (the "Make offer" feature)
--   orders             — Stripe order records (written by the webhook)
--
-- Storage buckets:
--   Create a public bucket named `paintings` from the Supabase dashboard
--   (Storage → New bucket → check "Public bucket"). Upload Robert's photos
--   there and reference them by URL in painting_images.url.
-- =========================================================================

-- ---------- Extensions -----------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------- Paintings ------------------------------------------------------
create table if not exists paintings (
  id           text primary key,
  slug         text unique not null,
  title        text not null,
  year         integer not null,
  series       text not null check (series in ('abstract','nature')),
  medium       text not null,
  w            integer not null,
  h            integer not null,
  price        integer not null,
  status       text not null default 'available'
               check (status in ('available','sold','reserved')),
  note         text,
  palette      text[],
  aspect       numeric,
  sort_order   integer,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists paintings_status_idx on paintings (status);
create index if not exists paintings_series_idx on paintings (series);

-- ---------- Painting images -----------------------------------------------
create table if not exists painting_images (
  id           uuid primary key default gen_random_uuid(),
  painting_id  text not null references paintings(id) on delete cascade,
  url          text not null,
  alt          text,
  width        integer,
  height       integer,
  is_primary   boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists painting_images_painting_idx
  on painting_images (painting_id);

-- ---------- Offers ---------------------------------------------------------
create table if not exists offers (
  id           uuid primary key default gen_random_uuid(),
  painting_id  text not null references paintings(id) on delete cascade,
  name         text not null,
  email        text not null,
  phone        text,
  amount       integer not null,
  message      text,
  status       text not null default 'new'
               check (status in ('new','accepted','declined','countered','withdrawn')),
  counter      integer,
  internal_note text,
  token        uuid not null default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists offers_painting_idx on offers (painting_id);
create index if not exists offers_status_idx on offers (status);
create unique index if not exists offers_token_idx on offers (token);

-- ---------- Orders (Stripe webhook target) --------------------------------
create table if not exists orders (
  id                    uuid primary key default gen_random_uuid(),
  stripe_session_id     text unique not null,
  stripe_payment_intent text,
  email                 text,
  name                  text,
  amount_total          integer,
  currency              text default 'usd',
  status                text default 'pending',
  painting_ids          text[] not null default '{}',
  shipping_address      jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists orders_email_idx on orders (email);

-- ---------- Row level security --------------------------------------------
-- Public (anon key): can read paintings + painting_images. Writes happen
-- server-side via the service role key, which bypasses RLS.
alter table paintings        enable row level security;
alter table painting_images  enable row level security;
alter table offers           enable row level security;
alter table orders           enable row level security;

drop policy if exists "paintings read public"      on paintings;
drop policy if exists "painting_images read public" on painting_images;

create policy "paintings read public"
  on paintings for select
  using (true);

create policy "painting_images read public"
  on painting_images for select
  using (true);

-- offers & orders: no public policies; only service role can touch them.

-- ---------- updated_at trigger --------------------------------------------
create or replace function rm_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists paintings_updated_at on paintings;
create trigger paintings_updated_at before update on paintings
  for each row execute function rm_set_updated_at();

drop trigger if exists offers_updated_at on offers;
create trigger offers_updated_at before update on offers
  for each row execute function rm_set_updated_at();
