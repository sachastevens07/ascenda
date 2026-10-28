-- v2.0 R9: Onboarding overhaul — extra profile answers.
-- Run after supabase/activity.sql (streak_goal_weeks is created there too; this file is safe if that one hasn't run).
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: it never deletes sessions, sets, or existing quiz answers.
-- Do not run until the user confirms.

alter table public.profiles add column if not exists main_goal text;
alter table public.profiles add column if not exists training_location text;
alter table public.profiles add column if not exists session_minutes smallint;
alter table public.profiles add column if not exists focus_areas text[];
alter table public.profiles add column if not exists gym_comfort smallint;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists streak_goal_weeks smallint;

-- Existing users keep their old answers. New columns are filled from matching fields.
update public.profiles
set main_goal = goal
where main_goal is null and goal is not null;

update public.profiles
set gym_comfort = confidence
where gym_comfort is null and confidence is not null;

update public.profiles
set training_location = case equipment
  when 'full_gym' then 'gym'
  when 'home' then 'home'
  when 'dumbbells' then 'both'
  else null
end
where training_location is null and equipment is not null;

update public.profiles
set session_minutes = 45
where session_minutes is null and onboarding_completed_at is not null;

update public.profiles
set focus_areas = case goal
  when 'glutes_legs' then array['glutes', 'legs']
  else array['full_body']
end
where focus_areas is null and onboarding_completed_at is not null;

update public.profiles
set streak_goal_weeks = 8
where streak_goal_weeks is null;

alter table public.profiles alter column streak_goal_weeks set default 8;

alter table public.profiles drop constraint if exists profiles_main_goal_check;
alter table public.profiles add constraint profiles_main_goal_check check (
  main_goal is null or main_goal in ('strength', 'glutes_legs', 'general')
);

alter table public.profiles drop constraint if exists profiles_training_location_check;
alter table public.profiles add constraint profiles_training_location_check check (
  training_location is null or training_location in ('gym', 'home', 'both')
);

alter table public.profiles drop constraint if exists profiles_session_minutes_check;
alter table public.profiles add constraint profiles_session_minutes_check check (
  session_minutes is null or session_minutes in (30, 45, 60)
);

alter table public.profiles drop constraint if exists profiles_focus_areas_check;
alter table public.profiles add constraint profiles_focus_areas_check check (
  focus_areas is null
  or focus_areas <@ array['glutes', 'legs', 'upper', 'core', 'full_body']::text[]
);

alter table public.profiles drop constraint if exists profiles_gym_comfort_check;
alter table public.profiles add constraint profiles_gym_comfort_check check (
  gym_comfort is null or gym_comfort between 1 and 5
);

alter table public.profiles drop constraint if exists profiles_display_name_check;
alter table public.profiles add constraint profiles_display_name_check check (
  display_name is null or char_length(btrim(display_name)) between 1 and 40
);

alter table public.profiles drop constraint if exists profiles_streak_goal_weeks_check;
alter table public.profiles add constraint profiles_streak_goal_weeks_check check (
  streak_goal_weeks is null or streak_goal_weeks in (4, 8, 12)
);
