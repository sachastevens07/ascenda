-- W8 Just log it: allow "Other cardio" on cardio_logs.machine_id.
-- Run after supabase/cardio_w2.sql (already pasted).
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets or cardio_logs.

alter table public.cardio_logs drop constraint if exists cardio_logs_machine_check;
alter table public.cardio_logs add constraint cardio_logs_machine_check check (
  machine_id in (
    'treadmill',
    'bike',
    'cross_trainer',
    'rower',
    'stair_climber',
    'mixed',
    'other'
  )
);
