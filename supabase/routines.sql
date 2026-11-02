-- v2.0 R3: routines, cover images, enrolments, and session link columns.
-- Run after supabase/programmes.sql and supabase/sessions.sql.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: it never deletes sessions, sets or enrolments.
-- Do not run until the user confirms.

-- 1. Cover images (R11 fills licensed photos in supabase/routine_covers.sql).
create table if not exists public.images (
  id text primary key,
  url text,
  storage_path text,
  alt_text text not null,
  licence_source text
);

-- 2. Catalogue. source_programme_id keeps converted templates linked to history.
create table if not exists public.routines (
  id text primary key,
  name text not null,
  slug text not null,
  description text not null,
  cover_image_id text references public.images (id) on delete set null,
  goal text not null,
  length_weeks smallint not null,
  days_per_week smallint not null,
  session_minutes smallint not null,
  difficulty text not null,
  equipment text not null,
  is_pro boolean not null default true,
  is_featured_eligible boolean not null default true,
  sort_order smallint not null default 0,
  source_programme_id text references public.programmes (id) on delete set null
);

alter table public.routines drop constraint if exists routines_slug_key;
alter table public.routines add constraint routines_slug_key unique (slug);

alter table public.routines drop constraint if exists routines_goal_check;
alter table public.routines add constraint routines_goal_check check (
  goal in ('strength', 'glutes_legs', 'general', 'confidence')
);
alter table public.routines drop constraint if exists routines_length_weeks_check;
alter table public.routines add constraint routines_length_weeks_check check (
  length_weeks between 1 and 16
);
alter table public.routines drop constraint if exists routines_days_per_week_check;
alter table public.routines add constraint routines_days_per_week_check check (
  days_per_week between 1 and 7
);
alter table public.routines drop constraint if exists routines_session_minutes_check;
alter table public.routines add constraint routines_session_minutes_check check (
  session_minutes between 15 and 120
);
alter table public.routines drop constraint if exists routines_difficulty_check;
alter table public.routines add constraint routines_difficulty_check check (
  difficulty in ('beginner', 'intermediate', 'experienced')
);
alter table public.routines drop constraint if exists routines_equipment_check;
alter table public.routines add constraint routines_equipment_check check (
  equipment in ('full_gym', 'dumbbells', 'home')
);

create table if not exists public.routine_tags (
  routine_id text not null references public.routines (id) on delete cascade,
  tag text not null,
  primary key (routine_id, tag)
);

create table if not exists public.routine_weeks (
  id text primary key,
  routine_id text not null references public.routines (id) on delete cascade,
  week_number smallint not null
);

alter table public.routine_weeks drop constraint if exists routine_weeks_week_check;
alter table public.routine_weeks add constraint routine_weeks_week_check check (
  week_number between 1 and 16
);
create unique index if not exists routine_weeks_routine_week_idx
  on public.routine_weeks (routine_id, week_number);

create table if not exists public.routine_days (
  id text primary key,
  routine_week_id text not null references public.routine_weeks (id) on delete cascade,
  day_number smallint not null,
  name text not null,
  source_programme_day_id text references public.programme_days (id) on delete set null
);

alter table public.routine_days drop constraint if exists routine_days_day_check;
alter table public.routine_days add constraint routine_days_day_check check (
  day_number between 1 and 7
);
create unique index if not exists routine_days_week_day_idx
  on public.routine_days (routine_week_id, day_number);

create table if not exists public.routine_day_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_day_id text not null references public.routine_days (id) on delete cascade,
  position smallint not null,
  exercise_id text not null references public.exercises (id),
  sets smallint not null,
  rep_min smallint not null,
  rep_max smallint not null,
  rest_seconds smallint not null default 90
);

