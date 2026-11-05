-- v2.2 content loader: hide catalogue rows that are no longer in /content.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Does not touch sessions, sets, enrolments or profiles.
-- Does not flip any row to false. npm run content:sync does that after you confirm a live run.

alter table public.routines add column if not exists is_active boolean;

update public.routines
set is_active = true
where is_active is null;

alter table public.routines alter column is_active set default true;
alter table public.routines alter column is_active set not null;
