-- What's printed on the front of the approved pack, read once so that every model-drawn image is judged against the same text.
alter table public.products add column pack_text jsonb;
-- From an integration pass that was tried and replaced by model-led placement. Nothing uses it.
alter table public.assets drop column if exists integration;
