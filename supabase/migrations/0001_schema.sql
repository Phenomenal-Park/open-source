-- Myeongdong Street Map — core schema (spec v5.0 §68–§81, §94, §129)
-- Spot = physical position. Stall = seller unit. Observation = what was seen at a Spot at a time.
-- All primary keys are immutable UUIDs. M numbers / O numbers are operational labels only.

create schema if not exists private;  -- internal helpers, never exposed through the API
revoke all on schema private from public;

-- ───────────────────────── enums ─────────────────────────
create type public.stall_kind as enum ('food', 'retail');
create type public.spot_status as enum ('candidate', 'active', 'dormant', 'temporarily_blocked', 'retired', 'merged_duplicate');
create type public.price_type as enum ('FIXED', 'RANGE', 'VARIES', 'UNKNOWN');
create type public.spice_source as enum ('FIELD_OBSERVED', 'SELLER_CONFIRMED', 'MENU_SIGN', 'ADMIN', 'UNKNOWN');
create type public.hours_mode as enum ('DEFAULT', 'CUSTOM');
create type public.hours_source as enum ('AREA_DEFAULT', 'FIELD_VERIFIED', 'OWNER_CONFIRMED', 'USER_REPORTED', 'ADMIN');
create type public.observation_result as enum ('INITIAL', 'SAME', 'CHANGED', 'NO_STALL', 'UNCERTAIN');
create type public.hint_relation as enum ('near', 'in_front', 'opposite', 'beside');
create type public.admin_role as enum ('owner', 'admin', 'field_worker');
create type public.payment_kind as enum ('card_worked', 'card_failed', 'cash_used', 'unknown');
create type public.dietary_claim_kind as enum (
  'halal_certified', 'seller_claims_halal', 'no_pork_confirmed', 'no_alcohol_confirmed',
  'contains_pork', 'contains_alcohol', 'vegetarian', 'unconfirmed');
create type public.photo_kind as enum ('food', 'product', 'exterior', 'menu_board', 'price_board', 'other');
create type public.moderation_status as enum ('visible', 'pending', 'hidden');
create type public.report_status as enum ('open', 'accepted', 'rejected', 'merged');

-- ───────────────────────── settings ─────────────────────────
-- Single-row operational settings. require_mfa=true makes every admin RPC demand an AAL2 session.
create table public.app_settings (
  id boolean primary key default true check (id),
  require_mfa boolean not null default false,
  -- sha256 hex of the server-side secret the Next.js server sends with public RPC calls.
  -- Public RPCs refuse calls without it, so the anon key alone cannot bulk-read the dataset.
  server_secret_hash text,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (true);

-- ───────────────────────── admin ─────────────────────────
create table public.admin_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.admin_role not null,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  table_name text not null,
  row_id text,
  old_data jsonb,
  new_data jsonb
);
create index on public.audit_logs (table_name, row_id);
create index on public.audit_logs (at desc);

-- ───────────────────────── reference data ─────────────────────────
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_i18n jsonb not null default '{}',
  timezone text not null default 'Asia/Seoul',
  center_lat double precision not null,
  center_lng double precision not null,
  default_zoom smallint not null default 17,
  created_at timestamptz not null default now()
);

-- Minutes from 00:00. close_min may be 1440 (= 24:00) or larger for after-midnight closing (spec §56).
create table public.area_default_hours (
  area_id uuid not null references public.areas (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),  -- ISO: 1 = Monday … 7 = Sunday
  is_open boolean not null default true,
  open_min smallint not null check (open_min between 0 and 1439),
  close_min smallint not null check (close_min between 1 and 2880),
  primary key (area_id, weekday),
  check (close_min > open_min)
);

create table public.categories (
  code text primary key,
  kind public.stall_kind not null,
  sort_order smallint not null,
  color text not null,
  color_dark text not null,
  name_i18n jsonb not null
);

create table public.subcategories (
  id uuid primary key default gen_random_uuid(),
  category_code text not null references public.categories (code),
  code text not null unique,
  sort_order smallint not null default 0,
  name_i18n jsonb not null,
  is_public_filter boolean not null default true
);

create table public.tags (
  code text primary key,
  name_i18n jsonb not null
);

-- Normalized concepts that menu items can map to (search + SEO food pages).
create table public.normalized_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                     -- also the /food/[slug]
  subcategory_id uuid references public.subcategories (id),
  name_i18n jsonb not null,
  search_terms text[] not null default '{}',     -- lowercase synonyms in any language
  tags text[] not null default '{}'
);
create index on public.normalized_items using gin (search_terms);

