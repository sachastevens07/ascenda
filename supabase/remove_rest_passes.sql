-- v2.1 S5: remove rest-week streak passes.
-- Run after supabase/activity.sql if that file was already pasted.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again. Does not touch sessions, sets, or streak_goal_weeks.
-- Do not run until the user confirms.

alter table public.profiles drop constraint if exists profiles_rest_passes_used_month_check;
alter table public.profiles drop column if exists rest_passes_used_month;
alter table public.profiles drop column if exists rest_passes_month;
