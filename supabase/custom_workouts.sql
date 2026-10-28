-- v1.2 P1: saved custom workouts, plus a shared beginner starter.
-- Run after supabase/exercises.sql and sessions.sql.
-- Paste the whole file into Supabase > SQL Editor and click Run. Safe to run again.
-- Does not drop or rewrite anyone's sessions or sets.
-- Keep columns in step with src/lib/customWorkouts.ts (added after this file is approved).

-- 1. Workouts she builds and saves. user_id is null only on the shared starter.
create table if not exists public.custom_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  is_starter boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.custom_workouts drop constraint if exists custom_workouts_name_check;
alter table public.custom_workouts add constraint custom_workouts_name_check check (
  char_length(trim(name)) between 1 and 60
);
-- One shared starter (user_id null). Everyone else's rows belong to them.
alter table public.custom_workouts drop constraint if exists custom_workouts_owner_check;
alter table public.custom_workouts add constraint custom_workouts_owner_check check (
  (is_starter and user_id is null) or (not is_starter and user_id is not null)
);

create unique index if not exists custom_workouts_one_starter_idx
  on public.custom_workouts (is_starter)
  where is_starter;
create index if not exists custom_workouts_user_updated_idx
  on public.custom_workouts (user_id, updated_at desc);

create or replace function public.touch_custom_workout_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_custom_workout_updated on public.custom_workouts;
create trigger on_custom_workout_updated
  before update on public.custom_workouts
  for each row execute function public.touch_custom_workout_updated_at();

-- 2. Slots in a saved workout. `position` is the brief's `order` (reserved word in SQL;
-- same name as programme_exercises.position, which swaps already use).
create table if not exists public.custom_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  custom_workout_id uuid not null references public.custom_workouts (id) on delete cascade,
  exercise_id text not null references public.exercises (id),
  position smallint not null,
  sets smallint not null,
  rep_min smallint not null,
  rep_max smallint not null
);

alter table public.custom_workout_exercises drop constraint if exists custom_workout_exercises_position_check;
alter table public.custom_workout_exercises add constraint custom_workout_exercises_position_check check (
  position >= 1
);
alter table public.custom_workout_exercises drop constraint if exists custom_workout_exercises_sets_check;
alter table public.custom_workout_exercises add constraint custom_workout_exercises_sets_check check (
  sets between 1 and 6
);
alter table public.custom_workout_exercises drop constraint if exists custom_workout_exercises_reps_check;
alter table public.custom_workout_exercises add constraint custom_workout_exercises_reps_check check (
  rep_min between 1 and 30 and rep_max >= rep_min and rep_max <= 30
);

create unique index if not exists custom_workout_exercises_workout_position_idx
  on public.custom_workout_exercises (custom_workout_id, position);

-- 3. Sessions can come from a programme day or a saved workout.
-- block_id is P2 (needs the blocks table) — not added here.
alter table public.sessions alter column programme_day_id drop not null;
alter table public.sessions add column if not exists source text;
alter table public.sessions add column if not exists custom_workout_id uuid
  references public.custom_workouts (id) on delete set null;

update public.sessions
set source = 'programme'
where source is null;

alter table public.sessions alter column source set default 'programme';
alter table public.sessions alter column source set not null;

alter table public.sessions drop constraint if exists sessions_source_check;
alter table public.sessions add constraint sessions_source_check check (
  source in ('programme', 'custom', 'ai')
);

create index if not exists sessions_custom_workout_idx
  on public.sessions (custom_workout_id)
  where custom_workout_id is not null;

-- 4. RLS. She can read her own workouts and the shared starter.
-- She can only insert/update/delete her own (never the starter).
alter table public.custom_workouts enable row level security;
alter table public.custom_workout_exercises enable row level security;

drop policy if exists "Users can read their workouts and the starter" on public.custom_workouts;
create policy "Users can read their workouts and the starter" on public.custom_workouts
  for select to authenticated using (
    user_id = (select auth.uid()) or is_starter
  );