alter table public.routine_day_exercises drop constraint if exists routine_day_exercises_position_check;
alter table public.routine_day_exercises add constraint routine_day_exercises_position_check check (
  position >= 1
);
alter table public.routine_day_exercises drop constraint if exists routine_day_exercises_sets_check;
alter table public.routine_day_exercises add constraint routine_day_exercises_sets_check check (
  sets between 1 and 8
);
alter table public.routine_day_exercises drop constraint if exists routine_day_exercises_reps_check;
alter table public.routine_day_exercises add constraint routine_day_exercises_reps_check check (
  rep_min between 1 and 30 and rep_max >= rep_min and rep_max <= 30
);
alter table public.routine_day_exercises drop constraint if exists routine_day_exercises_rest_check;
alter table public.routine_day_exercises add constraint routine_day_exercises_rest_check check (
  rest_seconds between 0 and 600
);
create unique index if not exists routine_day_exercises_day_position_idx
  on public.routine_day_exercises (routine_day_id, position);

-- 3. One active enrolment per person. Replaces the planned `blocks` idea; blocks stay.
create table if not exists public.routine_enrolments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id text not null references public.routines (id),
  start_date date not null default current_date,
  status text not null default 'active',
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.routine_enrolments drop constraint if exists routine_enrolments_status_check;
alter table public.routine_enrolments add constraint routine_enrolments_status_check check (
  status in ('active', 'complete', 'abandoned')
);
alter table public.routine_enrolments drop constraint if exists routine_enrolments_completed_check;
alter table public.routine_enrolments add constraint routine_enrolments_completed_check check (
  (status = 'complete' and completed_at is not null)
  or (status <> 'complete' and completed_at is null)
);

create unique index if not exists routine_enrolments_one_active_idx
  on public.routine_enrolments (user_id)
  where status = 'active';
create index if not exists routine_enrolments_user_status_idx
  on public.routine_enrolments (user_id, status);

-- 4. Session links for R4. Existing rows stay programme / custom.
alter table public.sessions add column if not exists source text;
update public.sessions set source = 'programme' where source is null;

alter table public.sessions drop constraint if exists sessions_source_check;
alter table public.sessions add constraint sessions_source_check check (
  source in ('programme', 'custom', 'ai', 'routine')
);

alter table public.sessions add column if not exists routine_enrolment_id uuid
  references public.routine_enrolments (id) on delete set null;
alter table public.sessions add column if not exists routine_day_id text
  references public.routine_days (id) on delete set null;
alter table public.sessions add column if not exists duration_seconds integer;

alter table public.sessions drop constraint if exists sessions_duration_seconds_check;
alter table public.sessions add constraint sessions_duration_seconds_check check (
  duration_seconds is null or duration_seconds >= 0
);

create index if not exists sessions_routine_enrolment_idx
  on public.sessions (routine_enrolment_id)
  where routine_enrolment_id is not null;
create index if not exists sessions_routine_day_idx
  on public.sessions (routine_day_id)
  where routine_day_id is not null;

-- 5. Seed the six launch routines. Enrolments are left alone.
insert into public.images (id, url, storage_path, alt_text, licence_source) values
  ('cover-gym-confidence-6', null, null, 'Woman training with dumbbells in one gym spot', null),
  ('cover-full-body-3', null, null, 'Woman finishing a full-body strength session', null),
  ('cover-one-spot-6', null, null, 'Dumbbells on a gym floor, one quiet training spot', null),
  ('cover-busy-gym-6', null, null, 'Woman using a gym machine in a busy gym', null),
  ('cover-upper-lower-4', null, null, 'Woman training upper body with dumbbells', null),
  ('cover-lower-body-3', null, null, 'Woman training glutes and legs', null)
on conflict (id) do update set
  alt_text = excluded.alt_text;

