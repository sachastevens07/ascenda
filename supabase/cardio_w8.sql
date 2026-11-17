-- W8: build your own cardio and Just log it.
-- Run after supabase/custom_workouts.sql and supabase/cardio_w2.sql.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets, enrolments or custom_workout_exercises.
-- Does not change RLS on custom_workouts or sessions.
-- Do not run until the user confirms.

-- 1. Strength vs cardio on saved workouts. Existing rows become strength.

alter table public.custom_workouts
  add column if not exists type text;

update public.custom_workouts
set type = 'strength'
where type is null;

alter table public.custom_workouts
  alter column type set default 'strength';

alter table public.custom_workouts
  alter column type set not null;

alter table public.custom_workouts drop constraint if exists custom_workouts_type_check;
alter table public.custom_workouts add constraint custom_workouts_type_check check (
  type in ('strength', 'cardio')
);

-- 2. Built cardio session, same shape as a row in content/cardio/cardio-sessions.json.
--    Required when type is cardio. Strength rows stay null.

alter table public.custom_workouts
  add column if not exists cardio_plan jsonb;

alter table public.custom_workouts drop constraint if exists custom_workouts_cardio_plan_object;
alter table public.custom_workouts add constraint custom_workouts_cardio_plan_object check (
  cardio_plan is null or jsonb_typeof(cardio_plan) = 'object'
);

alter table public.custom_workouts drop constraint if exists custom_workouts_cardio_plan_check;
alter table public.custom_workouts add constraint custom_workouts_cardio_plan_check check (
  (type = 'strength' and cardio_plan is null)
  or (type = 'cardio' and cardio_plan is not null)
);

-- 3. Just log it: cardio done without the player. Existing sessions stay false.

alter table public.sessions
  add column if not exists logged_after boolean;

update public.sessions
set logged_after = false
where logged_after is null;

alter table public.sessions
  alter column logged_after set default false;

alter table public.sessions
  alter column logged_after set not null;
