-- v2.1 S10: grow the strength catalogue from 6 to 14 routines.
-- Run after supabase/routines.sql (programmes.sql should already be in).
-- stretches.sql and paths.sql are optional; this file adds is_checkpoint if needed.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: it only replaces these eight ids. It never deletes sessions, sets,
-- enrolments, or the original six launch routines.
-- Do not run until the user confirms.
--
-- Content is conservative and still needs a coach review before launch.

-- Checkpoint flag (also in stretches.sql / paths.sql).
alter table public.routine_weeks add column if not exists is_checkpoint boolean not null default false;

-- 1. Covers. Bundled files in assets/covers/ show even before this runs.
insert into public.images (id, url, storage_path, alt_text, licence_source) values
  (
    'cover-full-body-2',
    'https://images.pexels.com/photos/3768696/pexels-photo-3768696.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-full-body-2.jpg',
    'Women training with dumbbells in a bright gym',
    'Photo by Andrea Piacquadio on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/3768696/'
  ),
  (
    'cover-home-strength-6',
    'https://images.pexels.com/photos/3757377/pexels-photo-3757377.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-home-strength-6.jpg',
    'Woman training on a stability ball',
    'Photo by Andrea Piacquadio on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/3757377/'
  ),
  (
    'cover-upper-body-6',
    'https://images.pexels.com/photos/3775576/pexels-photo-3775576.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-upper-body-6.jpg',
    'Woman doing a shoulder press on a gym machine',
    'Photo by Andrea Piacquadio on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/3775576/'
  ),
  (
    'cover-glute-builder-6',
    'https://images.pexels.com/photos/3775567/pexels-photo-3775567.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-glute-builder-6.jpg',
    'Woman using gym equipment for lower-body work',
    'Photo by Andrea Piacquadio on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/3775567/'
  ),
  (
    'cover-joint-friendly-6',
    'https://images.pexels.com/photos/3768593/pexels-photo-3768593.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-joint-friendly-6.jpg',
    'Woman sitting with a fit ball in a gym',
    'Photo by Andrea Piacquadio on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/3768593/'
  ),
  (
    'cover-short-cycle-4',
    'https://images.pexels.com/photos/863926/pexels-photo-863926.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-short-cycle-4.jpg',
    'Women in a group dumbbell session',
    'Photo by Andrea Piacquadio on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/863926/'
  ),
  (
    'cover-barbell-strength-8',
    'https://images.pexels.com/photos/3768162/pexels-photo-3768162.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-barbell-strength-8.jpg',
    'Woman lifting weights in a gym',
    'Photo by Andrea Piacquadio on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/3768162/'
  ),
  (
    'cover-one-spot-2',
    'https://images.pexels.com/photos/3768690/pexels-photo-3768690.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-one-spot-2.jpg',
    'Women training with dumbbells in a bright studio',
    'Photo by Andrea Piacquadio on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/3768690/'
  )
on conflict (id) do update set
  url = excluded.url,
  storage_path = excluded.storage_path,
  alt_text = excluded.alt_text,
  licence_source = excluded.licence_source;

