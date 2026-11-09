-- v2.3 W2 + W3: standalone cardio sessions and logs.
-- Run after supabase/stretches.sql (sessions.source) and supabase/session_blocks_w1.sql (sessions.type).
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions or sets.
-- Do not run until the user confirms.

-- 1. Session source 'cardio'. The app also stores the session slug on exercise_swaps._cardio_slug,
--    so the player still restores if this column is missing.
alter table public.sessions drop constraint if exists sessions_source_check;
alter table public.sessions add constraint sessions_source_check check (
  source in ('programme', 'custom', 'ai', 'routine', 'stretch', 'cardio')
);

alter table public.sessions add column if not exists cardio_session_slug text;

-- 2. One cardio log per finished session. Distance and calories are typed by her; never estimated.
create table if not exists public.cardio_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cardio_session_slug text not null,
  machine_id text not null,
  minutes numeric(5, 1) not null check (minutes >= 0 and minutes <= 180),
  settings_used jsonb not null default '{}'::jsonb,
  effort smallint check (effort is null or effort between 1 and 10),
  distance_km numeric(6, 2) check (distance_km is null or distance_km >= 0),
  calories integer check (calories is null or calories >= 0),
  created_at timestamptz not null default now()
);

alter table public.cardio_logs drop constraint if exists cardio_logs_settings_object;
alter table public.cardio_logs add constraint cardio_logs_settings_object check (
  jsonb_typeof(settings_used) = 'object'
);
alter table public.cardio_logs drop constraint if exists cardio_logs_machine_check;
alter table public.cardio_logs add constraint cardio_logs_machine_check check (
  machine_id in (
    'treadmill',
    'bike',
    'cross_trainer',
    'rower',
    'stair_climber',
    'mixed'
  )
);

create index if not exists cardio_logs_user_created_idx
  on public.cardio_logs (user_id, created_at desc);

alter table public.cardio_logs enable row level security;

drop policy if exists "Users can read their own cardio logs" on public.cardio_logs;
create policy "Users can read their own cardio logs" on public.cardio_logs
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own cardio logs" on public.cardio_logs;
create policy "Users can create their own cardio logs" on public.cardio_logs
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own cardio logs" on public.cardio_logs;
create policy "Users can update their own cardio logs" on public.cardio_logs
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own cardio logs" on public.cardio_logs;
create policy "Users can delete their own cardio logs" on public.cardio_logs
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.cardio_logs to authenticated;
