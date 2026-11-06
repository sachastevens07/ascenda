-- M1 (revised): WorkoutX exercise ids and media-usage tracking.
-- Run after supabase/exercises.sql.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: it only adds a column and a table if they are missing.
-- Do not run until the user confirms.
-- Never deletes sessions, sets, or exercise rows.
-- Leaves MuscleWiki columns (musclewiki_id, mw_video_urls, mw_cached_at) in place.

alter table public.exercises add column if not exists workoutx_id text;

alter table public.exercises drop constraint if exists exercises_workoutx_id_check;
alter table public.exercises add constraint exercises_workoutx_id_check check (
  workoutx_id is null or workoutx_id ~ '^ex_[A-Za-z0-9]+$'
);

comment on column public.exercises.workoutx_id is
  'WorkoutX v2 exercise id (female model where available) after a reviewed match. Null until approved. Store ids, never media URLs.';

-- One row per WorkoutX API fetch made by the Edge Function.
-- Integers only. Never store media URLs, keys, or WorkoutX response bodies.
create table if not exists public.media_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id text not null,
  kind text not null,
  wx_exercises_used integer,
  wx_exercises_remaining integer,
  wx_exercises_limit integer,
  created_at timestamptz not null default now()
);

alter table public.media_usage drop constraint if exists media_usage_kind_check;
alter table public.media_usage add constraint media_usage_kind_check check (
  kind in ('fetch', 'play')
);

create index if not exists media_usage_user_created_idx
  on public.media_usage (user_id, created_at desc);

create index if not exists media_usage_created_idx
  on public.media_usage (created_at desc);

comment on table public.media_usage is
  'WorkoutX media fetches for plan-limit tracking. No URLs or API keys.';

alter table public.media_usage enable row level security;

drop policy if exists "Users can insert own media usage" on public.media_usage;
create policy "Users can insert own media usage"
  on public.media_usage
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own media usage" on public.media_usage;
create policy "Users can read own media usage"
  on public.media_usage
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select, insert on public.media_usage to authenticated;
