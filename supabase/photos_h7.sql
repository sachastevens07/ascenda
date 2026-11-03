-- v2.2 H7: progress photos off by default.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets, photo files or other profile fields.

alter table public.profiles
  add column if not exists photos_enabled boolean;

update public.profiles
set photos_enabled = false
where photos_enabled is null;

alter table public.profiles
  alter column photos_enabled set default false;
