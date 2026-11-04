-- Whether a model's integration pass was used for this asset, and how it measured. Nothing else depends on it.
alter table public.assets add column integration jsonb;