insert into public.routines (
  id, name, slug, description, cover_image_id, goal, length_weeks, days_per_week,
  session_minutes, difficulty, equipment, is_pro, is_featured_eligible, sort_order,
  source_programme_id
) values
  (
    'gym-confidence-6',
    'Gym Confidence: 6 weeks',
    'gym-confidence-6',
    'Start in one dumbbell spot, then add machines, then a couple of simple free-weight lifts. Three sessions a week. Built for a first (or nervous) gym season.',
    'cover-gym-confidence-6',
    'confidence',
    6, 3, 40, 'beginner', 'full_gym', false, true, 1, null
  ),
  (
    'full-body-3',
    'Full body',
    'full-body-3',
    'Three full-body sessions a week. Beginner-friendly, and it works at any level. Eight weeks of the same three days. Go up when you hit the top of the range.',
    'cover-full-body-3',
    'general',
    8, 3, 45, 'beginner', 'full_gym', false, true, 2, 'full-body-3'
  ),
  (
    'one-spot-6',
    'One spot: 6 weeks',
    'one-spot-6',
    'Stay in the dumbbell area for the whole plan. Three full-body sessions a week, no machines or racks. Quiet, simple and easy to repeat.',
    'cover-one-spot-6',
    'general',
    6, 3, 40, 'beginner', 'dumbbells', true, true, 3, null
  ),
  (
    'busy-gym-6',
    'Busy gym: 6 weeks',
    'busy-gym-6',
    'Machine-first sessions for when the free-weight floor is packed. Three days a week, the same plan each week, so you always know where to go.',
    'cover-busy-gym-6',
    'general',
    6, 3, 40, 'beginner', 'full_gym', true, true, 4, null
  ),
  (
    'upper-lower-4',
    'Upper / lower',
    'upper-lower-4',
    'Two upper-body and two lower-body sessions a week, for when you know your way around. Eight weeks of the same four days.',
    'cover-upper-lower-4',
    'strength',
    8, 4, 50, 'intermediate', 'full_gym', true, true, 5, 'upper-lower-4'
  ),
  (
    'lower-body-3',
    'Lower-body focus',
    'lower-body-3',
    'Two glute and leg sessions and one upper-body session a week. Eight weeks of the same three days.',
    'cover-lower-body-3',
    'glutes_legs',
    8, 3, 45, 'intermediate', 'full_gym', true, true, 6, 'lower-body-3'
  )
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  cover_image_id = excluded.cover_image_id,
  goal = excluded.goal,
  length_weeks = excluded.length_weeks,
  days_per_week = excluded.days_per_week,
  session_minutes = excluded.session_minutes,
  difficulty = excluded.difficulty,
  equipment = excluded.equipment,
  is_pro = excluded.is_pro,
  is_featured_eligible = excluded.is_featured_eligible,
  sort_order = excluded.sort_order,
  source_programme_id = excluded.source_programme_id;

delete from public.routine_day_exercises
where routine_day_id in (
  select rd.id
  from public.routine_days rd
  join public.routine_weeks rw on rw.id = rd.routine_week_id
  where rw.routine_id in (
    'gym-confidence-6', 'full-body-3', 'one-spot-6',
    'busy-gym-6', 'upper-lower-4', 'lower-body-3'
  )
);
delete from public.routine_days
where routine_week_id in (
  select id from public.routine_weeks
  where routine_id in (
    'gym-confidence-6', 'full-body-3', 'one-spot-6',
    'busy-gym-6', 'upper-lower-4', 'lower-body-3'
  )
);
delete from public.routine_weeks
where routine_id in (
  'gym-confidence-6', 'full-body-3', 'one-spot-6',
  'busy-gym-6', 'upper-lower-4', 'lower-body-3'
);
delete from public.routine_tags
where routine_id in (
  'gym-confidence-6', 'full-body-3', 'one-spot-6',
  'busy-gym-6', 'upper-lower-4', 'lower-body-3'
);

insert into public.routine_tags (routine_id, tag) values
  ('gym-confidence-6', 'beginner-friendly'),
  ('gym-confidence-6', 'one spot'),
  ('gym-confidence-6', 'full body'),
  ('gym-confidence-6', 'busy gym friendly'),
  ('full-body-3', 'beginner-friendly'),
  ('full-body-3', 'full body'),
  ('full-body-3', 'build muscle'),
  ('one-spot-6', 'one spot'),
  ('one-spot-6', 'beginner-friendly'),
  ('one-spot-6', 'minimal equipment'),
  ('one-spot-6', 'full body'),
  ('one-spot-6', 'busy gym friendly'),
  ('busy-gym-6', 'busy gym friendly'),
  ('busy-gym-6', 'beginner-friendly'),
  ('busy-gym-6', 'full body'),
  ('busy-gym-6', 'build muscle'),
  ('upper-lower-4', 'build muscle'),
  ('upper-lower-4', 'full body'),
  ('lower-body-3', 'glutes & legs'),
  ('lower-body-3', 'build muscle');