create table public.landmarks (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas (id),
  code text not null unique,
  name_i18n jsonb not null,
  short_i18n jsonb not null default '{}',        -- name used inside location hints ("UNIQLO")
  lat double precision not null,
  lng double precision not null,
  kind text not null default 'building',         -- station, exit, building, road, direction
  priority smallint not null default 5,          -- 1 = always show
  deleted_at timestamptz
);

-- ───────────────────────── display lines (§31–§35) ─────────────────────────
create table public.stall_display_lines (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas (id),
  name text not null default '',
  path jsonb not null check (jsonb_typeof(path) = 'array' and jsonb_array_length(path) >= 2), -- [[lat,lng],…]
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ───────────────────────── spots (§69–§81) ─────────────────────────
-- Allocator row: M numbers come from here under a row lock inside the save transaction.
-- Because it is transactional, a cancelled or failed save never consumes a number,
-- and two concurrent saves can never get the same number. Numbers are never decremented → never reused.
create table public.spot_number_allocator (
  id boolean primary key default true check (id),
  last_value integer not null default 0
);
insert into public.spot_number_allocator (id) values (true);

create table public.spots (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas (id),
  m_number integer not null unique check (m_number > 0),
  status public.spot_status not null default 'active',
  raw_lat double precision not null,
  raw_lng double precision not null,
  -- derived display position (never overwrites raw)
  display_line_id uuid references public.stall_display_lines (id),
  display_progress double precision,   -- meters along the display line
  display_lat double precision,
  display_lng double precision,
  -- location hint: landmark + relation. Strong relations only when verified (§8).
  hint_landmark_id uuid references public.landmarks (id),
  hint_relation public.hint_relation not null default 'near',
  hint_verified boolean not null default false,
  hint_text_i18n jsonb not null default '{}',     -- free-text override per locale
  merged_into_spot_id uuid references public.spots (id),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hint_relation = 'near' or hint_verified),
  check ((status = 'merged_duplicate') = (merged_into_spot_id is not null))
);
create index on public.spots (raw_lat, raw_lng);
create index on public.spots (display_line_id);

create table public.spot_location_history (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots (id),
  lat double precision not null,
  lng double precision not null,
  reason text not null default 'created',
  changed_by uuid,
  changed_at timestamptz not null default now()
);

