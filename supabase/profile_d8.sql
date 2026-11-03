-- v2.2 D8: units and rest-timer default on the profile.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets or other profile fields.

alter table public.profiles
  add column if not exists weight_unit text;

update public.profiles
set weight_unit = 'kg'
where weight_unit is null;

alter table public.profiles
  alter column weight_unit set default 'kg';

alter table public.profiles
  alter column weight_unit set not null;

alter table public.profiles drop constraint if exists profiles_weight_unit_check;
alter table public.profiles add constraint profiles_weight_unit_check
  check (weight_unit in ('kg', 'lbs'));

alter table public.profiles
  add column if not exists rest_timer_seconds smallint;

update public.profiles
set rest_timer_seconds = 90
where rest_timer_seconds is null;

alter table public.profiles
  alter column rest_timer_seconds set default 90;

alter table public.profiles
  alter column rest_timer_seconds set not null;

alter table public.profiles drop constraint if exists profiles_rest_timer_seconds_check;
alter table public.profiles add constraint profiles_rest_timer_seconds_check
  check (rest_timer_seconds in (60, 90, 120));
