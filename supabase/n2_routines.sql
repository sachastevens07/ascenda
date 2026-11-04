-- v2.2 N2: coaching fields on routines, weeks, days and exercises.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets, enrolments or account data.
-- The app also fills these conservatively in code if this file has not been run.

-- 1. Columns
alter table public.routines
  add column if not exists audience_bullets text[];
alter table public.routines
  add column if not exists by_the_end_bullets text[];
alter table public.routines
  add column if not exists split_note text;
alter table public.routines
  add column if not exists progression_note text;

alter table public.routine_weeks
  add column if not exists phase_name text;
alter table public.routine_weeks
  add column if not exists phase_goal text;
alter table public.routine_weeks
  add column if not exists is_lighter_week boolean;

update public.routine_weeks
set is_lighter_week = false
where is_lighter_week is null;

alter table public.routine_weeks
  alter column is_lighter_week set default false;

alter table public.routine_days
  add column if not exists focus text;
alter table public.routine_days
  add column if not exists warmup jsonb;
alter table public.routine_days
  add column if not exists coach_note text;
alter table public.routine_days
  add column if not exists finisher text;

alter table public.routine_day_exercises
  add column if not exists role text;
alter table public.routine_day_exercises
  add column if not exists target_rir smallint;
alter table public.routine_day_exercises
  add column if not exists tempo text;
alter table public.routine_day_exercises
  add column if not exists progression_rule text;
alter table public.routine_day_exercises
  add column if not exists load_increment_kg numeric;
alter table public.routine_day_exercises
  add column if not exists notes text;
alter table public.routine_day_exercises
  add column if not exists alternative_exercise_ids text[];
alter table public.routine_day_exercises
  add column if not exists superset_group text;

alter table public.routine_day_exercises drop constraint if exists routine_day_exercises_role_check;
alter table public.routine_day_exercises add constraint routine_day_exercises_role_check
  check (role is null or role in ('main', 'secondary', 'accessory', 'core', 'finisher'));

alter table public.routine_day_exercises drop constraint if exists routine_day_exercises_rir_check;
alter table public.routine_day_exercises add constraint routine_day_exercises_rir_check
  check (target_rir is null or target_rir between 0 and 5);

alter table public.routine_day_exercises drop constraint if exists routine_day_exercises_progression_check;
alter table public.routine_day_exercises add constraint routine_day_exercises_progression_check
  check (progression_rule is null or progression_rule in ('load', 'reps', 'time'));

-- 2. Strength routine copy. Stretch rows are left null.
update public.routines set
  audience_bullets = array[
    'New to the gym, or coming back and wanting a calmer start',
    'Happy to train three days a week for about 40 minutes',
    'Fine with starting in one dumbbell spot'
  ],
  by_the_end_bullets = array[
    'Know a simple full-body session you can repeat without guessing',
    'Have used dumbbells, then a few machines, then two basic free-weight lifts',
    'Have a log of weights you can add to, a little at a time'
  ],
  split_note = 'Three full-body days keep every pattern in the week without a split to remember. You stay in one area at first, then add kit as it feels familiar.',
  progression_note = 'Main lifts add load when you hit the top of the rep range on set 1. Accessories add reps first. Start with a weight you could lift three more times.'
where id = 'gym-confidence-6';

update public.routines set
  audience_bullets = array[
    'Want a simple three-day gym week',
    'Beginner or returning, with access to a full gym',
    'Prefer the same three days for eight weeks'
  ],
  by_the_end_bullets = array[
    'Have a repeatable squat, hinge, push, pull and single-leg pattern',
    'Know when to add a little load from your own log',
    'Have one lighter week before the last checkpoint'
  ],
  split_note = 'Full body three days a week covers squat, hinge, push, pull, single-leg and core in every week. The days stay the same so you can learn them well.',
  progression_note = 'Main lifts use double progression with a small load jump. Accessories add reps first. Week 7 is lighter. Keep two or three reps in the tank.'
where id = 'full-body-3';

