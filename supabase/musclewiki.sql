-- MuscleWiki: link our exercises to a female-model video, and cache the
-- stream URLs MuscleWiki returns (text/metadata only, up to 30 days).
-- Run after supabase/exercises.sql.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: it only adds columns if they are missing.
-- Do not run until the user confirms.
-- Never deletes sessions, sets, or exercise rows.

alter table public.exercises add column if not exists musclewiki_id integer;
alter table public.exercises add column if not exists mw_video_urls jsonb;
alter table public.exercises add column if not exists mw_cached_at timestamptz;

alter table public.exercises drop constraint if exists exercises_musclewiki_id_check;
alter table public.exercises add constraint exercises_musclewiki_id_check check (
  musclewiki_id is null or musclewiki_id > 0
);

comment on column public.exercises.musclewiki_id is
  'MuscleWiki exercise id after a reviewed match. Null until approved.';
comment on column public.exercises.mw_video_urls is
  'Female video URLs last returned by GET /exercises/{id}?gender=female. Stream-only; never download.';
comment on column public.exercises.mw_cached_at is
  'When mw_video_urls was last refreshed. Refresh if older than 30 days.';
