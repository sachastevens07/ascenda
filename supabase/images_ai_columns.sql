-- Extra image columns for the automatic photo finder.
-- Paste this in the Supabase SQL editor. It does not delete rows.
-- It does not touch sessions, sets, enrolments or profiles.
-- Safe to run again. Does not change status, urls or licence fields.

alter table public.images add column if not exists photographer_url text;
alter table public.images add column if not exists ai_score numeric;
alter table public.images add column if not exists ai_notes text;
