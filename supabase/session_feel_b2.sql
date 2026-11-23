-- B2 v2: optional post-session feel.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions or sets.
--
-- sessions.session_feel is easier / as_expected / harder, or null if she skipped.
-- Never store which check-in option she picked. lighter_session stays a boolean only.

alter table public.sessions
  add column if not exists session_feel text;

alter table public.sessions drop constraint if exists sessions_session_feel_check;
alter table public.sessions add constraint sessions_session_feel_check check (
  session_feel is null or session_feel in ('easier', 'as_expected', 'harder')
);

comment on column public.sessions.session_feel is
  'Optional post-session feel. Two harder in a row on the same routine day holds the next weight increase. Never stores the check-in option.';