update public.routines set
  audience_bullets = array[
    'Want to stay in the dumbbell area',
    'Prefer not to hunt for machines or a rack',
    'Training three days a week'
  ],
  by_the_end_bullets = array[
    'Have two or three dumbbell sessions you could do in a quiet corner',
    'Know how to swap if a bench is taken',
    'Have logged six weeks of the same movements'
  ],
  split_note = 'Full body, one spot. Every session uses dumbbells and floor work so you do not need to move around the gym.',
  progression_note = 'Add 1 to 2 kg on main dumbbell lifts when you hit the top of the range. Accessories add reps first.'
where id = 'one-spot-6';

update public.routines set
  audience_bullets = array[
    'Train when the gym is busy',
    'Happy to use machines and cables first',
    'Want a plan that always has a next option'
  ],
  by_the_end_bullets = array[
    'Know which machines cover squat, hinge, push and pull',
    'Have swaps ready if a machine is taken',
    'Have six weeks of logged machine work'
  ],
  split_note = 'Machine-first full body. You can queue one or two machines and still finish the session without the free-weight floor.',
  progression_note = 'Add a plate on machines when you hit the top of the range. Leave two or three reps in the tank. Never grind a set.'
where id = 'busy-gym-6';

update public.routines set
  audience_bullets = array[
    'Already know the main machines and free weights',
    'Can train four days a week',
    'Want more upper and lower volume than a full-body week'
  ],
  by_the_end_bullets = array[
    'Have a clear upper and lower pair you can repeat',
    'Have practised adding load on the main lifts',
    'Have one lighter week before the last checkpoint'
  ],
  split_note = 'Two upper and two lower days spread the work so each session can go a little deeper. Core still sits on both halves of the week.',
  progression_note = 'Main lifts add 2.5 kg on barbell work or 1 to 2 kg on dumbbells when you hit the top of the range. Week 7 is lighter.'
where id = 'upper-lower-4';

update public.routines set
  audience_bullets = array[
    'Want more glute and leg work, with one upper day to keep the week balanced',
    'Comfortable in a full gym',
    'Training three days a week'
  ],
  by_the_end_bullets = array[
    'Have a lower-body session you could repeat without a script',
    'Have kept a push and pull in the week so the upper body is not ignored',
    'Have one lighter week before the last checkpoint'
  ],
  split_note = 'This week is deliberately lower-body heavy: two glute and leg days and one upper day. Squat, hinge and single-leg still show up twice.',
  progression_note = 'Hip thrusts and squats add load first. Accessories add reps. Leave about two reps in the tank.'
where id = 'lower-body-3';

update public.routines set
  audience_bullets = array[
    'Busy weeks, or a gentler two-day start',
    'Want full-body coverage without a four-day split',
    'Happy to repeat the same two days for eight weeks'
  ],
  by_the_end_bullets = array[
    'Have two sessions that cover the main patterns',
    'Know how to add a little load from your log',
    'Have taken a lighter week before the last checkpoint'
  ],
  split_note = 'Two full-body days keep squat, hinge, push, pull, single-leg and core in the week without extra gym trips.',
  progression_note = 'Go up on main lifts when set 1 hits the top of the range. Week 7 is lighter. Keep two or three reps in reserve.'
where id = 'full-body-2';

update public.routines set
  audience_bullets = array[
    'Training at home with bands and bodyweight',
    'Small space, no gym required',
    'Three sessions a week'
  ],
  by_the_end_bullets = array[
    'Have a band and bodyweight full-body session you can do anywhere',
    'Know how to make a move harder with tempo or a stronger band',
    'Have six weeks of showing up without kit anxiety'
  ],
  split_note = 'Full body at home. The week still covers squat, hinge, push, pull, single-leg and core using bands and the floor.',
  progression_note = 'Add reps first, then a stronger band or a slower lower. Holds get a few extra seconds when they feel solid.'
where id = 'home-strength-6';

