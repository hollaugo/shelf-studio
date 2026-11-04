-- Persistent model evaluation. Prompts are fixed cases, each task keeps a snapshot of its prompt, and scores are per role.
create table public.eval_cases (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  kind text not null check (kind in ('image','video')),
  title text not null,
  category text not null default 'core',
  prompt text not null,
  shape text not null default 'square' check (shape in ('square','wide')),
  look_for text not null default '',
  agent_prompt boolean not null default false,
  shot text,
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.eval_runs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products on delete cascade,
  kind text not null check (kind in ('image','video')),
  name text not null,
  created_by text not null,
  est_credits int not null default 0,
  created_at timestamptz not null default now()
);

create table public.eval_tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.eval_runs on delete cascade,
  case_id uuid not null references public.eval_cases on delete cascade,
  model text not null,
  generation_id uuid not null references public.generations on delete cascade,
  prompt text not null,
  composite_path text,
  created_at timestamptz not null default now(),
  unique (run_id, case_id, model)
);
create index eval_tasks_case on public.eval_tasks (case_id, model);

create table public.eval_annotations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.eval_tasks on delete cascade,
  author_role text not null,
  overall int not null check (overall between 1 and 5),
  scores jsonb not null default '{}',
  tags text[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, author_role)
);

alter table public.eval_cases enable row level security;
alter table public.eval_runs enable row level security;
alter table public.eval_tasks enable row level security;
alter table public.eval_annotations enable row level security;