-- 2. Catalogue rows. All Pro. Free starters stay Gym Confidence and Full body.
insert into public.routines (
  id, name, slug, description, cover_image_id, goal, length_weeks, days_per_week,
  session_minutes, difficulty, equipment, is_pro, is_featured_eligible, sort_order,
  source_programme_id
) values
  (
    'full-body-2',
    'Full body 2 days',
    'full-body-2',
    'Two full-body sessions a week. Eight weeks of the same two days, for busy weeks or a gentler start. Go up when you hit the top of the range.',
    'cover-full-body-2',
    'general', 8, 2, 40, 'beginner', 'full_gym', true, true, 7, 'full-body-2'
  ),
  (
    'home-strength-6',
    'Home strength',
    'home-strength-6',
    'Bands and bodyweight in a small space. Three full-body sessions a week for six weeks. No gym required.',
    'cover-home-strength-6',
    'general', 6, 3, 35, 'beginner', 'home', true, true, 8, null
  ),
  (
    'upper-body-6',
    'Upper body',
    'upper-body-6',
    'Push, pull and a mixed upper day. Three sessions a week for six weeks, once you already know the machines.',
    'cover-upper-body-6',
    'strength', 6, 3, 45, 'intermediate', 'full_gym', true, true, 9, null
  ),
  (
    'glute-builder-6',
    'Glute builder',
    'glute-builder-6',
    'Three lower-body sessions a week. Hip thrusts, squats and accessories, kept beginner-friendly. Six weeks of the same three days.',
    'cover-glute-builder-6',
    'glutes_legs', 6, 3, 45, 'beginner', 'full_gym', true, true, 10, null
  ),
  (
    'joint-friendly-6',
    'Joint friendly',
    'joint-friendly-6',
    'Machine-led full-body sessions with a smaller range of motion and no lunges or barbell squats. Three days a week. Skip anything that hurts.',
    'cover-joint-friendly-6',
    'general', 6, 3, 40, 'beginner', 'full_gym', true, true, 11, null
  ),
  (
    'short-cycle-4',
    'Four weeks strong',
    'short-cycle-4',
    'A short full-body block. Three gym sessions a week for four weeks, then you can repeat or pick a longer plan.',
    'cover-short-cycle-4',
    'general', 4, 3, 40, 'beginner', 'full_gym', true, true, 12, null
  ),
  (
    'barbell-strength-8',
    'Barbell strength',
    'barbell-strength-8',
    'Squat, bench, hip thrust and Romanian deadlift, with room for accessories. Three days a week for eight weeks. For when the basics already feel familiar.',
    'cover-barbell-strength-8',
    'strength', 8, 3, 50, 'experienced', 'full_gym', true, true, 13, null
  ),
  (
    'one-spot-2',
    'One spot 2 days',
    'one-spot-2',
    'Stay in the dumbbell area, twice a week. Eight weeks of the same two full-body days. Quiet, simple and easy to repeat.',
    'cover-one-spot-2',
    'general', 8, 2, 40, 'beginner', 'dumbbells', true, true, 14, null
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

-- 3. Replace only these eight plans.
delete from public.routine_day_exercises
where routine_day_id in (
  select rd.id
  from public.routine_days rd
  join public.routine_weeks rw on rw.id = rd.routine_week_id
  where rw.routine_id in (
    'full-body-2', 'home-strength-6', 'upper-body-6', 'glute-builder-6',
    'joint-friendly-6', 'short-cycle-4', 'barbell-strength-8', 'one-spot-2'
  )
);
delete from public.routine_days
where routine_week_id in (
  select id from public.routine_weeks
  where routine_id in (
    'full-body-2', 'home-strength-6', 'upper-body-6', 'glute-builder-6',
    'joint-friendly-6', 'short-cycle-4', 'barbell-strength-8', 'one-spot-2'
  )
);
delete from public.routine_weeks
where routine_id in (
  'full-body-2', 'home-strength-6', 'upper-body-6', 'glute-builder-6',
  'joint-friendly-6', 'short-cycle-4', 'barbell-strength-8', 'one-spot-2'
);
delete from public.routine_tags
where routine_id in (
  'full-body-2', 'home-strength-6', 'upper-body-6', 'glute-builder-6',
  'joint-friendly-6', 'short-cycle-4', 'barbell-strength-8', 'one-spot-2'
);

insert into public.routine_tags (routine_id, tag) values
  ('full-body-2', 'beginner-friendly'),
  ('full-body-2', 'full body'),
  ('full-body-2', 'build muscle'),
  ('home-strength-6', 'minimal equipment'),
  ('home-strength-6', 'beginner-friendly'),
  ('home-strength-6', 'full body'),
  ('upper-body-6', 'upper body'),
  ('upper-body-6', 'build muscle'),
  ('glute-builder-6', 'glutes & legs'),
  ('glute-builder-6', 'beginner-friendly'),
  ('glute-builder-6', 'build muscle'),
  ('joint-friendly-6', 'joint friendly'),
  ('joint-friendly-6', 'beginner-friendly'),
  ('joint-friendly-6', 'busy gym friendly'),
  ('joint-friendly-6', 'full body'),
  ('short-cycle-4', 'beginner-friendly'),
  ('short-cycle-4', 'full body'),
  ('short-cycle-4', 'build muscle'),
  ('barbell-strength-8', 'build muscle'),
  ('barbell-strength-8', 'full body'),
  ('one-spot-2', 'one spot'),
  ('one-spot-2', 'minimal equipment'),
  ('one-spot-2', 'beginner-friendly'),
  ('one-spot-2', 'full body'),
  ('one-spot-2', 'busy gym friendly');

-- 4. Week 1 for each plan, then clone remaining weeks.
insert into public.routine_weeks (id, routine_id, week_number, is_checkpoint) values
  ('full-body-2-w1', 'full-body-2', 1, false),
  ('home-strength-6-w1', 'home-strength-6', 1, false),
  ('upper-body-6-w1', 'upper-body-6', 1, false),
  ('glute-builder-6-w1', 'glute-builder-6', 1, false),
  ('joint-friendly-6-w1', 'joint-friendly-6', 1, false),
  ('short-cycle-4-w1', 'short-cycle-4', 1, false),
  ('barbell-strength-8-w1', 'barbell-strength-8', 1, false),
  ('one-spot-2-w1', 'one-spot-2', 1, false);

insert into public.routine_days (id, routine_week_id, day_number, name) values
  ('full-body-2-w1-d1', 'full-body-2-w1', 1, 'Full body A'),
  ('full-body-2-w1-d2', 'full-body-2-w1', 2, 'Full body B'),
  ('home-strength-6-w1-d1', 'home-strength-6-w1', 1, 'Full body A'),
  ('home-strength-6-w1-d2', 'home-strength-6-w1', 2, 'Full body B'),
  ('home-strength-6-w1-d3', 'home-strength-6-w1', 3, 'Full body C'),
  ('upper-body-6-w1-d1', 'upper-body-6-w1', 1, 'Push'),
  ('upper-body-6-w1-d2', 'upper-body-6-w1', 2, 'Pull'),
  ('upper-body-6-w1-d3', 'upper-body-6-w1', 3, 'Upper mix'),
  ('glute-builder-6-w1-d1', 'glute-builder-6-w1', 1, 'Glutes A'),
  ('glute-builder-6-w1-d2', 'glute-builder-6-w1', 2, 'Legs'),
  ('glute-builder-6-w1-d3', 'glute-builder-6-w1', 3, 'Glutes B'),
  ('joint-friendly-6-w1-d1', 'joint-friendly-6-w1', 1, 'Machines A'),
  ('joint-friendly-6-w1-d2', 'joint-friendly-6-w1', 2, 'Machines B'),
  ('joint-friendly-6-w1-d3', 'joint-friendly-6-w1', 3, 'Machines C'),
  ('short-cycle-4-w1-d1', 'short-cycle-4-w1', 1, 'Full body A'),
  ('short-cycle-4-w1-d2', 'short-cycle-4-w1', 2, 'Full body B'),
  ('short-cycle-4-w1-d3', 'short-cycle-4-w1', 3, 'Full body C'),
  ('barbell-strength-8-w1-d1', 'barbell-strength-8-w1', 1, 'Squat and press'),
  ('barbell-strength-8-w1-d2', 'barbell-strength-8-w1', 2, 'Hinge and pull'),
  ('barbell-strength-8-w1-d3', 'barbell-strength-8-w1', 3, 'Squat and row'),
  ('one-spot-2-w1-d1', 'one-spot-2-w1', 1, 'Full body · one spot A'),
  ('one-spot-2-w1-d2', 'one-spot-2-w1', 2, 'Full body · one spot B');

insert into public.routine_day_exercises
  (routine_day_id, position, exercise_id, sets, rep_min, rep_max, rest_seconds) values
  -- Full body 2 days (from the old full-body-2 full-gym variant)
  ('full-body-2-w1-d1', 1, 'leg-press', 3, 10, 12, 90),
  ('full-body-2-w1-d1', 2, 'machine-chest-press', 3, 8, 12, 90),
  ('full-body-2-w1-d1', 3, 'lat-pulldown', 3, 10, 12, 90),
  ('full-body-2-w1-d1', 4, 'hip-thrust-machine', 3, 10, 12, 90),
  ('full-body-2-w1-d1', 5, 'cable-pallof-press', 2, 10, 12, 60),
  ('full-body-2-w1-d2', 1, 'dumbbell-romanian-deadlift', 3, 10, 12, 90),
  ('full-body-2-w1-d2', 2, 'dumbbell-reverse-lunge', 3, 8, 12, 90),
  ('full-body-2-w1-d2', 3, 'machine-shoulder-press', 3, 10, 12, 90),
  ('full-body-2-w1-d2', 4, 'seated-cable-row', 3, 10, 12, 90),
  ('full-body-2-w1-d2', 5, 'hip-abduction-machine', 2, 12, 15, 60),
  -- Home strength
  ('home-strength-6-w1-d1', 1, 'banded-squat', 3, 10, 12, 90),
  ('home-strength-6-w1-d1', 2, 'incline-push-up', 3, 8, 12, 90),
  ('home-strength-6-w1-d1', 3, 'band-row', 3, 10, 12, 90),
  ('home-strength-6-w1-d1', 4, 'banded-hip-thrust', 3, 10, 12, 90),
  ('home-strength-6-w1-d1', 5, 'dead-bug', 2, 10, 12, 60),
  ('home-strength-6-w1-d2', 1, 'bodyweight-reverse-lunge', 3, 8, 12, 90),
  ('home-strength-6-w1-d2', 2, 'band-chest-press', 3, 8, 12, 90),
  ('home-strength-6-w1-d2', 3, 'band-lat-pulldown', 3, 10, 12, 90),
  ('home-strength-6-w1-d2', 4, 'banded-hamstring-curl', 3, 10, 12, 90),
  ('home-strength-6-w1-d2', 5, 'plank', 2, 8, 12, 60),
  ('home-strength-6-w1-d3', 1, 'bodyweight-squat', 3, 10, 12, 90),
  ('home-strength-6-w1-d3', 2, 'knee-push-up', 3, 8, 12, 90),
  ('home-strength-6-w1-d3', 3, 'band-row', 3, 10, 12, 90),
  ('home-strength-6-w1-d3', 4, 'donkey-kick', 2, 12, 15, 60),
  ('home-strength-6-w1-d3', 5, 'band-pallof-press', 2, 10, 12, 60),
  -- Upper body
  ('upper-body-6-w1-d1', 1, 'machine-chest-press', 3, 8, 12, 90),
  ('upper-body-6-w1-d1', 2, 'machine-shoulder-press', 3, 10, 12, 90),
  ('upper-body-6-w1-d1', 3, 'pec-deck', 2, 12, 15, 60),
  ('upper-body-6-w1-d1', 4, 'cable-triceps-pushdown', 2, 10, 15, 60),
  ('upper-body-6-w1-d1', 5, 'dumbbell-lateral-raise', 2, 12, 15, 60),
  ('upper-body-6-w1-d2', 1, 'lat-pulldown', 3, 8, 12, 90),
  ('upper-body-6-w1-d2', 2, 'seated-cable-row', 3, 10, 12, 90),
  ('upper-body-6-w1-d2', 3, 'cable-face-pull', 2, 12, 15, 60),
  ('upper-body-6-w1-d2', 4, 'cable-biceps-curl', 2, 10, 15, 60),
  ('upper-body-6-w1-d2', 5, 'reverse-pec-deck', 2, 12, 15, 60),
  ('upper-body-6-w1-d3', 1, 'incline-machine-chest-press', 3, 8, 12, 90),
  ('upper-body-6-w1-d3', 2, 'machine-row', 3, 10, 12, 90),
  ('upper-body-6-w1-d3', 3, 'assisted-pull-up', 3, 8, 12, 90),
  ('upper-body-6-w1-d3', 4, 'cable-chest-fly', 2, 12, 15, 60),
  ('upper-body-6-w1-d3', 5, 'cable-overhead-triceps-extension', 2, 10, 15, 60),
  -- Glute builder
  ('glute-builder-6-w1-d1', 1, 'hip-thrust-machine', 3, 10, 12, 90),
  ('glute-builder-6-w1-d1', 2, 'goblet-squat', 3, 10, 12, 90),
  ('glute-builder-6-w1-d1', 3, 'dumbbell-romanian-deadlift', 3, 10, 12, 90),
  ('glute-builder-6-w1-d1', 4, 'hip-abduction-machine', 2, 12, 15, 60),
  ('glute-builder-6-w1-d1', 5, 'frog-pump', 2, 12, 15, 60),
  ('glute-builder-6-w1-d2', 1, 'leg-press', 3, 10, 12, 90),
  ('glute-builder-6-w1-d2', 2, 'dumbbell-reverse-lunge', 3, 8, 12, 90),
  ('glute-builder-6-w1-d2', 3, 'seated-leg-curl', 3, 10, 12, 90),
  ('glute-builder-6-w1-d2', 4, 'hip-adduction-machine', 2, 12, 15, 60),
  ('glute-builder-6-w1-d2', 5, 'standing-calf-raise', 2, 10, 15, 60),
  ('glute-builder-6-w1-d3', 1, 'dumbbell-hip-thrust', 3, 10, 12, 90),
  ('glute-builder-6-w1-d3', 2, 'dumbbell-sumo-squat', 3, 10, 12, 90),
  ('glute-builder-6-w1-d3', 3, 'glute-focused-back-extension', 3, 10, 12, 90),
  ('glute-builder-6-w1-d3', 4, 'glute-kickback-machine', 2, 12, 15, 60),
  ('glute-builder-6-w1-d3', 5, 'fire-hydrant', 2, 12, 15, 60),
  -- Joint friendly
  ('joint-friendly-6-w1-d1', 1, 'leg-press', 3, 10, 12, 90),
  ('joint-friendly-6-w1-d1', 2, 'machine-chest-press', 3, 8, 12, 90),
  ('joint-friendly-6-w1-d1', 3, 'lat-pulldown', 3, 10, 12, 90),
  ('joint-friendly-6-w1-d1', 4, 'hip-thrust-machine', 3, 10, 12, 90),
  ('joint-friendly-6-w1-d1', 5, 'cable-pallof-press', 2, 10, 12, 60),
  ('joint-friendly-6-w1-d2', 1, 'seated-leg-curl', 3, 10, 12, 90),
  ('joint-friendly-6-w1-d2', 2, 'machine-shoulder-press', 3, 10, 12, 90),
  ('joint-friendly-6-w1-d2', 3, 'machine-row', 3, 10, 12, 90),
  ('joint-friendly-6-w1-d2', 4, 'hip-abduction-machine', 2, 12, 15, 60),
  ('joint-friendly-6-w1-d2', 5, 'dead-bug', 2, 10, 12, 60),
  ('joint-friendly-6-w1-d3', 1, 'leg-extension', 3, 10, 12, 90),
  ('joint-friendly-6-w1-d3', 2, 'pec-deck', 2, 12, 15, 60),
  ('joint-friendly-6-w1-d3', 3, 'seated-cable-row', 3, 10, 12, 90),
  ('joint-friendly-6-w1-d3', 4, 'hip-adduction-machine', 2, 12, 15, 60),
  ('joint-friendly-6-w1-d3', 5, 'seated-calf-raise', 2, 10, 15, 60),
  -- Four weeks strong
  ('short-cycle-4-w1-d1', 1, 'goblet-squat', 3, 10, 12, 90),
  ('short-cycle-4-w1-d1', 2, 'machine-chest-press', 3, 8, 12, 90),
  ('short-cycle-4-w1-d1', 3, 'lat-pulldown', 3, 10, 12, 90),
  ('short-cycle-4-w1-d1', 4, 'hip-thrust-machine', 3, 10, 12, 90),
  ('short-cycle-4-w1-d1', 5, 'dead-bug', 2, 10, 12, 60),
  ('short-cycle-4-w1-d2', 1, 'dumbbell-romanian-deadlift', 3, 10, 12, 90),
  ('short-cycle-4-w1-d2', 2, 'leg-press', 3, 10, 12, 90),
  ('short-cycle-4-w1-d2', 3, 'seated-cable-row', 3, 10, 12, 90),
  ('short-cycle-4-w1-d2', 4, 'machine-shoulder-press', 3, 10, 12, 90),
  ('short-cycle-4-w1-d2', 5, 'hip-abduction-machine', 2, 12, 15, 60),
  ('short-cycle-4-w1-d3', 1, 'goblet-squat', 3, 10, 12, 90),
  ('short-cycle-4-w1-d3', 2, 'incline-dumbbell-press', 3, 8, 12, 90),
  ('short-cycle-4-w1-d3', 3, 'seated-cable-row', 3, 10, 12, 90),
  ('short-cycle-4-w1-d3', 4, 'lying-leg-curl', 3, 10, 12, 90),
  ('short-cycle-4-w1-d3', 5, 'cable-pallof-press', 2, 10, 12, 60),
  -- Barbell strength (experienced, conservative set count)
  ('barbell-strength-8-w1-d1', 1, 'barbell-back-squat', 3, 6, 10, 90),
  ('barbell-strength-8-w1-d1', 2, 'barbell-bench-press', 3, 6, 10, 90),
  ('barbell-strength-8-w1-d1', 3, 'one-arm-dumbbell-row', 3, 8, 12, 90),
  ('barbell-strength-8-w1-d1', 4, 'barbell-hip-thrust', 3, 8, 12, 90),
  ('barbell-strength-8-w1-d1', 5, 'cable-pallof-press', 2, 10, 12, 60),
  ('barbell-strength-8-w1-d2', 1, 'barbell-romanian-deadlift', 3, 6, 10, 90),
  ('barbell-strength-8-w1-d2', 2, 'dumbbell-reverse-lunge', 3, 8, 12, 90),
  ('barbell-strength-8-w1-d2', 3, 'barbell-overhead-press', 3, 6, 10, 90),
  ('barbell-strength-8-w1-d2', 4, 'lat-pulldown', 3, 8, 12, 90),
  ('barbell-strength-8-w1-d2', 5, 'cable-face-pull', 2, 12, 15, 60),
  ('barbell-strength-8-w1-d3', 1, 'barbell-back-squat', 3, 6, 10, 90),
  ('barbell-strength-8-w1-d3', 2, 'incline-dumbbell-press', 3, 8, 12, 90),
  ('barbell-strength-8-w1-d3', 3, 'seated-cable-row', 3, 8, 12, 90),
  ('barbell-strength-8-w1-d3', 4, 'barbell-hip-thrust', 3, 8, 12, 90),
  ('barbell-strength-8-w1-d3', 5, 'dumbbell-lateral-raise', 2, 12, 15, 60),
  -- One spot 2 days
  ('one-spot-2-w1-d1', 1, 'goblet-squat', 3, 10, 12, 90),
  ('one-spot-2-w1-d1', 2, 'dumbbell-bench-press', 3, 8, 12, 90),
  ('one-spot-2-w1-d1', 3, 'one-arm-dumbbell-row', 3, 10, 12, 90),
  ('one-spot-2-w1-d1', 4, 'dumbbell-hip-thrust', 3, 10, 12, 90),
  ('one-spot-2-w1-d1', 5, 'dead-bug', 2, 10, 12, 60),
  ('one-spot-2-w1-d2', 1, 'dumbbell-romanian-deadlift', 3, 10, 12, 90),
  ('one-spot-2-w1-d2', 2, 'dumbbell-reverse-lunge', 3, 8, 12, 90),
  ('one-spot-2-w1-d2', 3, 'dumbbell-shoulder-press', 3, 10, 12, 90),
  ('one-spot-2-w1-d2', 4, 'frog-pump', 2, 12, 15, 60),
  ('one-spot-2-w1-d2', 5, 'dumbbell-lateral-raise', 2, 12, 15, 60);

-- Clone week 1 across the rest of each plan. Checkpoints: week 4, plus week 8 on 8-week plans.
insert into public.routine_weeks (id, routine_id, week_number, is_checkpoint)
select r.id || '-w' || w, r.id, w,
  (w = 4) or (r.len >= 8 and w = 8)
from (values
  ('full-body-2', 8),
  ('home-strength-6', 6),
  ('upper-body-6', 6),
  ('glute-builder-6', 6),
  ('joint-friendly-6', 6),
  ('short-cycle-4', 4),
  ('barbell-strength-8', 8),
  ('one-spot-2', 8)
) as r(id, len)
cross join generate_series(2, 8) as w
where w <= r.len;

insert into public.routine_days (id, routine_week_id, day_number, name)
select replace(d.id, '-w1-', '-w' || w || '-'), r.id || '-w' || w, d.day_number, d.name
from public.routine_days d
join public.routine_weeks rw on rw.id = d.routine_week_id
join (values
  ('full-body-2', 8),
  ('home-strength-6', 6),
  ('upper-body-6', 6),
  ('glute-builder-6', 6),
  ('joint-friendly-6', 6),
  ('short-cycle-4', 4),
  ('barbell-strength-8', 8),
  ('one-spot-2', 8)
) as r(id, len) on r.id = rw.routine_id
cross join generate_series(2, 8) as w
where rw.week_number = 1
  and w <= r.len;

insert into public.routine_day_exercises
  (routine_day_id, position, exercise_id, sets, rep_min, rep_max, rest_seconds)
select replace(e.routine_day_id, '-w1-', '-w' || w || '-'), e.position, e.exercise_id, e.sets, e.rep_min, e.rep_max, e.rest_seconds
from public.routine_day_exercises e
join public.routine_days d on d.id = e.routine_day_id
join public.routine_weeks rw on rw.id = d.routine_week_id
join (values
  ('full-body-2', 8),
  ('home-strength-6', 6),
  ('upper-body-6', 6),
  ('glute-builder-6', 6),
  ('joint-friendly-6', 6),
  ('short-cycle-4', 4),
  ('barbell-strength-8', 8),
  ('one-spot-2', 8)
) as r(id, len) on r.id = rw.routine_id
cross join generate_series(2, 8) as w
where rw.week_number = 1
  and w <= r.len;

-- 5. Anyone still on the old 2-day programme, with no active enrolment, gets this plan.
-- Does not move people who already started a different routine.
insert into public.routine_enrolments (user_id, routine_id, start_date, status)
select
  p.user_id,
  'full-body-2',
  coalesce(
    (
      select min(s.date)
      from public.sessions s
      join public.programme_days pd on pd.id = s.programme_day_id
      where s.user_id = p.user_id
        and s.completed_at is not null
        and pd.programme_id = 'full-body-2'
    ),
    current_date
  ),
  'active'
from public.profiles p
where p.programme_id = 'full-body-2'
  and not exists (
    select 1 from public.routine_enrolments e
    where e.user_id = p.user_id and e.status = 'active'
  );
