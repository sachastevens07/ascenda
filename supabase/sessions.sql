-- Workout logging: sessions and the sets logged in them.
-- Run supabase/exercises.sql, profiles.sql and programmes.sql first.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: it never deletes anyone's workouts.

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The user's local date when she started.
  date date not null default current_date,
  -- Kept if the template changes; cleared only if the day is deleted.
  programme_day_id text references public.programme_days (id) on delete set null,
  started_at timestamptz not null default now(),
  -- Null while the session is in progress.
  completed_at timestamptz
);

create index if not exists sessions_user_started_idx on public.sessions (user_id, started_at desc);

create table if not exists public.sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  exercise_id text not null references public.exercises (id),
  set_number smallint not null check (set_number >= 1),
  -- Null for bodyweight and band exercises.
  weight_kg numeric(6, 2) check (weight_kg >= 0),
  reps smallint check (reps >= 0),
  completed boolean not null default false,
  completed_at timestamptz,
  unique (session_id, exercise_id, set_number)
);

create index if not exists sets_exercise_completed_idx on public.sets (exercise_id, completed_at desc);

-- Each user can only see and change her own sessions and sets.
alter table public.sessions enable row level security;
alter table public.sets enable row level security;

drop policy if exists "Users can read their own sessions" on public.sessions;
create policy "Users can read their own sessions" on public.sessions
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can create their own sessions" on public.sessions;
create policy "Users can create their own sessions" on public.sessions
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own sessions" on public.sessions;
create policy "Users can update their own sessions" on public.sessions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own sessions" on public.sessions;
create policy "Users can delete their own sessions" on public.sessions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- A set belongs to whoever owns its session.
drop policy if exists "Users can read their own sets" on public.sets;
create policy "Users can read their own sets" on public.sets
  for select to authenticated using (
    exists (select 1 from public.sessions s where s.id = session_id and s.user_id = (select auth.uid()))
  );
drop policy if exists "Users can create their own sets" on public.sets;
create policy "Users can create their own sets" on public.sets
  for insert to authenticated with check (
    exists (select 1 from public.sessions s where s.id = session_id and s.user_id = (select auth.uid()))
  );
drop policy if exists "Users can update their own sets" on public.sets;
create policy "Users can update their own sets" on public.sets
  for update to authenticated
  using (
    exists (select 1 from public.sessions s where s.id = session_id and s.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.sessions s where s.id = session_id and s.user_id = (select auth.uid()))
  );
drop policy if exists "Users can delete their own sets" on public.sets;
create policy "Users can delete their own sets" on public.sets
  for delete to authenticated using (
    exists (select 1 from public.sessions s where s.id = session_id and s.user_id = (select auth.uid()))
  );

grant select, insert, update, delete on public.sessions, public.sets to authenticated;
