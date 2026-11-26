-- Shop POS cloud viewing: private tables (Part 1 of the cloud sync module).
--
-- Design: docs/development/CLOUD_SYNC_DESIGN.md. Nothing here is a second shop database.
-- The shop's local SQLite file stays the only authority; these tables hold a read-only copy
-- that the shop computer publishes and the owner views.
--
-- Security model:
--   * Every table lives in the private schema "pos", which the Supabase API does not expose.
--   * Row level security is ON and no policy exists, so no API role can read or write a row
--     directly. Only the SECURITY DEFINER functions in the next migration touch these tables.
--   * No service-role key is needed by any app. Never put one in the shop app or the viewer.

create schema if not exists pos;
revoke all on schema pos from public, anon, authenticated;

-- One shop per project. The unique index on a constant enforces that at the database level.
create table pos.shops (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(name) between 1 and 80),
  visible_generation bigint,
  next_generation    bigint not null default 1,
  created_at         timestamptz not null default now()
);
create unique index shops_single_shop on pos.shops ((true));

-- The owner sign-in and the one enrolled shop computer. A user can hold one active membership.
create table pos.memberships (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references pos.shops (id),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('OWNER', 'DEVICE')),
  generation bigint,
  label      text check (label is null or char_length(label) between 1 and 60),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_seen_at timestamptz,
  check ((kind = 'DEVICE') = (generation is not null)),
  check (active = (revoked_at is null))
);
create unique index memberships_one_active_per_user on pos.memberships (user_id) where active;
create index memberships_shop_kind on pos.memberships (shop_id, kind, active);

-- One-time codes that connect a shop computer. Only the SHA-256 of the code is stored.
create table pos.device_enrollments (
  code_hash  bytea primary key check (octet_length(code_hash) = 32),
  shop_id    uuid not null references pos.shops (id),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz,
  used_by    uuid references auth.users (id) on delete set null,
  check (expires_at > created_at)
);

-- Where each published stream (generation) stands. A generation is one continuous stream from
-- one shop computer; a rebuild always starts a new generation and becomes visible only when its
-- final batch arrives.
create table pos.sync_state (
  shop_id          uuid not null references pos.shops (id),
  generation       bigint not null,
  published_seq    bigint not null default 0 check (published_seq >= 0),
  complete         boolean not null default false,
  schema_version   integer,
  source_as_of     timestamptz,
  last_received_at timestamptz,
  primary key (shop_id, generation)
);

-- Replay and gap proof. The same (generation, seq) with the same hash is a harmless resend.
create table pos.batches (
  shop_id      uuid not null,
  generation   bigint not null,
  seq          bigint not null check (seq >= 1),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  entity_count integer not null check (entity_count between 0 and 500),
  applied_at   timestamptz not null default now(),
  primary key (shop_id, generation, seq),
  foreign key (shop_id, generation) references pos.sync_state (shop_id, generation)
);

-- Owner-safe read models, one row per record. dto holds exact decimal strings for money.
create table pos.entities (
  shop_id       uuid not null,
  generation    bigint not null,
  type          text not null check (type in ('product', 'invoice', 'day', 'month', 'expense', 'closing', 'shop')),
  id            text not null check (char_length(id) between 1 and 80),
  business_date date,
  search        text not null default '' check (char_length(search) <= 600),
  dto           jsonb not null check (jsonb_typeof(dto) = 'object' and pg_column_size(dto) <= 200000),
  tombstone     boolean not null default false,
  last_seq      bigint not null check (last_seq >= 1),
  primary key (shop_id, generation, type, id),
  foreign key (shop_id, generation) references pos.sync_state (shop_id, generation)
);
create index entities_by_date on pos.entities (shop_id, generation, type, business_date desc, id desc);

alter table pos.shops               enable row level security;
alter table pos.memberships         enable row level security;
alter table pos.device_enrollments  enable row level security;
alter table pos.sync_state          enable row level security;
alter table pos.batches             enable row level security;
alter table pos.entities            enable row level security;

revoke all on all tables in schema pos from public, anon, authenticated;
