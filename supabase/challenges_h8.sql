-- v2.2 H8: rolling challenge starts (Monday or the 1st of the month).
-- Paste into Supabase > SQL Editor and click Run.
-- Needs supabase/paths.sql first (challenges tables).
-- Safe to run again. Never deletes sessions, sets, or challenge joins.

alter table public.challenge_participants
  add column if not exists start_date date;

alter table public.challenge_participants
  add column if not exists end_date date;

update public.challenge_participants as p
set
  start_date = c.start_date,
  end_date = c.end_date
from public.challenges as c
where p.challenge_id = c.id
  and p.start_date is null
  and p.end_date is null;

alter table public.challenge_participants
  drop constraint if exists challenge_participants_window_check;

alter table public.challenge_participants
  add constraint challenge_participants_window_check check (
    start_date is null
    or end_date is null
    or end_date >= start_date
  );

-- Keep the catalogue rows. Copy no longer ties them to one calendar.
update public.challenges
set description = 'Four weeks of Gym Confidence, starting in a one-spot dumbbell corner. Start on any Monday or the 1st of the month. No leaderboard.'
where id = 'challenge-quiet-nov';

update public.challenges
set description = 'A calm four-week reset with Gym Confidence. Start on any Monday or the 1st of the month. No leaderboard.'
where id = 'challenge-new-year';