update public.routines set
  audience_bullets = array[
    'Already know the machines',
    'Want a block that focuses on push and pull',
    'Happy that legs are not the priority this block'
  ],
  by_the_end_bullets = array[
    'Have a push day, a pull day and a mixed upper day you can repeat',
    'Have practised adding load on presses and rows',
    'Know this block is deliberately upper-focused, not a full-body week'
  ],
  split_note = 'This plan is deliberately focused on the upper body. Legs are not trained here. Pair it with walks or a lower-body plan later if you want more balance.',
  progression_note = 'Main presses and rows add load when you hit the top of the range. Arm and raise work adds reps first. Leave one or two reps in the tank.'
where id = 'upper-body-6';

update public.routines set
  audience_bullets = array[
    'Want a glute and leg focus, kept beginner-friendly',
    'Have a full gym',
    'Training three days a week'
  ],
  by_the_end_bullets = array[
    'Have a hip-thrust and squat session you can repeat',
    'Have kept a little upper work so the week is not only lower body',
    'Have six weeks of logged lower-body work'
  ],
  split_note = 'This week is deliberately glute and leg focused. Upper-body work is lighter on purpose. Hinge, squat and single-leg still appear each week.',
  progression_note = 'Hip thrusts and squats add load first. Accessories add reps. Start lighter than you think and leave two or three reps in the tank.'
where id = 'glute-builder-6';

update public.routines set
  audience_bullets = array[
    'Prefer machines and a smaller range of motion',
    'Want to skip lunges and barbell squats',
    'Will skip anything that hurts and still finish the session'
  ],
  by_the_end_bullets = array[
    'Have a machine full-body session that stays comfortable',
    'Know you can swap or skip without abandoning the week',
    'Have six weeks of training without chasing heavy singles'
  ],
  split_note = 'Machine-led full body with no lunges or barbell squats. The week still covers squat, hinge, push, pull and core with supported kit.',
  progression_note = 'Add a plate only when the top of the range feels smooth. Never train through pain. Leave three reps in the tank.'
where id = 'joint-friendly-6';

update public.routines set
  audience_bullets = array[
    'Want a short full-body block',
    'Three gym days a week for four weeks',
    'Happy to repeat or switch to a longer plan after'
  ],
  by_the_end_bullets = array[
    'Have three full-body days you could run again',
    'Have a first checkpoint of a few key lifts',
    'Know whether you want another short block or a longer plan'
  ],
  split_note = 'Four weeks of the same three full-body days. Short on purpose, so you can finish a block without a long commitment.',
  progression_note = 'Add load on main lifts when you hit the top of the range. Keep two or three reps in the tank. No maximal testing.'
where id = 'short-cycle-4';

update public.routines set
  audience_bullets = array[
    'The basic barbell lifts already feel familiar',
    'Want squat, bench, hip thrust and Romanian deadlift as the spine of the week',
    'Can train three days a week for about 50 minutes'
  ],
  by_the_end_bullets = array[
    'Have logged eight weeks on the same four main lifts',
    'Have a midpoint and end checkpoint to compare',
    'Have taken a lighter week before the last test week'
  ],
  split_note = 'Three full-ish days built around squat, hinge, push and a hip thrust. Accessories fill gaps. This is for people who already know the setup.',
  progression_note = 'Main barbell lifts add 2.5 kg when set 1 hits the top of the range. Accessories add reps. Week 7 is about 60 to 70 percent of the usual sets.'
where id = 'barbell-strength-8';

update public.routines set
  audience_bullets = array[
    'Want the dumbbell area twice a week',
    'Prefer a quiet, repeatable pair of sessions',
    'Happy with eight weeks of the same two days'
  ],
  by_the_end_bullets = array[
    'Have two one-spot sessions you could do anywhere there are dumbbells',
    'Know how to add 1 to 2 kg from your log',
    'Have taken a lighter week before the last checkpoint'
  ],
  split_note = 'Two full-body dumbbell days. You stay in one spot. The week still covers squat, hinge, push, pull, single-leg and core.',
  progression_note = 'Add 1 to 2 kg on main dumbbell lifts when you hit the top of the range. Week 7 is lighter. Leave two or three reps in the tank.'
