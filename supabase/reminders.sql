-- v2.2 H3: planner-linked session reminders.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets or other profile fields.

-- 1. Profile toggles and the default clock for planned days.
alter table public.profiles
  add column if not exists session_reminders boolean;

alter table public.profiles
  add column if not exists weekly_summary boolean;

alter table public.profiles
  add column if not exists marketing_opt_in boolean;

alter table public.profiles
  add column if not exists default_reminder_time time;

update public.profiles
set session_reminders = false
where session_reminders is null;

update public.profiles
set weekly_summary = false
where weekly_summary is null;

update public.profiles
set marketing_opt_in = false
where marketing_opt_in is null;

update public.profiles
set default_reminder_time = time '18:00'
where default_reminder_time is null;

alter table public.profiles
  alter column session_reminders set default false;

alter table public.profiles
  alter column weekly_summary set default false;

alter table public.profiles
  alter column marketing_opt_in set default false;

alter table public.profiles
  alter column default_reminder_time set default time '18:00';

-- 2. Optional per-day time. Null means use profiles.default_reminder_time.
alter table public.planned_sessions
  add column if not exists reminder_time time;