-- Gym Confidence: weeks 1 and 2 stay in one dumbbell spot.
insert into public.routine_weeks (id, routine_id, week_number) values
  ('gym-confidence-6-w1', 'gym-confidence-6', 1),
  ('gym-confidence-6-w2', 'gym-confidence-6', 2),
  ('gym-confidence-6-w3', 'gym-confidence-6', 3),
  ('gym-confidence-6-w4', 'gym-confidence-6', 4),
  ('gym-confidence-6-w5', 'gym-confidence-6', 5),
  ('gym-confidence-6-w6', 'gym-confidence-6', 6);

insert into public.routine_days (id, routine_week_id, day_number, name) values
  ('gym-confidence-6-w1-d1', 'gym-confidence-6-w1', 1, 'Full body · one spot A'),
  ('gym-confidence-6-w1-d2', 'gym-confidence-6-w1', 2, 'Full body · one spot B'),
  ('gym-confidence-6-w1-d3', 'gym-confidence-6-w1', 3, 'Full body · one spot C'),
  ('gym-confidence-6-w3-d1', 'gym-confidence-6-w3', 1, 'Full body · machines A'),
  ('gym-confidence-6-w3-d2', 'gym-confidence-6-w3', 2, 'Full body · machines B'),
  ('gym-confidence-6-w3-d3', 'gym-confidence-6-w3', 3, 'Full body · machines C'),
  ('gym-confidence-6-w5-d1', 'gym-confidence-6-w5', 1, 'Full body · free weights A'),
  ('gym-confidence-6-w5-d2', 'gym-confidence-6-w5', 2, 'Full body · free weights B'),
  ('gym-confidence-6-w5-d3', 'gym-confidence-6-w5', 3, 'Full body · free weights C');