-- ───────────────────────── patrol routes (§75–§78) ─────────────────────────
create table public.patrol_routes (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas (id),
  name text not null,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_active_route_per_area on public.patrol_routes (area_id) where is_active;

create table public.patrol_route_spots (
  route_id uuid not null references public.patrol_routes (id) on delete cascade,
  spot_id uuid not null references public.spots (id),
  order_position integer not null,
  primary key (route_id, spot_id),
  constraint route_order_unique unique (route_id, order_position) deferrable initially deferred
);

-- ───────────────────────── stalls ─────────────────────────
create table public.stalls (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category_code text not null references public.categories (code),
  official_name text,                              -- nullable: never invent official names (§40)
  hours_mode public.hours_mode not null default 'DEFAULT',
  hours_source public.hours_source not null default 'AREA_DEFAULT',
  representative_photo_id uuid,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.stall_localizations (
  stall_id uuid not null references public.stalls (id) on delete cascade,
  locale text not null check (locale ~ '^[a-z]{2}(-[a-z]{2})?$'),
  display_name text,
  description text,
  primary key (stall_id, locale)
);

create table public.stall_tags (
  stall_id uuid not null references public.stalls (id) on delete cascade,
  tag_code text not null references public.tags (code),
  primary key (stall_id, tag_code)
);

create table public.stall_spot_assignments (
  id uuid primary key default gen_random_uuid(),
  stall_id uuid not null references public.stalls (id),
  spot_id uuid not null references public.spots (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_reason text,
  created_by uuid
);
-- one current primary occupant per spot
create unique index current_assignment_per_spot on public.stall_spot_assignments (spot_id) where ended_at is null;
create index on public.stall_spot_assignments (stall_id) where ended_at is null;

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  client_request_id uuid unique,                   -- idempotency for flaky field networks
  spot_id uuid not null references public.spots (id),
  stall_id uuid references public.stalls (id),
  route_id uuid references public.patrol_routes (id),
  result public.observation_result not null,
  details jsonb not null default '{}',
  observed_at timestamptz not null default now(),
  observer_id uuid
);
create index on public.observations (spot_id, observed_at desc);
create index on public.observations (stall_id, observed_at desc);

-- ───────────────────────── menu (§43–§51, §94) ─────────────────────────
create table public.stall_menu_items (
  id uuid primary key default gen_random_uuid(),
  stall_id uuid not null references public.stalls (id),
  normalized_item_id uuid references public.normalized_items (id),
  subcategory_id uuid references public.subcategories (id),
  display_name text not null check (length(trim(display_name)) > 0),
  name_i18n jsonb not null default '{}',
  price_type public.price_type not null default 'UNKNOWN',
  price_amount integer check (price_amount >= 0),
  price_min integer check (price_min >= 0),
  price_max integer check (price_max >= 0),
  currency text not null default 'KRW',
  operator_spice_level smallint check (operator_spice_level between 0 and 3),  -- null = unknown
  spice_source public.spice_source not null default 'UNKNOWN',
  display_order integer not null default 0,
  is_representative boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (price_type <> 'FIXED' or price_amount is not null),
  check (price_type <> 'RANGE' or (price_min is not null and price_max is not null and price_max >= price_min))
);
create index on public.stall_menu_items (stall_id, display_order) where deleted_at is null;
create unique index one_representative_per_stall on public.stall_menu_items (stall_id)
  where is_representative and deleted_at is null;

create table public.price_observations (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.stall_menu_items (id),
  observation_id uuid references public.observations (id),
  price_type public.price_type not null,
  price_amount integer,
  price_min integer,
  price_max integer,
  source text not null default 'FIELD',
  observed_at timestamptz not null default now()
);

create table public.weekly_hours_overrides (
  stall_id uuid not null references public.stalls (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  is_open boolean not null default true,
  open_min smallint not null check (open_min between 0 and 1439),
  close_min smallint not null check (close_min between 1 and 2880),
  primary key (stall_id, weekday),
  check (close_min > open_min)
);

-- ───────────────────────── anonymous community ─────────────────────────
create table public.anonymous_devices (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,                 -- sha256 of the random device token; raw token never stored
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_blocked boolean not null default false
);

create table public.menu_spice_votes (
  menu_item_id uuid not null references public.stall_menu_items (id),
  device_id uuid not null references public.anonymous_devices (id),
  level smallint not null check (level between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (menu_item_id, device_id)
);

create table public.payment_observations (
  id uuid primary key default gen_random_uuid(),
  stall_id uuid not null references public.stalls (id),
  kind public.payment_kind not null,
  source text not null,                            -- FIELD / REVIEW / OWNER
  device_id uuid references public.anonymous_devices (id),
  observation_id uuid references public.observations (id),
  observed_at timestamptz not null default now()
);

create table public.dietary_claims (
  id uuid primary key default gen_random_uuid(),
  stall_id uuid not null references public.stalls (id),
  menu_item_id uuid references public.stall_menu_items (id),
  claim public.dietary_claim_kind not null,
  evidence_photo_id uuid,
  is_verified boolean not null default false,
  source text not null default 'FIELD',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (claim <> 'halal_certified' or (is_verified and evidence_photo_id is not null))
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  stall_id uuid not null references public.stalls (id),
  device_id uuid not null references public.anonymous_devices (id),
  nickname text check (length(nickname) <= 30),
  rating smallint not null check (rating between 1 and 5),
  taste smallint check (taste between 1 and 5),
  value smallint check (value between 1 and 5),
  kindness smallint check (kindness between 1 and 5),
  price_matched boolean,
  open_now boolean,
  original_language text,
  original_text text check (length(original_text) <= 1000),
  status public.moderation_status not null default 'visible',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.reviews (stall_id, created_at desc) where deleted_at is null;

create table public.review_translations (
  review_id uuid not null references public.reviews (id) on delete cascade,
  locale text not null,
  translated_text text not null,
  provider text,
  created_at timestamptz not null default now(),
  primary key (review_id, locale)
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  stall_id uuid references public.stalls (id),
  spot_id uuid references public.spots (id),
  menu_item_id uuid references public.stall_menu_items (id),
  observation_id uuid references public.observations (id),
  storage_path text not null,
  kind public.photo_kind not null default 'food',
  source text not null default 'FIELD',
  device_id uuid references public.anonymous_devices (id),
  created_by uuid,
  is_pinned boolean not null default false,
  status public.moderation_status not null default 'visible',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.stalls add constraint stalls_rep_photo_fk foreign key (representative_photo_id) references public.photos (id);
alter table public.dietary_claims add constraint dietary_evidence_fk foreign key (evidence_photo_id) references public.photos (id);

create table public.photo_votes (
  photo_id uuid not null references public.photos (id),
  device_id uuid not null references public.anonymous_devices (id),
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (photo_id, device_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  stall_id uuid references public.stalls (id),
  spot_id uuid references public.spots (id),
  menu_item_id uuid references public.stall_menu_items (id),
  device_id uuid references public.anonymous_devices (id),
  kind text not null check (kind in ('closed', 'price_changed', 'menu_changed', 'moved', 'wrong_info', 'other')),
  payload jsonb not null default '{}',
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);

-- DB-level rate-limit backstop (works across serverless instances)
create table public.rate_limit_buckets (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);
