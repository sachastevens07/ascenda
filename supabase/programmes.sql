-- Programmes: workout templates stored as data, and automatic assignment from the quiz.
-- Run supabase/exercises.sql and supabase/profiles.sql first.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: it updates the templates in place and re-assigns everyone's programme.

create table if not exists public.programmes (
  id text primary key,
  name text not null,
  description text not null,
  days_per_week smallint not null check (days_per_week between 1 and 6),
  created_at timestamptz not null default now()
);

create table if not exists public.programme_days (
  id text primary key,
  programme_id text not null references public.programmes (id) on delete cascade,
  day_number smallint not null check (day_number >= 1),
  name text not null,
  unique (programme_id, day_number)
);

-- One exercise slot in a day. Each slot names the exercise to do for each
-- "where you train" quiz answer: full gym, dumbbells only, or home (bodyweight and bands).
create table if not exists public.programme_exercises (
  programme_day_id text not null references public.programme_days (id) on delete cascade,
  position smallint not null check (position >= 1),
  sets smallint not null check (sets between 1 and 6),
  rep_min smallint not null check (rep_min >= 1),
  rep_max smallint not null,
  full_gym_exercise_id text not null,
  dumbbells_exercise_id text not null,
  home_exercise_id text not null,
  primary key (programme_day_id, position),
  check (rep_max >= rep_min),
  -- Named so the app can pick one of the three when loading a programme.
  constraint programme_exercises_full_gym_fkey foreign key (full_gym_exercise_id) references public.exercises (id),
  constraint programme_exercises_dumbbells_fkey foreign key (dumbbells_exercise_id) references public.exercises (id),
  constraint programme_exercises_home_fkey foreign key (home_exercise_id) references public.exercises (id)
);

-- Signed-in users can read the templates. Nobody can change them from the app.
alter table public.programmes enable row level security;
alter table public.programme_days enable row level security;
alter table public.programme_exercises enable row level security;

drop policy if exists "Signed-in users can read programmes" on public.programmes;
create policy "Signed-in users can read programmes" on public.programmes
  for select to authenticated using (true);
drop policy if exists "Signed-in users can read programme days" on public.programme_days;
create policy "Signed-in users can read programme days" on public.programme_days
  for select to authenticated using (true);
drop policy if exists "Signed-in users can read programme exercises" on public.programme_exercises;
create policy "Signed-in users can read programme exercises" on public.programme_exercises
  for select to authenticated using (true);

grant select on public.programmes, public.programme_days, public.programme_exercises to authenticated;

-- Templates ----------------------------------------------------------------

insert into public.programmes (id, name, description, days_per_week) values
  ('full-body-2', 'Full body', 'Two full-body sessions a week. Ideal if you''re busy or just getting started.', 2),
  ('full-body-3', 'Full body', 'Three full-body sessions a week. Beginner-friendly, and it works at any level.', 3),
  ('upper-lower-4', 'Upper/lower', 'Two upper-body and two lower-body sessions a week, for when you know your way around.', 4),
  ('lower-body-3', 'Lower-body focus', 'Two glute and leg sessions and one upper-body session a week.', 3),
  ('lower-body-4', 'Lower-body focus', 'Three glute and leg sessions and one upper-body session a week.', 4)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  days_per_week = excluded.days_per_week;

