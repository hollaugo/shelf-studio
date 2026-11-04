-- Shelf Studio schema. The shot list and channel specs are rows, so a new SKU or retailer is data, not code.
create type public.asset_state as enum ('draft','generating','compositing','checking','needs_review','approved','published','failed','rejected');
create type public.check_result as enum ('pass','warn','fail');
create type public.review_decision as enum ('approve','reject');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  slug text unique not null,
  name text not null,
  size text,
  primary_claim text,
  approved_claims text[] not null default '{}',
  channels text[] not null default '{}',
  source text not null default 'upload',
  analysis jsonb,
  analysis_status text not null default 'none',
  analysis_error text,
  created_at timestamptz not null default now()
);

create table public.source_assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products on delete cascade,
  kind text not null check (kind in ('front','back','mask','cutout','reference')),
  storage_path text not null,
  width int,
  height int,
  created_at timestamptz not null default now(),
  unique (product_id, kind)
);

create table public.shot_templates (
  key text primary key,
  label text not null,
  mode text not null check (mode in ('deterministic','generated','image_to_video','agent_copy')),
  prompt_template text,
  model text,
  source_shot text references public.shot_templates(key),
  sort int not null default 0
);

create table public.channel_specs (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  shot_key text not null references public.shot_templates(key),
  width int,
  height int,
  scene_ratio text,
  format text not null,
  max_mb numeric,
  white_bg boolean not null default false,
  min_fill numeric,
  text_allowed boolean not null default true,
  unique (channel, shot_key)
);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products on delete cascade,
  channels text[] not null,
  status text not null default 'running',
  est_credits int not null default 0,
  created_by text not null default 'producer',
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- One row per call to a model. Assets with the same ratio share a scene, so a run isn't billed per channel.
create table public.generations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products on delete cascade,
  run_id uuid references public.runs on delete set null,
  scene_key text not null,
  kind text not null check (kind in ('image','video')),
  model text not null,
  ratio text not null,
  prompt text,
  inputs jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  runway_task_id text,
  runway_status text,
  attempt int not null default 0,
  retry_at timestamptz,
  output_path text,
  credits int not null default 0,
  error_code text,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (scene_key)
);
create index generations_active on public.generations (status) where status in ('queued','running');

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products on delete cascade,
  run_id uuid references public.runs on delete set null,
  spec_id uuid references public.channel_specs,
  generation_id uuid references public.generations,
  shot_key text not null references public.shot_templates(key),
  channel text not null,
  parent_id uuid references public.assets,
  version int not null default 1,
  is_current boolean not null default true,
  state public.asset_state not null default 'draft',
  failure_code text,
  failure_message text,
  storage_path text,
  scene_path text,
  width int,
  height int,
  alt_text text,
  content jsonb,
  refine jsonb,
  feedback text,
  overlay jsonb,
  credits int not null default 0,
  tokens int not null default 0,
  claimed_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assets_product on public.assets (product_id, is_current);
create index assets_state on public.assets (state) where is_current;
create unique index assets_one_current on public.assets (product_id, channel, shot_key) where is_current;

create table public.check_results (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets on delete cascade,
  check_key text not null,
  label text not null,
  result public.check_result not null,
  detail jsonb not null default '{}',
  ran_at timestamptz not null default now(),
  unique (asset_id, check_key)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets on delete cascade,
  reviewer_role text not null,
  decision public.review_decision not null,
  reason_code text,
  note text,
  regenerate boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets on delete cascade,
  channel text not null,
  target text not null,
  url text,
  published_by text not null,
  published_at timestamptz not null default now()
);

create table public.events (
  id bigint generated always as identity primary key,
  entity text not null,
  entity_id uuid not null,
  type text not null,
  from_state text,
  to_state text,
  actor text not null default 'system',
  credits int not null default 0,
  tokens int not null default 0,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);
create index events_entity on public.events (entity, entity_id, at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('producer','reviewer','owner')),
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- All access goes through server code with the secret key, so no table is exposed to anon or authenticated.
alter table public.products enable row level security;
alter table public.source_assets enable row level security;
alter table public.shot_templates enable row level security;
alter table public.channel_specs enable row level security;
alter table public.runs enable row level security;
alter table public.generations enable row level security;
alter table public.assets enable row level security;
alter table public.check_results enable row level security;
alter table public.reviews enable row level security;
alter table public.publications enable row level security;
alter table public.events enable row level security;
alter table public.notifications enable row level security;
alter table public.settings enable row level security;

-- Marketing images only. Paths are unguessable UUIDs.
insert into storage.buckets (id, name, public) values ('sources', 'sources', true), ('outputs', 'outputs', true) on conflict (id) do nothing;
