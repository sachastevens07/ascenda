-- v2.3 W5 to W7: store cardio and recovery rows on the planner.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again. It never deletes sessions, sets or workout history.
-- Do not run until you confirm.

alter table public.planned_sessions
  add column if not exists session_kind text;

alter table public.planned_sessions
  add column if not exists cardio_slug text;

alter table public.planned_sessions
  add column if not exists stretch_slug text;

alter table public.planned_sessions
  add column if not exists is_optional boolean not null default false;

update public.planned_sessions
set session_kind = 'strength'
where session_kind is null
  and routine_day_id is not null
  and custom_workout_id is null
  and status <> 'rest';

alter table public.planned_sessions drop constraint if exists planned_sessions_session_kind_check;
alter table public.planned_sessions add constraint planned_sessions_session_kind_check check (
  session_kind is null
  or session_kind in ('strength', 'cardio', 'recovery')
);

alter table public.planned_sessions drop constraint if exists planned_sessions_source_check;
alter table public.planned_sessions add constraint planned_sessions_source_check check (
  (
    status = 'rest'
    and routine_day_id is null
    and custom_workout_id is null
    and cardio_slug is null
    and stretch_slug is null
  )
  or (
    status <> 'rest'
    and (
      (routine_day_id is not null and custom_workout_id is null and cardio_slug is null and stretch_slug is null)
      or (custom_workout_id is not null and routine_day_id is null and cardio_slug is null and stretch_slug is null)
      or (cardio_slug is not null and routine_day_id is null and custom_workout_id is null and stretch_slug is null)
      or (stretch_slug is not null and routine_day_id is null and custom_workout_id is null and cardio_slug is null)
    )
  )
);
