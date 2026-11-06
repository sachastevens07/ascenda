-- v2.2 N4: up to three goals from content/onboarding/onboarding.json.
-- First in the array is her main goal.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Does not touch sessions, sets or other profile fields.
-- Keeps profiles.goal and profiles.main_goal so older queries still work.
-- Copies existing main_goal / goal values into main_goals, then maps old ids
-- onto the content values (build_strength, glutes_and_legs, lose_body_fat, ...).

alter table public.profiles
  add column if not exists main_goals text[];

update public.profiles
set main_goals = array[coalesce(main_goal, goal)]
where (main_goals is null or cardinality(main_goals) = 0)
  and coalesce(main_goal, goal) is not null;

update public.profiles
set goal = case goal
  when 'strength' then 'build_strength'
  when 'muscle' then 'build_muscle'
  when 'glutes_legs' then 'glutes_and_legs'
  when 'upper_body' then 'upper_body_strength'
  when 'toned' then 'feel_toned'
  when 'stamina' then 'fitness_stamina'
  when 'general' then 'fitness_stamina'
  when 'posture' then 'better_posture'
  when 'energy' then 'more_energy'
  when 'wellbeing' then 'stress_relief'
  when 'longevity' then 'strong_for_life'
  when 'return' then 'back_to_training'
  when 'lose_fat' then 'lose_body_fat'
  else goal
end
where goal is not null;

update public.profiles
set main_goal = case main_goal
  when 'strength' then 'build_strength'
  when 'muscle' then 'build_muscle'
  when 'glutes_legs' then 'glutes_and_legs'
  when 'upper_body' then 'upper_body_strength'
  when 'toned' then 'feel_toned'
  when 'stamina' then 'fitness_stamina'
  when 'general' then 'fitness_stamina'
  when 'posture' then 'better_posture'
  when 'energy' then 'more_energy'
  when 'wellbeing' then 'stress_relief'
  when 'longevity' then 'strong_for_life'
  when 'return' then 'back_to_training'
  when 'lose_fat' then 'lose_body_fat'
  else main_goal
end
where main_goal is not null;

update public.profiles as p
set main_goals = mapped.ids[1:3]
from (
  select
    user_id,
    array_agg(
      case g
        when 'strength' then 'build_strength'
        when 'muscle' then 'build_muscle'
        when 'glutes_legs' then 'glutes_and_legs'
        when 'upper_body' then 'upper_body_strength'
        when 'toned' then 'feel_toned'
        when 'stamina' then 'fitness_stamina'
        when 'general' then 'fitness_stamina'
        when 'posture' then 'better_posture'
        when 'energy' then 'more_energy'
        when 'wellbeing' then 'stress_relief'
        when 'longevity' then 'strong_for_life'
        when 'return' then 'back_to_training'
        when 'lose_fat' then 'lose_body_fat'
        else g
      end
      order by ord
    ) as ids
  from public.profiles,
  lateral unnest(main_goals) with ordinality as u(g, ord)
  where main_goals is not null
  group by user_id
) as mapped
where p.user_id = mapped.user_id;

-- New content ids plus the previous N4 / v1 ids so unread rows still pass.
alter table public.profiles drop constraint if exists profiles_goal_check;
alter table public.profiles add constraint profiles_goal_check check (
  goal is null or goal in (
    'build_strength',
    'build_muscle',
    'glutes_and_legs',
    'upper_body_strength',
    'feel_toned',
    'gym_confidence',
    'fitness_stamina',
    'mobility',
    'better_posture',
    'more_energy',
    'stress_relief',
    'strong_for_life',
    'back_to_training',
    'lose_body_fat',
    'strength',
    'muscle',
    'glutes_legs',
    'upper_body',
    'toned',
    'stamina',
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
    'build_strength',
    'build_muscle',
    'glutes_and_legs',
    'upper_body_strength',
    'feel_toned',
    'gym_confidence',
    'fitness_stamina',
    'mobility',
    'better_posture',
    'more_energy',
    'stress_relief',
    'strong_for_life',
    'back_to_training',
    'lose_body_fat',
    'strength',
    'muscle',
    'glutes_legs',
    'upper_body',
    'toned',
    'stamina',
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
      'build_strength',
      'build_muscle',
      'glutes_and_legs',
      'upper_body_strength',
      'feel_toned',
      'gym_confidence',
      'fitness_stamina',
      'mobility',
      'better_posture',
      'more_energy',
      'stress_relief',
      'strong_for_life',
      'back_to_training',
      'lose_body_fat',
      'strength',
      'muscle',
      'glutes_legs',
      'upper_body',
      'toned',
      'stamina',
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
