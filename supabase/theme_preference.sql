-- v2.2 N5: Appearance setting. Light is the default for everyone.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Does not touch sessions or sets.

alter table public.profiles
  add column if not exists theme_preference text not null default 'light';

alter table public.profiles drop constraint if exists profiles_theme_preference_check;
alter table public.profiles add constraint profiles_theme_preference_check
  check (theme_preference in ('light', 'dark', 'system'));
