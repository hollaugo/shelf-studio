alter table public.assets add column checks_done_at timestamptz;
alter table public.runs add column spent_credits int not null default 0;
