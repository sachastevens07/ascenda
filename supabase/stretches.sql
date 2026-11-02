-- v2.1 S8: stretch routines (timed holds), session source 'stretch'.
-- Run after supabase/routines.sql (and exercises.sql / zones.sql).
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: it never deletes sessions or sets.
-- Do not run until the user confirms.

-- 1. Catalogue type. Existing rows stay strength.
alter table public.routines add column if not exists type text;
update public.routines set type = 'strength' where type is null;
alter table public.routines alter column type set default 'strength';
alter table public.routines alter column type set not null;
alter table public.routines drop constraint if exists routines_type_check;
alter table public.routines add constraint routines_type_check check (
  type in ('strength', 'stretch')
);

-- Stretch sessions can be 5 to 20 minutes. Strength stays in the same range.
alter table public.routines drop constraint if exists routines_session_minutes_check;
alter table public.routines add constraint routines_session_minutes_check check (
  session_minutes between 5 and 120
);

-- S9 will use this. Stretch weeks stay false.
alter table public.routine_weeks add column if not exists is_checkpoint boolean not null default false;

-- Timed holds. Strength rows keep sets and reps; stretch rows set duration_seconds.
alter table public.routine_day_exercises add column if not exists duration_seconds integer;
alter table public.routine_day_exercises drop constraint if exists routine_day_exercises_duration_check;
alter table public.routine_day_exercises add constraint routine_day_exercises_duration_check check (
  duration_seconds is null or duration_seconds between 10 and 180
);

alter table public.sessions drop constraint if exists sessions_source_check;
alter table public.sessions add constraint sessions_source_check check (
  source in ('programme', 'custom', 'ai', 'routine', 'stretch')
);

-- 2. Stretch library. Bodyweight, zone 1 (trigger). Conservative cues. Coach review still required.
insert into public.exercises (id, name, primary_muscle, secondary_muscles, equipment, cues, location_hint) values
('childs-pose', 'Child''s Pose', 'back', array['core'], 'bodyweight',
  array['Kneel and sit your hips back toward your heels.', 'Reach your arms forward and let your chest sink toward the floor.', 'Breathe slowly. Come up if your knees or back complain.'],
  'A mat in the stretching area, or at home.'),
('cat-cow', 'Cat-Cow', 'back', array['core'], 'bodyweight',
  array['Start on all fours, hands under shoulders and knees under hips.', 'Round your back as you breathe out, then lift your chest as you breathe in.', 'Move with your breath. Keep it small and comfortable.'],
  'A mat in the stretching area, or at home.'),
('kneeling-hip-flexor-stretch', 'Kneeling Hip Flexor Stretch', 'quads', array['glutes'], 'bodyweight',
  array['Kneel on one knee with the other foot in front, both hips facing forward.', 'Gently shift your hips forward until you feel a stretch in the back-leg hip.', 'Keep your ribs stacked over your hips. Switch sides halfway if the step is for both.'],
  'A mat in the stretching area, or at home. Pad the back knee if you need to.'),
('figure-four-stretch', 'Figure-Four Stretch', 'glutes', array['hamstrings'], 'bodyweight',
  array['Lie on your back and cross one ankle over the opposite knee.', 'Reach behind the uncrossed thigh and draw it toward you.', 'Keep your head heavy on the floor. Switch sides halfway if the step is for both.'],
  'A mat in the stretching area, or at home.'),
('seated-hamstring-stretch', 'Seated Hamstring Stretch', 'hamstrings', array['calves'], 'bodyweight',
  array['Sit with one leg long and the other bent, foot against the inner thigh.', 'Hinge from your hips and reach toward the long-leg foot.', 'Keep a long spine. Switch sides halfway if the step is for both.'],
  'A mat in the stretching area, or at home.'),
('standing-quad-stretch', 'Standing Quad Stretch', 'quads', array['glutes'], 'bodyweight',
  array['Stand tall and hold a wall or rack if you need balance.', 'Bend one knee and hold that ankle behind you.', 'Keep your knees close and your hips facing forward. Switch sides halfway if the step is for both.'],
  'Anywhere with a wall or rack to hold. Works at home too.'),