insert into public.programme_days (id, programme_id, day_number, name) values
  ('full-body-2-a', 'full-body-2', 1, 'Full body A'),
  ('full-body-2-b', 'full-body-2', 2, 'Full body B'),
  ('full-body-3-a', 'full-body-3', 1, 'Full body A'),
  ('full-body-3-b', 'full-body-3', 2, 'Full body B'),
  ('full-body-3-c', 'full-body-3', 3, 'Full body C'),
  ('upper-lower-4-upper-a', 'upper-lower-4', 1, 'Upper A'),
  ('upper-lower-4-lower-a', 'upper-lower-4', 2, 'Lower A'),
  ('upper-lower-4-upper-b', 'upper-lower-4', 3, 'Upper B'),
  ('upper-lower-4-lower-b', 'upper-lower-4', 4, 'Lower B'),
  ('lower-body-3-glutes', 'lower-body-3', 1, 'Glutes and hamstrings'),
  ('lower-body-3-upper', 'lower-body-3', 2, 'Upper body'),
  ('lower-body-3-quads', 'lower-body-3', 3, 'Quads and glutes'),
  ('lower-body-4-glutes', 'lower-body-4', 1, 'Glutes and hamstrings'),
  ('lower-body-4-upper', 'lower-body-4', 2, 'Upper body'),
  ('lower-body-4-quads', 'lower-body-4', 3, 'Quads and glutes'),
  ('lower-body-4-glute-focus', 'lower-body-4', 4, 'Glute focus')
on conflict (id) do update set
  programme_id = excluded.programme_id,
  day_number = excluded.day_number,
  name = excluded.name;

-- The exercise slots are owned by this file, so replace them all each run.
delete from public.programme_exercises;

insert into public.programme_exercises
  (programme_day_id, position, sets, rep_min, rep_max, full_gym_exercise_id, dumbbells_exercise_id, home_exercise_id)
