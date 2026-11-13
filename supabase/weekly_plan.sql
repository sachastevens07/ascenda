-- Gym days, variety and tags (11 Nov 2026).
-- Adds weekly_plan jsonb so a later content load can store the week shape.
-- The app already reads weekly_plan from bundled /content, so this column is optional.
-- Safe to paste. Does not touch sessions, sets, enrolments or profiles.
-- Do not run until Sacha confirms.

alter table public.routines
  add column if not exists weekly_plan jsonb;

comment on column public.routines.weekly_plan is
  'Strength days, finishers by cardio preference, spare-day cardio and anytime extras. Overlay from /content is the source of truth until content_routines SQL is pasted.';
