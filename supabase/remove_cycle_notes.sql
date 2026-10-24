-- v2.0 R1: remove cycle notes.
-- Deletes cycle-note data and drops the related columns, trigger and function.
-- Does not touch sessions, sets, or any other workout history.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: every statement uses IF EXISTS.

-- 1. Drop the consent trigger and function first (they depend on the profile columns).
drop trigger if exists on_cycle_tracking_changed on public.profiles;
drop function if exists public.record_cycle_consent();

-- 2. Drop the session phase column (this deletes the notes). Workout rows stay.
alter table public.sessions drop constraint if exists sessions_cycle_phase_check;
alter table public.sessions drop column if exists cycle_phase;

-- 3. Drop the profile flags.
alter table public.profiles drop column if exists cycle_consent_at;
alter table public.profiles drop column if exists cycle_tracking_enabled;
