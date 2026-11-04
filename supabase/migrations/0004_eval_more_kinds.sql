-- The suite also covers text in images, copy, image analysis and cutouts.
-- Copy and analysis run on Claude, so their tasks have no Runway generation and carry their own status.
alter table eval_cases drop constraint eval_cases_kind_check;
alter table eval_cases add constraint eval_cases_kind_check check (kind in ('image', 'text_image', 'video', 'copy', 'analysis', 'cutout'));
alter table eval_cases add column spec jsonb not null default '{}';

alter table eval_runs drop constraint eval_runs_kind_check;
alter table eval_runs add constraint eval_runs_kind_check check (kind in ('image', 'text_image', 'video', 'copy', 'analysis', 'cutout'));

alter table eval_tasks alter column generation_id drop not null;
alter table eval_tasks
  add column status text check (status in ('queued', 'running', 'done', 'failed')),
  add column error text,
  add column started_at timestamptz,
  add column finished_at timestamptz,
  add column output jsonb,
  add column checks jsonb,
  add column input_tokens integer not null default 0,
  add column output_tokens integer not null default 0,
  add column cost_usd numeric(10, 4) not null default 0,
  add column processed_at timestamptz;

-- Finished images and all video need no further processing.
update eval_tasks set processed_at = created_at
where composite_path is not null
   or generation_id in (select id from generations where kind = 'video');

create index eval_tasks_unprocessed on eval_tasks (created_at) where processed_at is null and generation_id is not null;
create index eval_tasks_claude_status on eval_tasks (status) where status in ('queued', 'running');
