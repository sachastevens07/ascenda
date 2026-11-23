-- 00 Catch-up: profile columns from onboarding_v2.sql (R9), which was never run.
-- Adds empty columns only. Changes no existing data. Never touches sessions or sets.
-- Run this first, then 01_main_goals.sql.
alter table public.profiles add column if not exists goal text;
alter table public.profiles add column if not exists main_goal text;
alter table public.profiles add column if not exists training_location text;
alter table public.profiles add column if not exists session_minutes smallint;
alter table public.profiles add column if not exists focus_areas text[];
alter table public.profiles add column if not exists gym_comfort smallint;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists streak_goal_weeks smallint;
