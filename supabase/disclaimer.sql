-- v2.2 N1: Safety disclaimer acceptance. Roadmap step 12.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Does not touch sessions, sets or other profile fields.
-- The app stores profiles.disclaimer_version and disclaimer_accepted_at.
-- If the wording in src/lib/disclaimer.ts changes, bump DISCLAIMER_VERSION
-- so she is asked to accept again.

alter table public.profiles
  add column if not exists disclaimer_version integer,
  add column if not exists disclaimer_accepted_at timestamptz;
