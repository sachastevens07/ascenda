-- v2.2 G1: gym_experience on profiles, and rename the home backup routine.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Does not touch sessions, sets, enrolments or history.
-- Does not drop training_location. The app stops using that field.

alter table public.profiles add column if not exists gym_experience text;

alter table public.profiles drop constraint if exists profiles_gym_experience_check;
alter table public.profiles add constraint profiles_gym_experience_check check (
  gym_experience is null
  or gym_experience in ('not_yet', 'just_started', 'on_and_off', 'regularly')
);

-- Home trainers have not been going to the gym. Gym + lifting experience maps the rest.
update public.profiles
set gym_experience = case
  when training_location = 'home' then 'not_yet'
  when training_location = 'both' then 'on_and_off'
  when training_location = 'gym' and experience = 'new' then 'just_started'
  when training_location = 'gym' and experience = 'confident' then 'regularly'
  when training_location = 'gym' then 'on_and_off'
  when experience = 'new' then 'just_started'
  when experience = 'confident' then 'regularly'
  when experience = 'some' then 'on_and_off'
  else 'just_started'
end
where gym_experience is null
  and onboarding_completed_at is not null;

update public.routines
set name = 'Days you can''t get to the gym'
where id = 'home-strength-6'
   or lower(name) = 'home strength';

update public.routines
set is_featured_eligible = false
where id = 'home-strength-6'
   or equipment = 'home';
