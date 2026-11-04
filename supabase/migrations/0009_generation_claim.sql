-- Reading a model-drawn label takes a while, and overlapping ticks mustn't each read it and each pay for a retry.
alter table public.generations add column claimed_at timestamptz;