where id = 'one-spot-2';

-- 3. Phase names. Gym Confidence uses its staged kit. 8-week plans get a lighter week before the last week.
-- 4-week plans stay Learn then Build (no extra Test week).
update public.routine_weeks w
set
  phase_name = case
    when w.routine_id = 'gym-confidence-6' and w.week_number <= 2 then 'Learn the movements'
    when w.routine_id = 'gym-confidence-6' and w.week_number <= 4 then 'Add machines'
    when w.routine_id = 'gym-confidence-6' then 'Add free weights'
    when w.week_number <= 2 then 'Learn the movements'
    when r.length_weeks <= 4 then 'Build'
    when r.length_weeks >= 8 and w.week_number = r.length_weeks - 1 then 'Lighter week'
    when w.week_number = r.length_weeks then 'Test'
    else 'Build'
  end,
  phase_goal = case
    when w.routine_id = 'gym-confidence-6' and w.week_number <= 2 then 'Stay in one dumbbell spot and learn the session.'
    when w.routine_id = 'gym-confidence-6' and w.week_number <= 4 then 'Keep the same patterns on a few machines.'
    when w.routine_id = 'gym-confidence-6' then 'Try two simple free-weight lifts and re-test.'
    when w.week_number <= 2 and r.length_weeks <= 4 then 'Find starting weights and tidy the path.'
    when w.week_number <= 2 and r.length_weeks >= 8 then 'Settle into the days and starting loads.'
    when w.week_number <= 2 then 'Find starting weights and learn the days.'
    when r.length_weeks <= 4 then 'Add a little when the top of the range feels smooth.'
    when r.length_weeks >= 8 and w.week_number = r.length_weeks - 1 then 'Fewer sets, same weights. Arrive fresh for the last week.'
    when r.length_weeks >= 8 and w.week_number = r.length_weeks then 'Re-test two or three key lifts. Leave reps in the tank.'
    when w.week_number = r.length_weeks then 'Repeat the key lifts and notice what has changed.'
    when r.length_weeks >= 8 then 'Add load or reps when you earn it.'
    else 'Add a little when the top of the range feels smooth.'
  end,
  is_lighter_week = (r.length_weeks >= 8 and w.week_number = r.length_weeks - 1)
from public.routines r
where r.id = w.routine_id
  and r.id in (
    'gym-confidence-6', 'full-body-3', 'one-spot-6', 'busy-gym-6', 'upper-lower-4',
    'lower-body-3', 'full-body-2', 'home-strength-6', 'upper-body-6', 'glute-builder-6',
    'joint-friendly-6', 'short-cycle-4', 'barbell-strength-8', 'one-spot-2'
  );

-- 4. Day focus, warm-up and coach note.
update public.routine_days d
set
  focus = case
    when d.name ilike '%upper%' and d.name ilike '%lower%' then 'Full body'
    when d.name ilike '%upper%' then 'Upper body'
    when d.name ilike '%lower%' or d.name ilike '%glute%' then 'Glutes and legs'
    when d.name ilike '%push%' then 'Push'
    when d.name ilike '%pull%' then 'Pull'
    when d.name ilike '%one spot%' then 'Full body, one spot'
    else 'Full body'
  end,
  coach_note = case
    when r.difficulty = 'beginner' and d.name ilike '%one spot%'
      then 'Stay in your spot. The first set of each lift is for finding a weight you could still lift three more times.'
    when r.difficulty = 'beginner'
      then 'Move kindly. Find a weight you could lift three more times, and stop if anything feels sharp.'
    when d.name ilike '%lower%' or d.name ilike '%glute%'
      then 'Own the hip hinge and the squat. Keep the last two reps tidy rather than heavy.'
    when d.name ilike '%upper%' or d.name ilike '%push%' or d.name ilike '%pull%'
      then 'Leave a little in the tank on the main press and row. Shoulders stay down and the path stays quiet.'
    else 'Same session as last time. Add load only if the top of the range felt smooth.'
  end,
  warmup = case
    when r.id = 'home-strength-6' then
      '[{"text":"Easy march on the spot","seconds":120},{"text":"Cat-cow or shoulder rolls","reps":8},{"text":"Glute bridge","reps":8},{"text":"First move: a lighter round of the same exercise"}]'::jsonb
    when r.id = 'gym-confidence-6' or r.id like 'one-spot%' then
      '[{"text":"Easy march in your spot","seconds":90},{"text":"Arm circles","reps":10},{"text":"Bodyweight squat","reps":8},{"text":"First lift: two light warm-up sets"}]'::jsonb
    else
      '[{"text":"Easy march, bike or row","seconds":120},{"text":"Arm circles","reps":10},{"text":"Bodyweight squat","reps":8},{"text":"First main lift: two light warm-up sets"}]'::jsonb
  end