insert into public.routine_day_exercises
  (routine_day_id, position, exercise_id, sets, rep_min, rep_max, rest_seconds) values
  -- Weeks 1–2, one-spot dumbbells
  ('gym-confidence-6-w1-d1', 1, 'goblet-squat', 3, 10, 12, 90),
  ('gym-confidence-6-w1-d1', 2, 'dumbbell-bench-press', 3, 8, 12, 90),
  ('gym-confidence-6-w1-d1', 3, 'one-arm-dumbbell-row', 3, 10, 12, 90),
  ('gym-confidence-6-w1-d1', 4, 'dumbbell-hip-thrust', 3, 10, 12, 90),
  ('gym-confidence-6-w1-d1', 5, 'dead-bug', 2, 10, 12, 60),
  ('gym-confidence-6-w1-d2', 1, 'dumbbell-romanian-deadlift', 3, 10, 12, 90),
  ('gym-confidence-6-w1-d2', 2, 'dumbbell-reverse-lunge', 3, 8, 12, 90),
  ('gym-confidence-6-w1-d2', 3, 'dumbbell-shoulder-press', 3, 10, 12, 90),
  ('gym-confidence-6-w1-d2', 4, 'frog-pump', 2, 12, 15, 60),
  ('gym-confidence-6-w1-d2', 5, 'dumbbell-lateral-raise', 2, 12, 15, 60),
  ('gym-confidence-6-w1-d3', 1, 'goblet-squat', 3, 10, 12, 90),
  ('gym-confidence-6-w1-d3', 2, 'incline-dumbbell-press', 3, 8, 12, 90),
  ('gym-confidence-6-w1-d3', 3, 'one-arm-dumbbell-row', 3, 10, 12, 90),
  ('gym-confidence-6-w1-d3', 4, 'glute-bridge', 3, 12, 15, 60),
  ('gym-confidence-6-w1-d3', 5, 'dead-bug', 2, 10, 12, 60),
  -- Weeks 3–4, add machines
  ('gym-confidence-6-w3-d1', 1, 'goblet-squat', 3, 10, 12, 90),
  ('gym-confidence-6-w3-d1', 2, 'machine-chest-press', 3, 8, 12, 90),
  ('gym-confidence-6-w3-d1', 3, 'lat-pulldown', 3, 10, 12, 90),
  ('gym-confidence-6-w3-d1', 4, 'hip-thrust-machine', 3, 10, 12, 90),
  ('gym-confidence-6-w3-d1', 5, 'dead-bug', 2, 10, 12, 60),
  ('gym-confidence-6-w3-d2', 1, 'dumbbell-romanian-deadlift', 3, 10, 12, 90),
  ('gym-confidence-6-w3-d2', 2, 'leg-press', 3, 10, 12, 90),
  ('gym-confidence-6-w3-d2', 3, 'seated-cable-row', 3, 10, 12, 90),
  ('gym-confidence-6-w3-d2', 4, 'machine-shoulder-press', 3, 10, 12, 90),
  ('gym-confidence-6-w3-d2', 5, 'hip-abduction-machine', 2, 12, 15, 60),
  ('gym-confidence-6-w3-d3', 1, 'goblet-squat', 3, 10, 12, 90),
  ('gym-confidence-6-w3-d3', 2, 'machine-chest-press', 3, 8, 12, 90),
  ('gym-confidence-6-w3-d3', 3, 'seated-cable-row', 3, 10, 12, 90),
  ('gym-confidence-6-w3-d3', 4, 'lying-leg-curl', 3, 10, 12, 90),
  ('gym-confidence-6-w3-d3', 5, 'cable-pallof-press', 2, 10, 12, 60),
  -- Weeks 5–6, conservative free-weight basics (no squat rack, no floor deadlift)
  ('gym-confidence-6-w5-d1', 1, 'goblet-squat', 3, 10, 12, 90),
  ('gym-confidence-6-w5-d1', 2, 'dumbbell-bench-press', 3, 8, 12, 90),
  ('gym-confidence-6-w5-d1', 3, 'one-arm-dumbbell-row', 3, 10, 12, 90),
  ('gym-confidence-6-w5-d1', 4, 'barbell-hip-thrust', 3, 8, 12, 90),
  ('gym-confidence-6-w5-d1', 5, 'dead-bug', 2, 10, 12, 60),
  ('gym-confidence-6-w5-d2', 1, 'barbell-romanian-deadlift', 3, 8, 12, 90),
  ('gym-confidence-6-w5-d2', 2, 'dumbbell-reverse-lunge', 3, 8, 12, 90),
  ('gym-confidence-6-w5-d2', 3, 'dumbbell-shoulder-press', 3, 10, 12, 90),
  ('gym-confidence-6-w5-d2', 4, 'frog-pump', 2, 12, 15, 60),
  ('gym-confidence-6-w5-d2', 5, 'dumbbell-lateral-raise', 2, 12, 15, 60),
  ('gym-confidence-6-w5-d3', 1, 'goblet-squat', 3, 10, 12, 90),
  ('gym-confidence-6-w5-d3', 2, 'incline-dumbbell-press', 3, 8, 12, 90),
  ('gym-confidence-6-w5-d3', 3, 'seated-cable-row', 3, 10, 12, 90),
  ('gym-confidence-6-w5-d3', 4, 'barbell-hip-thrust', 3, 8, 12, 90),
  ('gym-confidence-6-w5-d3', 5, 'cable-pallof-press', 2, 10, 12, 60);

insert into public.routine_days (id, routine_week_id, day_number, name)
select replace(id, '-w1-', '-w2-'), 'gym-confidence-6-w2', day_number, name
from public.routine_days where routine_week_id = 'gym-confidence-6-w1';
insert into public.routine_day_exercises
  (routine_day_id, position, exercise_id, sets, rep_min, rep_max, rest_seconds)
select replace(routine_day_id, '-w1-', '-w2-'), position, exercise_id, sets, rep_min, rep_max, rest_seconds
from public.routine_day_exercises where routine_day_id like 'gym-confidence-6-w1-%';

insert into public.routine_days (id, routine_week_id, day_number, name)
select replace(id, '-w3-', '-w4-'), 'gym-confidence-6-w4', day_number, name
from public.routine_days where routine_week_id = 'gym-confidence-6-w3';
insert into public.routine_day_exercises
  (routine_day_id, position, exercise_id, sets, rep_min, rep_max, rest_seconds)
