-- v2.2 H1: streak rework (gold weeks, rest weeks, hide streak).
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets or other profile fields.
-- Does not drop leftover rest_passes columns from activity.sql.

-- 1. Profile fields.
alter table public.profiles
  add column if not exists rest_weeks_banked smallint;

alter table public.profiles
  add column if not exists hide_streak boolean;

update public.profiles
set rest_weeks_banked = 0
where rest_weeks_banked is null;

update public.profiles
set hide_streak = false
where hide_streak is null;

alter table public.profiles
  alter column rest_weeks_banked set default 0;

alter table public.profiles
  alter column hide_streak set default false;

alter table public.profiles drop constraint if exists profiles_rest_weeks_banked_check;
alter table public.profiles add constraint profiles_rest_weeks_banked_check check (
  rest_weeks_banked is null or (rest_weeks_banked >= 0 and rest_weeks_banked <= 2)
);

-- 2. One row per user per Monday. The app writes 'rest' when she plans or
-- applies a rest week. Other statuses are computed from sessions.
create table if not exists public.streak_weeks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  status text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.streak_weeks drop constraint if exists streak_weeks_status_check;
alter table public.streak_weeks add constraint streak_weeks_status_check check (
  status in ('counted', 'gold', 'rest', 'repaired', 'missed')
);

alter table public.streak_weeks drop constraint if exists streak_weeks_week_start_monday_check;
alter table public.streak_weeks add constraint streak_weeks_week_start_monday_check check (
  extract(isodow from week_start) = 1
);

create index if not exists streak_weeks_user_week_idx
  on public.streak_weeks (user_id, week_start desc);

alter table public.streak_weeks enable row level security;

drop policy if exists "Users can read their own streak weeks" on public.streak_weeks;
create policy "Users can read their own streak weeks" on public.streak_weeks
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can insert their own streak weeks" on public.streak_weeks;
create policy "Users can insert their own streak weeks" on public.streak_weeks
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their own streak weeks" on public.streak_weeks;
create policy "Users can update their own streak weeks" on public.streak_weeks
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own streak weeks" on public.streak_weeks;
create policy "Users can delete their own streak weeks" on public.streak_weeks
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.streak_weeks to authenticated;
