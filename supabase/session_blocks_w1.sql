-- v2.3 W1: session types and ordered blocks on each routine day.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets, enrolments, profiles or catalogue rows.
-- Existing days keep the same exercises. The logger still reads routine_day_exercises.
-- Warm-up and cool-down blocks are stored now; the logger UI for them is G2.

-- 1. Day and session type.
alter table public.routine_days add column if not exists type text;
alter table public.routine_days add column if not exists day_key text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'routines' and column_name = 'type'
  ) then
    update public.routine_days d
    set type = 'recovery'
    from public.routine_weeks w
    join public.routines r on r.id = w.routine_id
    where d.routine_week_id = w.id
      and d.type is null
      and r.type = 'stretch';
  end if;
end $$;

update public.routine_days
set type = 'strength'
where type is null;

alter table public.routine_days alter column type set default 'strength';
alter table public.routine_days alter column type set not null;
alter table public.routine_days drop constraint if exists routine_days_type_check;
alter table public.routine_days add constraint routine_days_type_check check (
  type in ('strength', 'cardio', 'recovery')
);

alter table public.sessions add column if not exists type text;

update public.sessions
set type = 'recovery'
where type is null and source = 'stretch';

update public.sessions
set type = 'strength'
where type is null;

alter table public.sessions drop constraint if exists sessions_type_check;
alter table public.sessions add constraint sessions_type_check check (
  type is null or type in ('strength', 'cardio', 'recovery')
);

-- 2. Weekly shape stored for the Planner later (W5, W6). Not used to add extra days yet.
alter table public.routines add column if not exists support_days jsonb;
alter table public.routines add column if not exists weekly_schedule jsonb;

-- 3. Ordered blocks. Cardio columns are here so W2 does not redo this table.
create table if not exists public.routine_day_blocks (
  id text primary key,
  routine_day_id text not null references public.routine_days (id) on delete cascade,
  sort_order smallint not null,
  block_type text not null,
  template_id text,
  steps jsonb not null default '[]'::jsonb,
  cardio_session_id text,
  machine_id text,
  style text,
  duration_minutes smallint,
  max_minutes smallint,
  effort_target smallint,
  settings_guidance jsonb,
  intervals jsonb
);

alter table public.routine_day_blocks drop constraint if exists routine_day_blocks_order_check;
alter table public.routine_day_blocks add constraint routine_day_blocks_order_check check (
  sort_order >= 1
);
alter table public.routine_day_blocks drop constraint if exists routine_day_blocks_type_check;
alter table public.routine_day_blocks add constraint routine_day_blocks_type_check check (
  block_type in ('warmup', 'strength', 'cardio', 'cooldown', 'stretch')
);
alter table public.routine_day_blocks drop constraint if exists routine_day_blocks_style_check;
alter table public.routine_day_blocks add constraint routine_day_blocks_style_check check (
  style is null or style in ('steady', 'intervals', 'finisher')
);
alter table public.routine_day_blocks drop constraint if exists routine_day_blocks_minutes_check;
alter table public.routine_day_blocks add constraint routine_day_blocks_minutes_check check (
  duration_minutes is null or duration_minutes between 1 and 120
);
alter table public.routine_day_blocks drop constraint if exists routine_day_blocks_max_minutes_check;
alter table public.routine_day_blocks add constraint routine_day_blocks_max_minutes_check check (
  max_minutes is null or max_minutes between 1 and 180
);
alter table public.routine_day_blocks drop constraint if exists routine_day_blocks_effort_check;
alter table public.routine_day_blocks add constraint routine_day_blocks_effort_check check (
  effort_target is null or effort_target between 1 and 10
);

create unique index if not exists routine_day_blocks_day_order_idx
  on public.routine_day_blocks (routine_day_id, sort_order);

alter table public.routine_day_exercises add column if not exists block_id text
  references public.routine_day_blocks (id) on delete set null;

create index if not exists routine_day_exercises_block_idx
  on public.routine_day_exercises (block_id)
  where block_id is not null;

-- 4. Backfill existing strength days: warmup, strength, cooldown.
-- Warm-up steps copy routine_days.warmup when N2 has been pasted; otherwise [].
insert into public.routine_day_blocks (id, routine_day_id, sort_order, block_type, steps)
select
  d.id || '-warmup',
  d.id,
  1,
  'warmup',
  case
    when to_jsonb(d) ? 'warmup' and jsonb_typeof(to_jsonb(d) -> 'warmup') = 'array'
      then coalesce(to_jsonb(d) -> 'warmup', '[]'::jsonb)
    else '[]'::jsonb
  end
from public.routine_days d
where d.type = 'strength'
on conflict (id) do nothing;

insert into public.routine_day_blocks (id, routine_day_id, sort_order, block_type, steps)
select d.id || '-strength', d.id, 2, 'strength', '[]'::jsonb
from public.routine_days d
where d.type = 'strength'
on conflict (id) do nothing;

insert into public.routine_day_blocks (id, routine_day_id, sort_order, block_type, steps)
select d.id || '-cooldown', d.id, 3, 'cooldown', '[]'::jsonb
from public.routine_days d
where d.type = 'strength'
on conflict (id) do nothing;

-- Stretch / recovery days: one stretch block. Timed holds stay on routine_day_exercises.
insert into public.routine_day_blocks (id, routine_day_id, sort_order, block_type, steps)
select d.id || '-stretch', d.id, 1, 'stretch', '[]'::jsonb
from public.routine_days d
where d.type = 'recovery'
on conflict (id) do nothing;

update public.routine_day_exercises e
set block_id = d.id || '-strength'
from public.routine_days d
where e.routine_day_id = d.id
  and d.type = 'strength'
  and e.block_id is null;

update public.routine_day_exercises e
set block_id = d.id || '-stretch'
from public.routine_days d
where e.routine_day_id = d.id
  and d.type = 'recovery'
  and e.block_id is null;

-- 5. RLS. Catalogue is readable; never grant writes to the app.
alter table public.routine_day_blocks enable row level security;

drop policy if exists "Signed-in users can read routine day blocks" on public.routine_day_blocks;
create policy "Signed-in users can read routine day blocks" on public.routine_day_blocks
  for select to authenticated using (true);

grant select on public.routine_day_blocks to authenticated;