drop policy if exists "Users can create their own workouts" on public.custom_workouts;
create policy "Users can create their own workouts" on public.custom_workouts
  for insert to authenticated with check (
    user_id = (select auth.uid()) and not is_starter
  );
drop policy if exists "Users can update their own workouts" on public.custom_workouts;
create policy "Users can update their own workouts" on public.custom_workouts
  for update to authenticated
  using (user_id = (select auth.uid()) and not is_starter)
  with check (user_id = (select auth.uid()) and not is_starter);
drop policy if exists "Users can delete their own workouts" on public.custom_workouts;
create policy "Users can delete their own workouts" on public.custom_workouts
  for delete to authenticated using (
    user_id = (select auth.uid()) and not is_starter
  );

drop policy if exists "Users can read workout exercises they can see" on public.custom_workout_exercises;
create policy "Users can read workout exercises they can see" on public.custom_workout_exercises
  for select to authenticated using (
    exists (
      select 1 from public.custom_workouts w
      where w.id = custom_workout_id
        and (w.user_id = (select auth.uid()) or w.is_starter)
    )
  );
drop policy if exists "Users can add exercises to their workouts" on public.custom_workout_exercises;
create policy "Users can add exercises to their workouts" on public.custom_workout_exercises
  for insert to authenticated with check (
    exists (
      select 1 from public.custom_workouts w
      where w.id = custom_workout_id
        and w.user_id = (select auth.uid())
        and not w.is_starter
    )
  );
drop policy if exists "Users can update exercises on their workouts" on public.custom_workout_exercises;
create policy "Users can update exercises on their workouts" on public.custom_workout_exercises
  for update to authenticated
  using (
    exists (
      select 1 from public.custom_workouts w
      where w.id = custom_workout_id
        and w.user_id = (select auth.uid())
        and not w.is_starter
    )
  )
  with check (
    exists (
      select 1 from public.custom_workouts w
      where w.id = custom_workout_id
        and w.user_id = (select auth.uid())
        and not w.is_starter
    )
  );
drop policy if exists "Users can delete exercises from their workouts" on public.custom_workout_exercises;
create policy "Users can delete exercises from their workouts" on public.custom_workout_exercises
  for delete to authenticated using (
    exists (
      select 1 from public.custom_workouts w
      where w.id = custom_workout_id
        and w.user_id = (select auth.uid())
        and not w.is_starter
    )
  );

grant select, insert, update, delete on public.custom_workouts, public.custom_workout_exercises to authenticated;

-- 5. Shared starter: Level 1 / Quiet Mode, one spot, dumbbells + a mat.
-- Fixed id so the app can recognise it. Re-running replaces the name and slots only.
insert into public.custom_workouts (id, user_id, name, is_starter) values
  ('11111111-1111-4111-8111-111111111111', null, 'Starter · one quiet spot', true)
on conflict (id) do update set
  name = excluded.name,
  is_starter = true,
  user_id = null;

delete from public.custom_workout_exercises
where custom_workout_id = '11111111-1111-4111-8111-111111111111';

insert into public.custom_workout_exercises (
  custom_workout_id, exercise_id, position, sets, rep_min, rep_max
) values
  ('11111111-1111-4111-8111-111111111111', 'goblet-squat', 1, 3, 8, 12),
  ('11111111-1111-4111-8111-111111111111', 'glute-bridge', 2, 3, 10, 15),
  ('11111111-1111-4111-8111-111111111111', 'dumbbell-romanian-deadlift', 3, 3, 8, 12),
  ('11111111-1111-4111-8111-111111111111', 'dumbbell-floor-press', 4, 3, 8, 12),
  ('11111111-1111-4111-8111-111111111111', 'one-arm-dumbbell-row', 5, 3, 8, 12),
  ('11111111-1111-4111-8111-111111111111', 'dead-bug', 6, 2, 8, 12);