('doorway-chest-stretch', 'Doorway Chest Stretch', 'chest', array['shoulders'], 'bodyweight',
  array['Stand in a doorway and place your forearm on the frame, elbow at about shoulder height.', 'Step the same-side foot forward until you feel a stretch across your chest.', 'Keep your ribs down. Switch sides halfway if the step is for both.'],
  'A doorway, squat-rack upright, or wall edge.'),
('thread-the-needle', 'Thread the Needle', 'back', array['shoulders'], 'bodyweight',
  array['Start on all fours.', 'Slide one arm under your body, palm up, and rest that shoulder on the mat.', 'Breathe into the back of the shoulder. Switch sides halfway if the step is for both.'],
  'A mat in the stretching area, or at home.'),
('seated-spinal-twist', 'Seated Spinal Twist', 'core', array['back'], 'bodyweight',
  array['Sit tall with both legs bent, or one long if that feels better.', 'Place one hand behind you and the other on the opposite knee, and turn from your ribs.', 'Keep the twist gentle. Switch sides halfway if the step is for both.'],
  'A mat or a sturdy bench. Works at a desk chair too.'),
('butterfly-stretch', 'Butterfly Stretch', 'adductors', array['glutes'], 'bodyweight',
  array['Sit tall with the soles of your feet together.', 'Let your knees drop open and hold your feet or shins.', 'Hinge forward a little if you want more. Do not push the knees down.'],
  'A mat in the stretching area, or at home.'),
('calf-wall-stretch', 'Calf Wall Stretch', 'calves', array['hamstrings'], 'bodyweight',
  array['Stand facing a wall with one foot back, heel down.', 'Bend the front knee until you feel a stretch in the back calf.', 'Keep the back foot pointing forward. Switch sides halfway if the step is for both.'],
  'A wall, rack upright, or sturdy machine frame.'),
('open-book-stretch', 'Open-Book Stretch', 'back', array['chest'], 'bodyweight',
  array['Lie on your side with knees bent and stacked, arms reaching forward.', 'Open your top arm across your body toward the floor behind you, turning your chest.', 'Let your head follow your hand. Switch sides halfway if the step is for both.'],
  'A mat in the stretching area, or at home.'),
('ninety-ninety-hip-stretch', '90/90 Hip Stretch', 'glutes', array['adductors'], 'bodyweight',
  array['Sit with the front knee and back knee both bent to about a right angle.', 'Sit as tall as you can over the front hip.', 'Switch the legs halfway if the step is for both. Stay in a range that feels like a stretch, not a pinch.'],
  'A mat in the stretching area, or at home.'),
('standing-forward-fold', 'Standing Forward Fold', 'hamstrings', array['calves', 'back'], 'bodyweight',
  array['Stand with a soft bend in your knees and hinge from your hips.', 'Let your head and arms hang.', 'Bend the knees more if your hamstrings feel sharp. Roll up slowly.'],
  'Anywhere with a little space: the stretching area or at home.'),
('cross-body-shoulder-stretch', 'Cross-Body Shoulder Stretch', 'shoulders', array['back'], 'bodyweight',
  array['Bring one arm across your chest.', 'Use the other arm to support it, just above the elbow.', 'Keep your shoulders down. Switch sides halfway if the step is for both.'],
  'Anywhere: the stretching area, a quiet gym corner, or your desk.'),
('prone-press-up', 'Prone Press-Up', 'back', array['core'], 'bodyweight',
  array['Lie on your stomach with your hands under your shoulders.', 'Press your chest up, keeping your hips on the floor.', 'Only go as high as feels easy. This is a gentle stretch, not a push-up.'],
  'A mat in the stretching area, or at home.')

on conflict (id) do update set
  name = excluded.name,
  primary_muscle = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles,
  equipment = excluded.equipment,
  cues = excluded.cues,
  location_hint = excluded.location_hint;

