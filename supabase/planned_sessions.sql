-- v2.0 R5: planned sessions so a custom workout can be added to a date.
-- The weekly Planner view is R6 — this file only stores the rows.
-- Run after supabase/custom_workouts.sql.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: it never deletes sessions, sets or custom workouts.
-- Do not run until the user confirms.

create table if not exists public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  -- No FK to routine_days so this file can run before routines.sql. R6 can tighten it.
  routine_day_id text,
  custom_workout_id uuid references public.custom_workouts (id) on delete cascade,
  status text not null default 'planned',
  created_at timestamptz not null default now()
);

alter table public.planned_sessions drop constraint if exists planned_sessions_status_check;
alter table public.planned_sessions add constraint planned_sessions_status_check check (
  status in ('planned', 'done', 'skipped', 'rest')
);

alter table public.planned_sessions drop constraint if exists planned_sessions_source_check;
alter table public.planned_sessions add constraint planned_sessions_source_check check (
  (status = 'rest' and routine_day_id is null and custom_workout_id is null)
  or (
    status <> 'rest'
    and (
      (routine_day_id is not null and custom_workout_id is null)
      or (routine_day_id is null and custom_workout_id is not null)
    )
  )
);

-- One live plan (or rest) per day. Skipped/done stay as history.
create unique index if not exists planned_sessions_one_live_idx
  on public.planned_sessions (user_id, date)
  where status in ('planned', 'rest');

create index if not exists planned_sessions_user_date_idx
  on public.planned_sessions (user_id, date);

alter table public.planned_sessions enable row level security;

drop policy if exists "Users can read their own planned sessions" on public.planned_sessions;
create policy "Users can read their own planned sessions" on public.planned_sessions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users can create their own planned sessions" on public.planned_sessions;
create policy "Users can create their own planned sessions" on public.planned_sessions
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users can update their own planned sessions" on public.planned_sessions;
create policy "Users can update their own planned sessions" on public.planned_sessions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists "Users can delete their own planned sessions" on public.planned_sessions;
create policy "Users can delete their own planned sessions" on public.planned_sessions
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.planned_sessions to authenticated;
