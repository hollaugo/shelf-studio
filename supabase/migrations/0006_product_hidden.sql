-- Takes a product out of lists and off the website without deleting it or what was spent on it.
alter table public.products add column hidden boolean not null default false;