values
  -- Full body, 2 days
  ('full-body-2-a', 1, 3, 10, 12, 'leg-press', 'goblet-squat', 'banded-squat'),
  ('full-body-2-a', 2, 3, 8, 12, 'machine-chest-press', 'dumbbell-bench-press', 'incline-push-up'),
  ('full-body-2-a', 3, 3, 10, 12, 'lat-pulldown', 'one-arm-dumbbell-row', 'band-row'),
  ('full-body-2-a', 4, 3, 10, 12, 'hip-thrust-machine', 'dumbbell-hip-thrust', 'banded-glute-bridge'),
  ('full-body-2-a', 5, 2, 10, 12, 'cable-pallof-press', 'dead-bug', 'dead-bug'),
  ('full-body-2-b', 1, 3, 10, 12, 'dumbbell-romanian-deadlift', 'dumbbell-romanian-deadlift', 'banded-hamstring-curl'),
  ('full-body-2-b', 2, 3, 8, 12, 'dumbbell-reverse-lunge', 'dumbbell-reverse-lunge', 'bodyweight-reverse-lunge'),
  ('full-body-2-b', 3, 3, 10, 12, 'machine-shoulder-press', 'dumbbell-shoulder-press', 'band-shoulder-press'),
  ('full-body-2-b', 4, 3, 10, 12, 'seated-cable-row', 'one-arm-dumbbell-row', 'band-row'),
  ('full-body-2-b', 5, 2, 12, 15, 'hip-abduction-machine', 'frog-pump', 'banded-lateral-walk'),

  -- Full body, 3 days
  ('full-body-3-a', 1, 3, 10, 12, 'leg-press', 'goblet-squat', 'banded-squat'),
  ('full-body-3-a', 2, 3, 8, 12, 'machine-chest-press', 'dumbbell-bench-press', 'incline-push-up'),
  ('full-body-3-a', 3, 3, 10, 12, 'lat-pulldown', 'one-arm-dumbbell-row', 'band-row'),
  ('full-body-3-a', 4, 3, 10, 12, 'hip-thrust-machine', 'dumbbell-hip-thrust', 'banded-glute-bridge'),
  ('full-body-3-a', 5, 2, 10, 12, 'cable-pallof-press', 'dead-bug', 'dead-bug'),
  ('full-body-3-b', 1, 3, 10, 12, 'dumbbell-romanian-deadlift', 'dumbbell-romanian-deadlift', 'banded-hamstring-curl'),
  ('full-body-3-b', 2, 3, 8, 12, 'dumbbell-reverse-lunge', 'dumbbell-reverse-lunge', 'bodyweight-reverse-lunge'),
  ('full-body-3-b', 3, 3, 10, 12, 'machine-shoulder-press', 'dumbbell-shoulder-press', 'band-shoulder-press'),
  ('full-body-3-b', 4, 3, 10, 12, 'seated-cable-row', 'one-arm-dumbbell-row', 'band-row'),
  ('full-body-3-b', 5, 2, 12, 15, 'hip-abduction-machine', 'frog-pump', 'banded-lateral-walk'),
  ('full-body-3-c', 1, 3, 10, 12, 'goblet-squat', 'goblet-squat', 'bodyweight-split-squat'),
  ('full-body-3-c', 2, 3, 8, 12, 'incline-dumbbell-press', 'incline-dumbbell-press', 'knee-push-up'),
  ('full-body-3-c', 3, 3, 8, 12, 'assisted-pull-up', 'one-arm-dumbbell-row', 'band-lat-pulldown'),
  ('full-body-3-c', 4, 3, 10, 12, 'lying-leg-curl', 'dumbbell-romanian-deadlift', 'sliding-leg-curl'),
  ('full-body-3-c', 5, 2, 12, 15, 'dumbbell-lateral-raise', 'dumbbell-lateral-raise', 'band-lateral-raise'),

  -- Upper/lower, 4 days
  ('upper-lower-4-upper-a', 1, 3, 6, 10, 'barbell-bench-press', 'dumbbell-bench-press', 'push-up'),
  ('upper-lower-4-upper-a', 2, 3, 8, 12, 'lat-pulldown', 'one-arm-dumbbell-row', 'band-lat-pulldown'),
  ('upper-lower-4-upper-a', 3, 3, 8, 12, 'dumbbell-shoulder-press', 'dumbbell-shoulder-press', 'band-shoulder-press'),
  ('upper-lower-4-upper-a', 4, 2, 12, 15, 'cable-face-pull', 'rear-delt-fly', 'band-pull-apart'),
  ('upper-lower-4-upper-a', 5, 2, 10, 15, 'cable-triceps-pushdown', 'overhead-triceps-extension', 'band-triceps-pushdown'),
  ('upper-lower-4-upper-a', 6, 2, 10, 15, 'cable-biceps-curl', 'dumbbell-biceps-curl', 'band-biceps-curl'),
  ('upper-lower-4-lower-a', 1, 3, 6, 10, 'barbell-back-squat', 'goblet-squat', 'banded-squat'),
  ('upper-lower-4-lower-a', 2, 3, 8, 10, 'barbell-romanian-deadlift', 'dumbbell-romanian-deadlift', 'banded-hamstring-curl'),
  ('upper-lower-4-lower-a', 3, 3, 8, 12, 'leg-press', 'bulgarian-split-squat', 'bodyweight-split-squat'),
  ('upper-lower-4-lower-a', 4, 3, 10, 12, 'lying-leg-curl', 'single-leg-romanian-deadlift', 'sliding-leg-curl'),
  ('upper-lower-4-lower-a', 5, 2, 10, 15, 'standing-calf-raise', 'dumbbell-calf-raise', 'single-leg-calf-raise'),
  ('upper-lower-4-upper-b', 1, 3, 8, 12, 'incline-dumbbell-press', 'incline-dumbbell-press', 'push-up'),
  ('upper-lower-4-upper-b', 2, 3, 8, 12, 'seated-cable-row', 'one-arm-dumbbell-row', 'band-row'),
  ('upper-lower-4-upper-b', 3, 3, 8, 12, 'assisted-pull-up', 'dumbbell-pullover', 'band-lat-pulldown'),
  ('upper-lower-4-upper-b', 4, 3, 12, 15, 'dumbbell-lateral-raise', 'dumbbell-lateral-raise', 'band-lateral-raise'),
  ('upper-lower-4-upper-b', 5, 2, 10, 15, 'dumbbell-hammer-curl', 'dumbbell-hammer-curl', 'band-biceps-curl'),
  ('upper-lower-4-upper-b', 6, 2, 10, 15, 'cable-overhead-triceps-extension', 'dumbbell-triceps-kickback', 'close-grip-push-up'),
  ('upper-lower-4-lower-b', 1, 3, 8, 12, 'barbell-hip-thrust', 'dumbbell-hip-thrust', 'banded-hip-thrust'),
  ('upper-lower-4-lower-b', 2, 3, 10, 12, 'leg-press', 'dumbbell-reverse-lunge', 'bodyweight-reverse-lunge'),
  ('upper-lower-4-lower-b', 3, 3, 10, 12, 'seated-leg-curl', 'dumbbell-romanian-deadlift', 'banded-hamstring-curl'),
  ('upper-lower-4-lower-b', 4, 2, 12, 15, 'hip-abduction-machine', 'frog-pump', 'banded-lateral-walk'),
  ('upper-lower-4-lower-b', 5, 2, 10, 12, 'cable-pallof-press', 'dead-bug', 'dead-bug'),

  -- Lower-body focus, 3 days
  ('lower-body-3-glutes', 1, 3, 8, 12, 'barbell-hip-thrust', 'dumbbell-hip-thrust', 'banded-hip-thrust'),
  ('lower-body-3-glutes', 2, 3, 8, 12, 'dumbbell-romanian-deadlift', 'dumbbell-romanian-deadlift', 'banded-hamstring-curl'),
  ('lower-body-3-glutes', 3, 3, 10, 12, 'lying-leg-curl', 'sliding-leg-curl', 'sliding-leg-curl'),
  ('lower-body-3-glutes', 4, 2, 12, 15, 'cable-glute-kickback', 'donkey-kick', 'banded-kickback'),
  ('lower-body-3-glutes', 5, 2, 12, 15, 'hip-abduction-machine', 'fire-hydrant', 'banded-clamshell'),
  ('lower-body-3-upper', 1, 3, 8, 12, 'machine-chest-press', 'dumbbell-bench-press', 'incline-push-up'),
  ('lower-body-3-upper', 2, 3, 10, 12, 'lat-pulldown', 'one-arm-dumbbell-row', 'band-row'),
  ('lower-body-3-upper', 3, 3, 10, 12, 'machine-shoulder-press', 'dumbbell-shoulder-press', 'band-shoulder-press'),
  ('lower-body-3-upper', 4, 3, 10, 12, 'seated-cable-row', 'rear-delt-fly', 'band-pull-apart'),
  ('lower-body-3-upper', 5, 2, 10, 12, 'cable-pallof-press', 'dead-bug', 'dead-bug'),
  ('lower-body-3-quads', 1, 3, 10, 12, 'leg-press', 'goblet-squat', 'banded-squat'),
  ('lower-body-3-quads', 2, 3, 8, 12, 'dumbbell-reverse-lunge', 'dumbbell-reverse-lunge', 'bodyweight-reverse-lunge'),
  ('lower-body-3-quads', 3, 3, 10, 15, 'glute-focused-back-extension', 'dumbbell-sumo-squat', 'frog-pump'),
  ('lower-body-3-quads', 4, 2, 12, 15, 'hip-adduction-machine', 'side-lying-adduction', 'side-lying-adduction'),
  ('lower-body-3-quads', 5, 2, 12, 15, 'standing-calf-raise', 'dumbbell-calf-raise', 'single-leg-calf-raise'),

  -- Lower-body focus, 4 days
  ('lower-body-4-glutes', 1, 3, 8, 12, 'barbell-hip-thrust', 'dumbbell-hip-thrust', 'banded-hip-thrust'),
  ('lower-body-4-glutes', 2, 3, 8, 12, 'dumbbell-romanian-deadlift', 'dumbbell-romanian-deadlift', 'banded-hamstring-curl'),
  ('lower-body-4-glutes', 3, 3, 10, 12, 'lying-leg-curl', 'sliding-leg-curl', 'sliding-leg-curl'),
  ('lower-body-4-glutes', 4, 2, 12, 15, 'cable-glute-kickback', 'donkey-kick', 'banded-kickback'),
  ('lower-body-4-glutes', 5, 2, 12, 15, 'hip-abduction-machine', 'fire-hydrant', 'banded-clamshell'),
  ('lower-body-4-upper', 1, 3, 8, 12, 'machine-chest-press', 'dumbbell-bench-press', 'incline-push-up'),
  ('lower-body-4-upper', 2, 3, 10, 12, 'lat-pulldown', 'one-arm-dumbbell-row', 'band-row'),
  ('lower-body-4-upper', 3, 3, 10, 12, 'machine-shoulder-press', 'dumbbell-shoulder-press', 'band-shoulder-press'),
  ('lower-body-4-upper', 4, 3, 10, 12, 'seated-cable-row', 'rear-delt-fly', 'band-pull-apart'),
  ('lower-body-4-upper', 5, 2, 10, 12, 'cable-pallof-press', 'dead-bug', 'dead-bug'),
  ('lower-body-4-quads', 1, 3, 10, 12, 'leg-press', 'goblet-squat', 'banded-squat'),
  ('lower-body-4-quads', 2, 3, 8, 12, 'dumbbell-reverse-lunge', 'dumbbell-reverse-lunge', 'bodyweight-reverse-lunge'),
  ('lower-body-4-quads', 3, 3, 10, 15, 'glute-focused-back-extension', 'dumbbell-sumo-squat', 'frog-pump'),
  ('lower-body-4-quads', 4, 2, 12, 15, 'hip-adduction-machine', 'side-lying-adduction', 'side-lying-adduction'),
  ('lower-body-4-quads', 5, 2, 12, 15, 'standing-calf-raise', 'dumbbell-calf-raise', 'single-leg-calf-raise'),
  ('lower-body-4-glute-focus', 1, 3, 10, 12, 'hip-thrust-machine', 'dumbbell-hip-thrust', 'banded-glute-bridge'),
  ('lower-body-4-glute-focus', 2, 3, 10, 12, 'cable-pull-through', 'dumbbell-romanian-deadlift', 'single-leg-glute-bridge'),
  ('lower-body-4-glute-focus', 3, 3, 10, 12, 'dumbbell-sumo-squat', 'dumbbell-sumo-squat', 'banded-squat'),
  ('lower-body-4-glute-focus', 4, 3, 10, 12, 'seated-cable-row', 'one-arm-dumbbell-row', 'band-row'),
  ('lower-body-4-glute-focus', 5, 2, 12, 15, 'cable-hip-abduction', 'fire-hydrant', 'banded-lateral-walk');