select replace(routine_day_id, '-w3-', '-w4-'), position, exercise_id, sets, rep_min, rep_max, rest_seconds
from public.routine_day_exercises where routine_day_id like 'gym-confidence-6-w3-%';

insert into public.routine_days (id, routine_week_id, day_number, name)
select replace(id, '-w5-', '-w6-'), 'gym-confidence-6-w6', day_number, name
from public.routine_days where routine_week_id = 'gym-confidence-6-w5';
insert into public.routine_day_exercises
  (routine_day_id, position, exercise_id, sets, rep_min, rep_max, rest_seconds)
select replace(routine_day_id, '-w5-', '-w6-'), position, exercise_id, sets, rep_min, rep_max, rest_seconds
from public.routine_day_exercises where routine_day_id like 'gym-confidence-6-w5-%';

-- One spot: same three dumbbell days every week.
insert into public.routine_weeks (id, routine_id, week_number) values
  ('one-spot-6-w1', 'one-spot-6', 1);
insert into public.routine_days (id, routine_week_id, day_number, name) values
  ('one-spot-6-w1-d1', 'one-spot-6-w1', 1, 'Full body · one spot A'),
  ('one-spot-6-w1-d2', 'one-spot-6-w1', 2, 'Full body · one spot B'),
  ('one-spot-6-w1-d3', 'one-spot-6-w1', 3, 'Full body · one spot C');
insert into public.routine_day_exercises
  (routine_day_id, position, exercise_id, sets, rep_min, rep_max, rest_seconds) values
  ('one-spot-6-w1-d1', 1, 'goblet-squat', 3, 10, 12, 90),
  ('one-spot-6-w1-d1', 2, 'dumbbell-bench-press', 3, 8, 12, 90),
  ('one-spot-6-w1-d1', 3, 'one-arm-dumbbell-row', 3, 10, 12, 90),
  ('one-spot-6-w1-d1', 4, 'dumbbell-hip-thrust', 3, 10, 12, 90),
  ('one-spot-6-w1-d1', 5, 'dead-bug', 2, 10, 12, 60),
  ('one-spot-6-w1-d2', 1, 'dumbbell-romanian-deadlift', 3, 10, 12, 90),
  ('one-spot-6-w1-d2', 2, 'dumbbell-reverse-lunge', 3, 8, 12, 90),
  ('one-spot-6-w1-d2', 3, 'dumbbell-shoulder-press', 3, 10, 12, 90),
  ('one-spot-6-w1-d2', 4, 'frog-pump', 2, 12, 15, 60),
  ('one-spot-6-w1-d2', 5, 'dumbbell-lateral-raise', 2, 12, 15, 60),
  ('one-spot-6-w1-d3', 1, 'goblet-squat', 3, 10, 12, 90),
  ('one-spot-6-w1-d3', 2, 'incline-dumbbell-press', 3, 8, 12, 90),
  ('one-spot-6-w1-d3', 3, 'one-arm-dumbbell-row', 3, 10, 12, 90),
  ('one-spot-6-w1-d3', 4, 'glute-bridge', 3, 12, 15, 60),
  ('one-spot-6-w1-d3', 5, 'dead-bug', 2, 10, 12, 60);

insert into public.routine_weeks (id, routine_id, week_number)
select 'one-spot-6-w' || w, 'one-spot-6', w from generate_series(2, 6) as w;
insert into public.routine_days (id, routine_week_id, day_number, name)
select replace(d.id, '-w1-', '-w' || w || '-'), 'one-spot-6-w' || w, d.day_number, d.name
from public.routine_days d
cross join generate_series(2, 6) as w
where d.routine_week_id = 'one-spot-6-w1';
insert into public.routine_day_exercises
  (routine_day_id, position, exercise_id, sets, rep_min, rep_max, rest_seconds)
select replace(e.routine_day_id, '-w1-', '-w' || w || '-'), e.position, e.exercise_id, e.sets, e.rep_min, e.rep_max, e.rest_seconds
from public.routine_day_exercises e
cross join generate_series(2, 6) as w
where e.routine_day_id like 'one-spot-6-w1-%';

-- Busy gym: machine-first, same three days every week.
insert into public.routine_weeks (id, routine_id, week_number) values
  ('busy-gym-6-w1', 'busy-gym-6', 1);
