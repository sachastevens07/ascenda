-- v2.2 H6: hide achievements.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets or other profile fields.

alter table public.profiles
  add column if not exists hide_achievements boolean;

update public.profiles
set hide_achievements = false
where hide_achievements is null;

alter table public.profiles
  alter column hide_achievements set default false;
