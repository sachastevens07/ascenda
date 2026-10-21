-- Optional cycle notes: a cycle phase she can add to a session, off by default.
-- Run supabase/profiles.sql and sessions.sql first.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: it never deletes anyone's notes.

-- Null means no note. Keep this list in step with src/lib/cycle.ts.
alter table public.sessions add column if not exists cycle_phase text;
alter table public.sessions drop constraint if exists sessions_cycle_phase_check;
alter table public.sessions add constraint sessions_cycle_phase_check check (
  cycle_phase in ('period', 'after_period', 'mid_cycle', 'before_period', 'not_sure')
);

-- When she last agreed to cycle notes; cleared when she turns them off.
alter table public.profiles add column if not exists cycle_consent_at timestamptz;

create or replace function public.record_cycle_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cycle_tracking_enabled and not coalesce(old.cycle_tracking_enabled, false) then
    new.cycle_consent_at = now();
  elsif not new.cycle_tracking_enabled then
    new.cycle_consent_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists on_cycle_tracking_changed on public.profiles;
create trigger on_cycle_tracking_changed
  before update of cycle_tracking_enabled on public.profiles
  for each row execute function public.record_cycle_consent();

-- Row level security on sessions (sessions.sql) already keeps every note private to its owner.
