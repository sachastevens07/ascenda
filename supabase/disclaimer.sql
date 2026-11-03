-- v2.2 N1: Safety disclaimer acceptance.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Does not touch sessions, sets or other profile fields.

alter table public.profiles
  add column if not exists disclaimer_version integer,
  add column if not exists disclaimer_accepted_at timestamptz;
