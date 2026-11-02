-- v2.1 S9: programme paths, checkpoint weeks, challenges.
-- Run after supabase/routines.sql (stretches.sql is optional; this file also adds is_checkpoint).
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: it never deletes sessions, sets, or enrolments.
-- Do not run until the user confirms.

-- 1. Checkpoint flag on weeks (also in stretches.sql).
alter table public.routine_weeks add column if not exists is_checkpoint boolean not null default false;

-- Six-week plans: week 4. Eight-week plans: weeks 4 and 8.
update public.routine_weeks
set is_checkpoint = (week_number = 4)
where routine_id in ('gym-confidence-6', 'one-spot-6', 'busy-gym-6');

update public.routine_weeks
set is_checkpoint = (week_number in (4, 8))
where routine_id in ('full-body-3', 'upper-lower-4', 'lower-body-3');

-- 2. Ordered sequences of routines. Paths are Pro; the first step can be a free routine.
create table if not exists public.routine_paths (
  id text primary key,
  name text not null,
  description text not null,
  cover_image_id text references public.images (id) on delete set null,
  is_pro boolean not null default true,
  sort_order smallint not null default 0
);

create table if not exists public.routine_path_steps (
  path_id text not null references public.routine_paths (id) on delete cascade,
  routine_id text not null references public.routines (id) on delete cascade,
  step_order smallint not null,
  primary key (path_id, step_order)
);

create unique index if not exists routine_path_steps_path_routine_idx
  on public.routine_path_steps (path_id, routine_id);

alter table public.routine_path_steps drop constraint if exists routine_path_steps_order_check;
alter table public.routine_path_steps add constraint routine_path_steps_order_check check (
  step_order between 1 and 20
);

-- 3. Start vs now on a checkpoint week. History stays in sessions/sets if this table is empty.
create table if not exists public.checkpoint_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  enrolment_id uuid not null references public.routine_enrolments (id) on delete cascade,
  exercise_id text not null references public.exercises (id),
  week smallint not null,
  weight_kg numeric,
  reps smallint,
  recorded_at timestamptz not null default now()
);

create unique index if not exists checkpoint_results_enrolment_week_exercise_idx
  on public.checkpoint_results (enrolment_id, week, exercise_id);
create index if not exists checkpoint_results_user_idx
  on public.checkpoint_results (user_id, recorded_at desc);

alter table public.checkpoint_results drop constraint if exists checkpoint_results_week_check;
alter table public.checkpoint_results add constraint checkpoint_results_week_check check (
  week between 1 and 16
);

-- 4. Time-limited challenges with a linked routine.
create table if not exists public.challenges (
  id text primary key,
  name text not null,
  description text not null,
  cover_image_id text references public.images (id) on delete set null,
  routine_id text not null references public.routines (id),
  start_date date not null,
  end_date date not null,
  is_pro boolean not null default false
);

alter table public.challenges drop constraint if exists challenges_dates_check;
alter table public.challenges add constraint challenges_dates_check check (
  end_date >= start_date
);

create table if not exists public.challenge_participants (
  challenge_id text not null references public.challenges (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (challenge_id, user_id)
);

create index if not exists challenge_participants_user_idx
  on public.challenge_participants (user_id, joined_at desc);

-- 5. Seed. Replace path/challenge rows only.
delete from public.routine_path_steps where path_id = 'path-gym-to-strong';
delete from public.routine_paths where id = 'path-gym-to-strong';

insert into public.routine_paths (id, name, description, cover_image_id, is_pro, sort_order) values
  (
    'path-gym-to-strong',
    'Gym to strong',
    'Start with Gym Confidence, then a full-body plan, then glutes and legs, then upper and lower splits. Completing one unlocks a clear next step.',
    'cover-gym-confidence-6',
    true,
    1
  );

insert into public.routine_path_steps (path_id, routine_id, step_order) values
  ('path-gym-to-strong', 'gym-confidence-6', 1),
  ('path-gym-to-strong', 'full-body-3', 2),
  ('path-gym-to-strong', 'lower-body-3', 3),
  ('path-gym-to-strong', 'upper-lower-4', 4);

delete from public.challenge_participants
where challenge_id in ('challenge-quiet-nov', 'challenge-new-year');
delete from public.challenges
where id in ('challenge-quiet-nov', 'challenge-new-year');

insert into public.challenges (
  id, name, description, cover_image_id, routine_id, start_date, end_date, is_pro
) values
  (
    'challenge-quiet-nov',
    'Quiet start',
    'Four weeks of Gym Confidence, starting in a one-spot dumbbell corner. Join any time while it is open. No leaderboard.',
    'cover-gym-confidence-6',
    'gym-confidence-6',
    '2026-11-01',
    '2026-11-28',
    false
  ),
  (
    'challenge-new-year',
    'New Year, Quiet Start',
    'A calm four-week start in January. Same Gym Confidence sessions. Join when it opens. No leaderboard.',
    'cover-one-spot-6',
    'gym-confidence-6',
    '2027-01-04',
    '2027-01-31',
    false
  );

-- 6. RLS.
alter table public.routine_paths enable row level security;
alter table public.routine_path_steps enable row level security;
alter table public.checkpoint_results enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;

drop policy if exists "Signed-in users can read paths" on public.routine_paths;
create policy "Signed-in users can read paths" on public.routine_paths
  for select to authenticated using (true);
drop policy if exists "Signed-in users can read path steps" on public.routine_path_steps;
create policy "Signed-in users can read path steps" on public.routine_path_steps
  for select to authenticated using (true);

drop policy if exists "Users can read their own checkpoint results" on public.checkpoint_results;
create policy "Users can read their own checkpoint results" on public.checkpoint_results
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users can write their own checkpoint results" on public.checkpoint_results;
create policy "Users can write their own checkpoint results" on public.checkpoint_results
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users can update their own checkpoint results" on public.checkpoint_results;
create policy "Users can update their own checkpoint results" on public.checkpoint_results
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Signed-in users can read challenges" on public.challenges;
create policy "Signed-in users can read challenges" on public.challenges
  for select to authenticated using (true);

-- Real join counts need a read of every row. Only ids and timestamps, no emails.
drop policy if exists "Signed-in users can read challenge joins" on public.challenge_participants;
create policy "Signed-in users can read challenge joins" on public.challenge_participants
  for select to authenticated using (true);
drop policy if exists "Users can join challenges" on public.challenge_participants;
create policy "Users can join challenges" on public.challenge_participants
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users can update their own challenge joins" on public.challenge_participants;
create policy "Users can update their own challenge joins" on public.challenge_participants
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists "Users can leave challenges" on public.challenge_participants;
create policy "Users can leave challenges" on public.challenge_participants
  for delete to authenticated using (user_id = (select auth.uid()));

grant select on public.routine_paths to authenticated;
grant select on public.routine_path_steps to authenticated;
grant select, insert, update on public.checkpoint_results to authenticated;
grant select on public.challenges to authenticated;
grant select, insert, update, delete on public.challenge_participants to authenticated;