insert into public.routine_days (id, routine_week_id, day_number, name) values
  ('busy-gym-6-w1-d1', 'busy-gym-6-w1', 1, 'Machines A'),
  ('busy-gym-6-w1-d2', 'busy-gym-6-w1', 2, 'Machines B'),
  ('busy-gym-6-w1-d3', 'busy-gym-6-w1', 3, 'Machines C');
insert into public.routine_day_exercises
  (routine_day_id, position, exercise_id, sets, rep_min, rep_max, rest_seconds) values
  ('busy-gym-6-w1-d1', 1, 'leg-press', 3, 10, 12, 90),
  ('busy-gym-6-w1-d1', 2, 'machine-chest-press', 3, 8, 12, 90),
  ('busy-gym-6-w1-d1', 3, 'lat-pulldown', 3, 10, 12, 90),
  ('busy-gym-6-w1-d1', 4, 'hip-thrust-machine', 3, 10, 12, 90),
  ('busy-gym-6-w1-d1', 5, 'cable-pallof-press', 2, 10, 12, 60),
  ('busy-gym-6-w1-d2', 1, 'seated-leg-curl', 3, 10, 12, 90),
  ('busy-gym-6-w1-d2', 2, 'machine-shoulder-press', 3, 10, 12, 90),
  ('busy-gym-6-w1-d2', 3, 'seated-cable-row', 3, 10, 12, 90),
  ('busy-gym-6-w1-d2', 4, 'hip-abduction-machine', 2, 12, 15, 60),
  ('busy-gym-6-w1-d2', 5, 'dead-bug', 2, 10, 12, 60),
  ('busy-gym-6-w1-d3', 1, 'hack-squat', 3, 10, 12, 90),
  ('busy-gym-6-w1-d3', 2, 'machine-chest-press', 3, 8, 12, 90),
  ('busy-gym-6-w1-d3', 3, 'assisted-pull-up', 3, 8, 12, 90),
  ('busy-gym-6-w1-d3', 4, 'lying-leg-curl', 3, 10, 12, 90),
  ('busy-gym-6-w1-d3', 5, 'standing-calf-raise', 2, 10, 15, 60);

insert into public.routine_weeks (id, routine_id, week_number)
select 'busy-gym-6-w' || w, 'busy-gym-6', w from generate_series(2, 6) as w;
insert into public.routine_days (id, routine_week_id, day_number, name)
select replace(d.id, '-w1-', '-w' || w || '-'), 'busy-gym-6-w' || w, d.day_number, d.name
from public.routine_days d
cross join generate_series(2, 6) as w
where d.routine_week_id = 'busy-gym-6-w1';
insert into public.routine_day_exercises
  (routine_day_id, position, exercise_id, sets, rep_min, rep_max, rest_seconds)
select replace(e.routine_day_id, '-w1-', '-w' || w || '-'), e.position, e.exercise_id, e.sets, e.rep_min, e.rep_max, e.rest_seconds
from public.routine_day_exercises e
cross join generate_series(2, 6) as w
where e.routine_day_id like 'busy-gym-6-w1-%';

-- Converted templates: copy the full-gym variant into every week.
insert into public.routine_weeks (id, routine_id, week_number)
select r.id || '-w' || w, r.id, w
from (values ('full-body-3'), ('upper-lower-4'), ('lower-body-3')) as r(id)
cross join generate_series(1, 8) as w;

insert into public.routine_days (id, routine_week_id, day_number, name, source_programme_day_id)
select
  pd.id,
  pd.programme_id || '-w1',
  pd.day_number,
  pd.name,
  pd.id
from public.programme_days pd
where pd.programme_id in ('full-body-3', 'upper-lower-4', 'lower-body-3');

insert into public.routine_days (id, routine_week_id, day_number, name, source_programme_day_id)
select
  pd.programme_id || '-w' || w || '-' || pd.day_number,
  pd.programme_id || '-w' || w,
  pd.day_number,
  pd.name,
  pd.id
from public.programme_days pd
cross join generate_series(2, 8) as w
where pd.programme_id in ('full-body-3', 'upper-lower-4', 'lower-body-3');

