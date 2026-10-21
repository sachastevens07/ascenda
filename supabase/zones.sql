-- v1.1 C1: gym zone per exercise (1 Corner, 2 Dumbbell area, 3 Machines, 4 Barbell and squat rack).
-- Run after exercises.sql. Paste into Supabase > SQL Editor and click Run. Safe to run again.
-- Allowed values: keep in step with ZONES in src/lib/exercises.ts.

alter table public.exercises add column if not exists zone smallint;

-- Default zone from equipment. Used for existing rows and for any exercise added later without a zone.
create or replace function public.zone_for_equipment(equipment text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case equipment
    when 'cable' then 2
    when 'machine' then 3
    when 'barbell' then 4
    else 1 -- dumbbell, bodyweight, band, kettlebell
  end::smallint;
$$;

create or replace function public.set_exercise_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.zone is null then
    new.zone := public.zone_for_equipment(new.equipment);
  end if;
  return new;
end;
$$;

drop trigger if exists set_exercise_zone on public.exercises;
create trigger set_exercise_zone
  before insert on public.exercises
  for each row execute function public.set_exercise_zone();

-- Existing exercises: zone from equipment, then the exceptions.
update public.exercises set zone = public.zone_for_equipment(equipment);

-- Need a walkway or plenty of space, an anchor point on a rack, a back-extension bench,
-- or fixed-weight bars from the bar rack.
update public.exercises set zone = 2 where id in (
  'dumbbell-walking-lunge', 'kettlebell-swing', 'kettlebell-suitcase-carry', 'kettlebell-farmers-carry',
  'turkish-get-up', 'banded-hamstring-curl', 'band-row', 'band-lat-pulldown', 'band-triceps-pushdown',
  'band-pallof-press', 'back-extension', 'glute-focused-back-extension', 'barbell-biceps-curl',
  'ez-bar-curl', 'ez-bar-skull-crusher'
);
-- Need the pull-up frame, dip station, captain's chair or a Nordic bench.
update public.exercises set zone = 3 where id in (
  'pull-up', 'chin-up', 'chest-dip', 'hanging-knee-raise', 'nordic-curl'
);
-- Needs a bar set in a squat rack.
update public.exercises set zone = 4 where id = 'inverted-row';

alter table public.exercises alter column zone set not null;
alter table public.exercises drop constraint if exists exercises_zone_check;
alter table public.exercises add constraint exercises_zone_check check (zone between 1 and 4);
