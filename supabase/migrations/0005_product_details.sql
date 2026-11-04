-- The product database: what description pages are written from, beyond name, size and claims.
alter table public.products add column details jsonb not null default '{}';
