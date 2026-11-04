-- A PDP is what gets made, reviewed and published. A product has one per channel, each with numbered versions.
create type public.pdp_status as enum ('draft','in_review','changes_requested','approved','live','replaced');

create table public.pdps (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products on delete cascade,
  channel text not null,
  version int not null,
  status public.pdp_status not null default 'draft',
  based_on uuid references public.pdps,
  created_by text not null default 'system',
  submitted_at timestamptz,
  decided_at timestamptz,
  live_at timestamptz,
  created_at timestamptz not null default now(),
  unique (product_id, channel, version)
);
create unique index pdps_one_live on public.pdps (product_id, channel) where status = 'live';
create unique index pdps_one_open on public.pdps (product_id, channel) where status in ('draft','in_review','approved');
create index pdps_status on public.pdps (status);

-- Exactly which assets a version holds. Written when it's submitted, so what was reviewed can't drift.
create table public.pdp_items (
  pdp_id uuid not null references public.pdps on delete cascade,
  shot_key text not null references public.shot_templates(key),
  asset_id uuid not null references public.assets,
  flagged boolean not null default false,
  flag_note text,
  primary key (pdp_id, shot_key)
);
create index pdp_items_asset on public.pdp_items (asset_id);

alter table public.pdps enable row level security;
alter table public.pdp_items enable row level security;

-- Decisions are now on a PDP. Earlier asset-level rows stay on record.
alter table public.reviews alter column asset_id drop not null;
alter table public.reviews add column pdp_id uuid references public.pdps on delete cascade;
alter table public.publications add column pdp_id uuid references public.pdps on delete set null;

-- Whatever is published today becomes that channel's first live version.
insert into public.pdps (product_id, channel, version, status, created_by, submitted_at, decided_at, live_at, created_at)
select a.product_id, a.channel, 1, 'live', 'migration', min(a.submitted_at), min(p.published_at), min(p.published_at), min(a.created_at)
from public.assets a
join public.publications p on p.asset_id = a.id
where a.is_current and a.state = 'published'
group by a.product_id, a.channel;

insert into public.pdp_items (pdp_id, shot_key, asset_id)
select d.id, a.shot_key, a.id
from public.assets a
join public.pdps d on d.product_id = a.product_id and d.channel = a.channel and d.status = 'live'
where a.is_current and a.state = 'published';

update public.publications p set pdp_id = i.pdp_id from public.pdp_items i where i.asset_id = p.asset_id;

-- Anything else in progress becomes the open draft. Assets approved but not published need a fresh PDP review.
insert into public.pdps (product_id, channel, version, status, based_on, created_by, created_at)
select a.product_id, a.channel, coalesce(max(l.version), 0) + 1, 'draft', max(l.id::text)::uuid, 'migration', min(a.created_at)
from public.assets a
left join public.pdps l on l.product_id = a.product_id and l.channel = a.channel and l.status = 'live'
where a.is_current and a.state not in ('published', 'draft')
group by a.product_id, a.channel;