-- 3. Replace stretch catalogue rows only. Strength routines stay.
delete from public.routine_day_exercises
where routine_day_id in (
  select d.id from public.routine_days d
  join public.routine_weeks w on w.id = d.routine_week_id
  where w.routine_id like 'stretch-%'
);
delete from public.routine_days
where routine_week_id in (select id from public.routine_weeks where routine_id like 'stretch-%');
delete from public.routine_weeks where routine_id like 'stretch-%';
delete from public.routine_tags where routine_id like 'stretch-%';
delete from public.routines where id like 'stretch-%';

insert into public.routines (
  id, name, slug, description, cover_image_id, goal, length_weeks, days_per_week,
  session_minutes, difficulty, equipment, is_pro, is_featured_eligible, sort_order, type
) values
  (
    'stretch-morning',
    'Morning mobility',
    'morning-mobility',
    'A short full-body warm-up you can do beside the bed or in a quiet gym corner. Breathe, do not force the range.',
    'cover-gym-confidence-6',
    'general', 1, 1, 10, 'beginner', 'home', false, false, 20, 'stretch'
  ),
  (
    'stretch-desk',
    'Desk stretch',
    'desk-stretch',
    'Un-hunch after sitting. Use a chair, a doorway and a little floor space. Stop if anything hurts.',
    'cover-one-spot-6',
    'general', 1, 1, 8, 'beginner', 'home', false, false, 21, 'stretch'
  ),
  (
    'stretch-post-leg',
    'After leg day',
    'after-leg-day',
    'Hips, quads, hamstrings and calves after a lower-body session. Keep every hold easy enough to breathe.',
    'cover-lower-body-3',
    'general', 1, 1, 12, 'beginner', 'home', false, false, 22, 'stretch'
  ),
  (
    'stretch-lower-back',
    'Lower back stretch',
    'lower-back-stretch',
    'Gentle floor holds for your back and hips. This is general mobility, not treatment for pain. Stop if anything hurts.',
    'cover-full-body-3',
    'general', 1, 1, 10, 'beginner', 'home', true, false, 23, 'stretch'
  ),
  (
    'stretch-full-body',
    'Full body stretch',
    'full-body-stretch',
    'A longer cool-down covering hips, back, chest and legs. Use a mat. Skip or shorten any hold that does not feel right.',
    'cover-busy-gym-6',
    'general', 1, 1, 15, 'beginner', 'home', true, false, 24, 'stretch'
  ),
  (
    'stretch-upper',
    'Upper body openers',
    'upper-body-openers',
    'Chest, shoulders and upper back after pressing or desk work. A doorway helps. Keep the stretches small.',
    'cover-upper-lower-4',
    'general', 1, 1, 10, 'beginner', 'home', true, false, 25, 'stretch'
  ),
  (
    'stretch-hips',
    'Hip mobility',
    'hip-mobility',
    'Floor holds for hips and glutes. Go slow, and stay out of any pinch at the front of the hip.',
    'cover-lower-body-3',
    'general', 1, 1, 12, 'beginner', 'home', true, false, 26, 'stretch'
  );

insert into public.routine_tags (routine_id, tag) values
  ('stretch-morning', 'morning'),
  ('stretch-morning', 'full body'),
  ('stretch-morning', 'beginner-friendly'),
  ('stretch-desk', 'desk'),
  ('stretch-desk', 'upper body'),
  ('stretch-desk', 'beginner-friendly'),
  ('stretch-post-leg', 'post-leg day'),
  ('stretch-post-leg', 'hips'),
  ('stretch-post-leg', 'glutes & legs'),
  ('stretch-lower-back', 'lower back'),
  ('stretch-lower-back', 'mobility'),
  ('stretch-full-body', 'full body'),
  ('stretch-full-body', 'mobility'),
  ('stretch-upper', 'upper body'),
  ('stretch-upper', 'desk'),
  ('stretch-hips', 'hips'),
  ('stretch-hips', 'glutes & legs'),
  ('stretch-hips', 'mobility');