-- Assignment ---------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_programme_id_fkey;
alter table public.profiles add constraint profiles_programme_id_fkey
  foreign key (programme_id) references public.programmes (id) on delete set null;

-- Picks a programme from the quiz answers. Keep in step with the rules listed in PROGRESS.md.
--   1-2 days                      -> Full body, 2 days (1 day: one session a week, alternating)
--   Glutes and legs, 3 days       -> Lower-body focus, 3 days
--   Glutes and legs, 4-6 days     -> Lower-body focus, 4 days
--   New to lifting, or 3 days     -> Full body, 3 days
--   Otherwise (4-6 days)          -> Upper/lower, 4 days
create or replace function public.programme_for_answers(goal text, experience text, days_per_week smallint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when goal is null or experience is null or days_per_week is null then null
    when days_per_week <= 2 then 'full-body-2'
    when goal = 'glutes_legs' and days_per_week = 3 then 'lower-body-3'
    when goal = 'glutes_legs' then 'lower-body-4'
    when experience = 'new' or days_per_week = 3 then 'full-body-3'
    else 'upper-lower-4'
  end;
$$;

create or replace function public.assign_programme()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.programme_id := public.programme_for_answers(new.goal, new.experience, new.days_per_week);
  return new;
end;
$$;

drop trigger if exists on_profile_answers_changed on public.profiles;
create trigger on_profile_answers_changed
  before insert or update of goal, experience, days_per_week on public.profiles
  for each row execute function public.assign_programme();

-- Assign programmes to anyone who has already done the quiz.
update public.profiles
set programme_id = public.programme_for_answers(goal, experience, days_per_week);