insert into public.routine_day_exercises
  (routine_day_id, position, exercise_id, sets, rep_min, rep_max, rest_seconds)
select rd.id, pe.position, pe.full_gym_exercise_id, pe.sets, pe.rep_min, pe.rep_max, 90
from public.routine_days rd
join public.programme_exercises pe on pe.programme_day_id = rd.source_programme_day_id
where rd.routine_week_id like 'full-body-3-w%'
   or rd.routine_week_id like 'upper-lower-4-w%'
   or rd.routine_week_id like 'lower-body-3-w%';

-- 6. Backfill: anyone already on a converted programme gets that routine.
-- Start date = first finished session of that programme, or today.
-- Does not read `blocks` (that file may not have been run).
insert into public.routine_enrolments (user_id, routine_id, start_date, status)
select
  p.user_id,
  r.id,
  coalesce(
    (
      select min(s.date)
      from public.sessions s
      join public.programme_days pd on pd.id = s.programme_day_id
      where s.user_id = p.user_id
        and s.completed_at is not null
        and pd.programme_id = r.source_programme_id
    ),
    current_date
  ),
  'active'
from public.profiles p
join public.routines r on r.source_programme_id = p.programme_id
where p.programme_id is not null
  and not exists (
    select 1 from public.routine_enrolments e
    where e.user_id = p.user_id and e.status = 'active'
  );

-- Point matching programme sessions at the enrolment and the week-1 day id
-- (those day ids are the original programme_days.id values).
update public.sessions s
set
  routine_enrolment_id = coalesce(s.routine_enrolment_id, e.id),
  routine_day_id = coalesce(s.routine_day_id, s.programme_day_id)
from public.routine_enrolments e
where e.user_id = s.user_id
  and e.status = 'active'
  and s.programme_day_id is not null
  and exists (
    select 1
    from public.routine_days rd
    where rd.id = s.programme_day_id
  )
  and (s.routine_enrolment_id is null or s.routine_day_id is null);

-- 7. RLS. Catalogue is readable; enrolments are own-rows only.
alter table public.images enable row level security;
alter table public.routines enable row level security;
alter table public.routine_tags enable row level security;
alter table public.routine_weeks enable row level security;
alter table public.routine_days enable row level security;
alter table public.routine_day_exercises enable row level security;
alter table public.routine_enrolments enable row level security;

drop policy if exists "Signed-in users can read images" on public.images;
create policy "Signed-in users can read images" on public.images
  for select to authenticated using (true);
drop policy if exists "Signed-in users can read routines" on public.routines;
create policy "Signed-in users can read routines" on public.routines
  for select to authenticated using (true);
drop policy if exists "Signed-in users can read routine tags" on public.routine_tags;
create policy "Signed-in users can read routine tags" on public.routine_tags
  for select to authenticated using (true);
drop policy if exists "Signed-in users can read routine weeks" on public.routine_weeks;
create policy "Signed-in users can read routine weeks" on public.routine_weeks
  for select to authenticated using (true);
drop policy if exists "Signed-in users can read routine days" on public.routine_days;
create policy "Signed-in users can read routine days" on public.routine_days
  for select to authenticated using (true);
drop policy if exists "Signed-in users can read routine day exercises" on public.routine_day_exercises;
create policy "Signed-in users can read routine day exercises" on public.routine_day_exercises
  for select to authenticated using (true);

drop policy if exists "Users can read their own enrolments" on public.routine_enrolments;
create policy "Users can read their own enrolments" on public.routine_enrolments
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users can create their own enrolments" on public.routine_enrolments;
create policy "Users can create their own enrolments" on public.routine_enrolments
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users can update their own enrolments" on public.routine_enrolments;
create policy "Users can update their own enrolments" on public.routine_enrolments
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists "Users can delete their own enrolments" on public.routine_enrolments;
create policy "Users can delete their own enrolments" on public.routine_enrolments
  for delete to authenticated using (user_id = (select auth.uid()));

grant select on public.images, public.routines, public.routine_tags,
  public.routine_weeks, public.routine_days, public.routine_day_exercises
  to authenticated;
grant select, insert, update, delete on public.routine_enrolments to authenticated;