from public.routine_weeks w
join public.routines r on r.id = w.routine_id
where d.routine_week_id = w.id
  and r.id in (
    'gym-confidence-6', 'full-body-3', 'one-spot-6', 'busy-gym-6', 'upper-lower-4',
    'lower-body-3', 'full-body-2', 'home-strength-6', 'upper-body-6', 'glute-builder-6',
    'joint-friendly-6', 'short-cycle-4', 'barbell-strength-8', 'one-spot-2'
  );

-- 5. Roles, RIR and progression. Core moves stay core. First two slots are main on longer days.
update public.routine_day_exercises e
set
  role = case
    when e.exercise_id in ('dead-bug', 'plank', 'side-plank', 'cable-pallof-press', 'bird-dog', 'glute-bridge', 'frog-pump')
      or x.primary_muscle = 'core'
      then 'core'
    when e.position = 1 then 'main'
    when e.position = 2 and (
      select count(*) from public.routine_day_exercises e2 where e2.routine_day_id = e.routine_day_id
    ) >= 4 then 'main'
    when e.position = 2 then 'secondary'
    when e.position = 3 and (
      select count(*) from public.routine_day_exercises e2 where e2.routine_day_id = e.routine_day_id
    ) >= 5 then 'secondary'
    else 'accessory'
  end,
  target_rir = case when r.difficulty = 'beginner' then 3 else 2 end,
  progression_rule = case
    when e.duration_seconds is not null and e.duration_seconds > 0 then 'time'
    when e.exercise_id in ('dead-bug', 'plank', 'side-plank', 'cable-pallof-press', 'bird-dog', 'glute-bridge', 'frog-pump')
      or x.primary_muscle = 'core' then 'reps'
    when e.position = 1 then 'load'
    when e.position = 2 and (
      select count(*) from public.routine_day_exercises e2 where e2.routine_day_id = e.routine_day_id
    ) >= 4 then 'load'
    else 'reps'
  end,
  load_increment_kg = case
    when x.equipment in ('barbell', 'machine', 'cable') then 2.5
    when x.equipment in ('dumbbell', 'kettlebell') then 2
    else 2
  end,
  tempo = case
    when r.difficulty = 'beginner'
      and e.position = 1
      and x.primary_muscle is distinct from 'core'
      and e.exercise_id not in ('dead-bug', 'plank', 'side-plank', 'cable-pallof-press', 'bird-dog', 'glute-bridge', 'frog-pump')
      then '3-second lowering'
    else null
  end
from public.routine_days d
join public.routine_weeks w on w.id = d.routine_week_id
join public.routines r on r.id = w.routine_id
join public.exercises x on x.id = e.exercise_id
where e.routine_day_id = d.id
  and r.id in (
    'gym-confidence-6', 'full-body-3', 'one-spot-6', 'busy-gym-6', 'upper-lower-4',
    'lower-body-3', 'full-body-2', 'home-strength-6', 'upper-body-6', 'glute-builder-6',
    'joint-friendly-6', 'short-cycle-4', 'barbell-strength-8', 'one-spot-2'
  );