insert into public.routine_weeks (id, routine_id, week_number, is_checkpoint) values
  ('stretch-morning-w1', 'stretch-morning', 1, false),
  ('stretch-desk-w1', 'stretch-desk', 1, false),
  ('stretch-post-leg-w1', 'stretch-post-leg', 1, false),
  ('stretch-lower-back-w1', 'stretch-lower-back', 1, false),
  ('stretch-full-body-w1', 'stretch-full-body', 1, false),
  ('stretch-upper-w1', 'stretch-upper', 1, false),
  ('stretch-hips-w1', 'stretch-hips', 1, false);

insert into public.routine_days (id, routine_week_id, day_number, name) values
  ('stretch-morning-d1', 'stretch-morning-w1', 1, 'Morning mobility'),
  ('stretch-desk-d1', 'stretch-desk-w1', 1, 'Desk stretch'),
  ('stretch-post-leg-d1', 'stretch-post-leg-w1', 1, 'After leg day'),
  ('stretch-lower-back-d1', 'stretch-lower-back-w1', 1, 'Lower back stretch'),
  ('stretch-full-body-d1', 'stretch-full-body-w1', 1, 'Full body stretch'),
  ('stretch-upper-d1', 'stretch-upper-w1', 1, 'Upper body openers'),
  ('stretch-hips-d1', 'stretch-hips-w1', 1, 'Hip mobility');

