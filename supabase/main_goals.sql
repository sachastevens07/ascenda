-- v2.2 N4: up to three goals. First in the array is her main goal.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Does not touch sessions, sets or other profile fields.
-- Keeps profiles.goal and profiles.main_goal in place so older queries still work.

alter table public.profiles
  add column if not exists main_goals text[];

update public.profiles
set main_goals = array[coalesce(main_goal, goal)]
where main_goals is null
  and coalesce(main_goal, goal) is not null;

-- Old 'general' answers stay readable; new saves use the expanded list.
alter table public.profiles drop constraint if exists profiles_goal_check;
alter table public.profiles add constraint profiles_goal_check check (
  goal is null or goal in (
    'strength',
    'muscle',
    'glutes_legs',
    'upper_body',
    'toned',
    'gym_confidence',
    'stamina',
    'mobility',
    'posture',
    'energy',
    'wellbeing',
    'longevity',
    'return',
    'lose_fat',
    'general'
  )
);

alter table public.profiles drop constraint if exists profiles_main_goal_check;
alter table public.profiles add constraint profiles_main_goal_check check (
  main_goal is null or main_goal in (
    'strength',
    'muscle',
    'glutes_legs',
    'upper_body',
    'toned',
    'gym_confidence',
    'stamina',
    'mobility',
    'posture',
    'energy',
    'wellbeing',
    'longevity',
    'return',
    'lose_fat',
    'general'
  )
);

alter table public.profiles drop constraint if exists profiles_main_goals_check;
alter table public.profiles add constraint profiles_main_goals_check check (
  main_goals is null
  or (
    cardinality(main_goals) between 1 and 3
    and main_goals <@ array[
      'strength',
      'muscle',
      'glutes_legs',
      'upper_body',
      'toned',
      'gym_confidence',
      'stamina',
      'mobility',
      'posture',
      'energy',
      'wellbeing',
      'longevity',
      'return',
      'lose_fat',
      'general'
    ]::text[]
  )
);
