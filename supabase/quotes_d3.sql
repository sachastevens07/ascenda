-- v2.2 D3: hide the daily quote.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets or other profile fields.
-- The quotes themselves are bundled in the app for now. N7 can add a quotes table later.

alter table public.profiles
  add column if not exists hide_quote boolean;

update public.profiles
set hide_quote = false
where hide_quote is null;

alter table public.profiles
  alter column hide_quote set default false;