-- sets/reps satisfy existing checks. The timer uses duration_seconds.
insert into public.routine_day_exercises (
  routine_day_id, position, exercise_id, sets, rep_min, rep_max, rest_seconds, duration_seconds
) values
  -- Morning mobility ~10 min
  ('stretch-morning-d1', 1, 'cat-cow', 1, 1, 1, 0, 45),
  ('stretch-morning-d1', 2, 'childs-pose', 1, 1, 1, 0, 45),
  ('stretch-morning-d1', 3, 'kneeling-hip-flexor-stretch', 1, 1, 1, 0, 50),
  ('stretch-morning-d1', 4, 'doorway-chest-stretch', 1, 1, 1, 0, 40),
  ('stretch-morning-d1', 5, 'standing-forward-fold', 1, 1, 1, 0, 40),
  ('stretch-morning-d1', 6, 'figure-four-stretch', 1, 1, 1, 0, 50),
  ('stretch-morning-d1', 7, 'open-book-stretch', 1, 1, 1, 0, 50),
  ('stretch-morning-d1', 8, 'calf-wall-stretch', 1, 1, 1, 0, 40),
  -- Desk stretch ~8 min
  ('stretch-desk-d1', 1, 'seated-spinal-twist', 1, 1, 1, 0, 40),
  ('stretch-desk-d1', 2, 'doorway-chest-stretch', 1, 1, 1, 0, 40),
  ('stretch-desk-d1', 3, 'cross-body-shoulder-stretch', 1, 1, 1, 0, 40),
  ('stretch-desk-d1', 4, 'seated-hamstring-stretch', 1, 1, 1, 0, 40),
  ('stretch-desk-d1', 5, 'figure-four-stretch', 1, 1, 1, 0, 40),
  ('stretch-desk-d1', 6, 'cat-cow', 1, 1, 1, 0, 40),
  ('stretch-desk-d1', 7, 'childs-pose', 1, 1, 1, 0, 40),
  -- After leg day ~12 min
  ('stretch-post-leg-d1', 1, 'childs-pose', 1, 1, 1, 0, 45),
  ('stretch-post-leg-d1', 2, 'kneeling-hip-flexor-stretch', 1, 1, 1, 0, 50),
  ('stretch-post-leg-d1', 3, 'figure-four-stretch', 1, 1, 1, 0, 50),
  ('stretch-post-leg-d1', 4, 'butterfly-stretch', 1, 1, 1, 0, 45),
  ('stretch-post-leg-d1', 5, 'seated-hamstring-stretch', 1, 1, 1, 0, 50),
  ('stretch-post-leg-d1', 6, 'ninety-ninety-hip-stretch', 1, 1, 1, 0, 50),
  ('stretch-post-leg-d1', 7, 'standing-quad-stretch', 1, 1, 1, 0, 40),
  ('stretch-post-leg-d1', 8, 'calf-wall-stretch', 1, 1, 1, 0, 40),
  ('stretch-post-leg-d1', 9, 'standing-forward-fold', 1, 1, 1, 0, 45),
  -- Lower back ~10 min
  ('stretch-lower-back-d1', 1, 'childs-pose', 1, 1, 1, 0, 50),
  ('stretch-lower-back-d1', 2, 'cat-cow', 1, 1, 1, 0, 45),
  ('stretch-lower-back-d1', 3, 'prone-press-up', 1, 1, 1, 0, 40),
  ('stretch-lower-back-d1', 4, 'thread-the-needle', 1, 1, 1, 0, 50),
  ('stretch-lower-back-d1', 5, 'seated-spinal-twist', 1, 1, 1, 0, 40),
  ('stretch-lower-back-d1', 6, 'open-book-stretch', 1, 1, 1, 0, 50),
  ('stretch-lower-back-d1', 7, 'kneeling-hip-flexor-stretch', 1, 1, 1, 0, 45),
  ('stretch-lower-back-d1', 8, 'figure-four-stretch', 1, 1, 1, 0, 40),
  -- Full body ~15 min
  ('stretch-full-body-d1', 1, 'cat-cow', 1, 1, 1, 0, 45),
  ('stretch-full-body-d1', 2, 'childs-pose', 1, 1, 1, 0, 45),
  ('stretch-full-body-d1', 3, 'kneeling-hip-flexor-stretch', 1, 1, 1, 0, 50),
  ('stretch-full-body-d1', 4, 'ninety-ninety-hip-stretch', 1, 1, 1, 0, 50),
  ('stretch-full-body-d1', 5, 'figure-four-stretch', 1, 1, 1, 0, 50),
  ('stretch-full-body-d1', 6, 'butterfly-stretch', 1, 1, 1, 0, 40),
  ('stretch-full-body-d1', 7, 'seated-hamstring-stretch', 1, 1, 1, 0, 45),
  ('stretch-full-body-d1', 8, 'standing-forward-fold', 1, 1, 1, 0, 40),
  ('stretch-full-body-d1', 9, 'doorway-chest-stretch', 1, 1, 1, 0, 40),
  ('stretch-full-body-d1', 10, 'thread-the-needle', 1, 1, 1, 0, 45),
  ('stretch-full-body-d1', 11, 'open-book-stretch', 1, 1, 1, 0, 45),
  ('stretch-full-body-d1', 12, 'cross-body-shoulder-stretch', 1, 1, 1, 0, 40),
  -- Upper body ~10 min
  ('stretch-upper-d1', 1, 'cat-cow', 1, 1, 1, 0, 40),
  ('stretch-upper-d1', 2, 'thread-the-needle', 1, 1, 1, 0, 50),
  ('stretch-upper-d1', 3, 'open-book-stretch', 1, 1, 1, 0, 50),
  ('stretch-upper-d1', 4, 'doorway-chest-stretch', 1, 1, 1, 0, 45),
  ('stretch-upper-d1', 5, 'cross-body-shoulder-stretch', 1, 1, 1, 0, 40),
  ('stretch-upper-d1', 6, 'seated-spinal-twist', 1, 1, 1, 0, 40),
  ('stretch-upper-d1', 7, 'childs-pose', 1, 1, 1, 0, 45),
  -- Hips ~12 min
  ('stretch-hips-d1', 1, 'childs-pose', 1, 1, 1, 0, 45),
  ('stretch-hips-d1', 2, 'kneeling-hip-flexor-stretch', 1, 1, 1, 0, 50),
  ('stretch-hips-d1', 3, 'ninety-ninety-hip-stretch', 1, 1, 1, 0, 50),
  ('stretch-hips-d1', 4, 'figure-four-stretch', 1, 1, 1, 0, 50),
  ('stretch-hips-d1', 5, 'butterfly-stretch', 1, 1, 1, 0, 45),
  ('stretch-hips-d1', 6, 'seated-hamstring-stretch', 1, 1, 1, 0, 45),
  ('stretch-hips-d1', 7, 'standing-quad-stretch', 1, 1, 1, 0, 40),
  ('stretch-hips-d1', 8, 'standing-forward-fold', 1, 1, 1, 0, 45);
