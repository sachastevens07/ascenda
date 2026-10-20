-- Exercise library: table, security rules, photo storage and exercise data.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: it updates existing exercises instead of duplicating them,
-- and never removes photos you have linked.

create table if not exists public.exercises (
  id text primary key,
  name text not null,
  primary_muscle text not null,
  secondary_muscles text[] not null default '{}',
  equipment text not null,
  -- A file path in the exercise-media bucket (set automatically on upload) or a full https URL.
  media_url text,
  cues text[] not null,
  location_hint text not null,
  created_at timestamptz not null default now()
);

-- How much to add (in kg) when she's earned a heavier weight. Null for bodyweight and band.
-- Negative for assisted machines, where progress means taking help away.
alter table public.exercises add column if not exists weight_increase_kg numeric;
alter table public.exercises drop constraint if exists exercises_weight_increase_check;

-- Allowed values. Keep these lists in step with src/lib/exercises.ts.
alter table public.exercises drop constraint if exists exercises_primary_muscle_check;
alter table public.exercises add constraint exercises_primary_muscle_check check (
  primary_muscle in ('glutes', 'quads', 'hamstrings', 'adductors', 'calves', 'chest', 'back', 'shoulders', 'biceps', 'triceps', 'core')
);
alter table public.exercises drop constraint if exists exercises_secondary_muscles_check;
alter table public.exercises add constraint exercises_secondary_muscles_check check (
  secondary_muscles <@ array['glutes', 'quads', 'hamstrings', 'adductors', 'calves', 'chest', 'back', 'shoulders', 'biceps', 'triceps', 'core']::text[]
);
alter table public.exercises drop constraint if exists exercises_equipment_check;
alter table public.exercises add constraint exercises_equipment_check check (
  equipment in ('barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'band', 'bodyweight')
);
alter table public.exercises drop constraint if exists exercises_cues_check;
alter table public.exercises add constraint exercises_cues_check check (cardinality(cues) = 3);

-- Signed-in users can read the library. Nobody can change it from the app.
alter table public.exercises enable row level security;

drop policy if exists "Signed-in users can read exercises" on public.exercises;
create policy "Signed-in users can read exercises" on public.exercises
  for select to authenticated using (true);

grant select on public.exercises to authenticated;

-- Photos: a public storage bucket. Upload a file named after an exercise id
-- (e.g. goblet-squat.jpg) and it is linked to that exercise automatically.
-- Deleting the file unlinks it. Only upload media you are licensed to use commercially.
insert into storage.buckets (id, name, public)
values ('exercise-media', 'exercise-media', true)
on conflict (id) do update set public = true;

create or replace function public.exercise_id_from_media_path(path text)
returns text
language sql
immutable
set search_path = ''
as $$
  -- "folder/Goblet_Squat.JPG" -> "goblet-squat"
  select regexp_replace(lower(regexp_replace(path, '^.*/|\.[^./]+$', '', 'g')), '[\s_]+', '-', 'g');
$$;

create or replace function public.sync_exercise_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.bucket_id = 'exercise-media' then
    update public.exercises set media_url = null where media_url = old.name;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.bucket_id = 'exercise-media' then
    update public.exercises
    set media_url = new.name
    where id = public.exercise_id_from_media_path(new.name);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists on_exercise_media_change on storage.objects;
create trigger on_exercise_media_change
  after insert or update or delete on storage.objects
  for each row execute function public.sync_exercise_media();

insert into public.exercises (id, name, primary_muscle, secondary_muscles, equipment, cues, location_hint) values

-- Quads
('barbell-back-squat', 'Barbell Back Squat', 'quads', array['glutes', 'hamstrings', 'core'], 'barbell',
  array['Take a big breath and brace your stomach before each rep.', 'Sit down between your hips, knees following the line of your toes.', 'Push the floor away and stand tall at the top.'],
  'The squat rack: a tall steel frame with adjustable hooks and safety bars, in the free-weights area. Set the safety bars just below your lowest squat.'),
('goblet-squat', 'Goblet Squat', 'quads', array['glutes', 'core'], 'dumbbell',
  array['Hold one dumbbell upright against your chest, elbows tucked in.', 'Sit straight down with your chest proud and knees over your toes.', 'Drive through your whole foot to stand back up.'],
  'The dumbbell rack, usually along a mirrored wall. Do it on any clear patch of floor nearby.'),
('leg-press', 'Leg Press', 'quads', array['glutes', 'hamstrings'], 'machine',
  array['Place your feet hip-width apart in the middle of the platform.', 'Lower until your knees are bent to about a right angle, keeping your lower back on the pad.', 'Press away smoothly without snapping your knees straight.'],
  'The machine area: a reclined seat facing a large, angled foot platform.'),
('leg-extension', 'Leg Extension', 'quads', array[]::text[], 'machine',
  array['Line your knees up with the machine''s pivot point.', 'Straighten your legs and squeeze your thighs for a second at the top.', 'Lower slowly rather than letting the weights drop.'],
  'The machine area: an upright seat with a padded bar that sits in front of your lower shins.'),
('bulgarian-split-squat', 'Bulgarian Split Squat', 'quads', array['glutes'], 'dumbbell',
  array['Rest the top of your back foot on a bench behind you.', 'Lower until your front thigh is roughly level with the floor.', 'Keep your chest tall and push up through your front foot.'],
  'A flat bench plus dumbbells from the rack. Start with no weight until you feel steady.'),
('bodyweight-squat', 'Bodyweight Squat', 'quads', array['glutes'], 'bodyweight',
  array['Stand with feet shoulder-width apart, toes turned out slightly.', 'Reach your arms forward as you sit back and down.', 'Stand up fully and squeeze your glutes at the top.'],
  'Anywhere with a little space: the stretching area or at home.'),
('dumbbell-reverse-lunge', 'Dumbbell Reverse Lunge', 'quads', array['glutes', 'hamstrings'], 'dumbbell',
  array['Step one foot back and lower your back knee gently towards the floor.', 'Keep your front knee stacked over the middle of your foot.', 'Push through your front foot to bring yourself back to standing.'],
  'The dumbbell rack, plus a strip of clear floor. Try it without weights first.'),

-- Glutes
('barbell-hip-thrust', 'Barbell Hip Thrust', 'glutes', array['hamstrings'], 'barbell',
  array['Rest your upper back on the edge of a bench with the bar across your hips.', 'Tuck your chin and drive up through your heels.', 'Squeeze your glutes at the top without arching your lower back.'],
  'Free-weights area: a flat bench, a barbell and a bar pad for comfort (often hung near the racks). Some gyms have a dedicated hip-thrust machine.'),
('glute-bridge', 'Glute Bridge', 'glutes', array['hamstrings'], 'bodyweight',
  array['Lie on your back with knees bent and feet flat, hip-width apart.', 'Push through your heels to lift your hips until your body forms a straight line.', 'Pause at the top, then lower slowly.'],
  'The stretching area: grab a mat. Works at home too.'),
('cable-glute-kickback', 'Cable Glute Kickback', 'glutes', array['hamstrings'], 'cable',
  array['Hold the frame and hinge forward slightly from your hips.', 'Kick your leg straight back, leading with your heel.', 'Bring it back under control rather than swinging.'],
  'A cable machine set to its lowest position. Ankle straps usually hang on a hook or rack beside the cables.'),
('hip-abduction-machine', 'Hip Abduction Machine', 'glutes', array[]::text[], 'machine',
  array['Sit tall with your back against the pad.', 'Push your knees outwards against the pads.', 'Pause, then let them come back together slowly.'],
  'The machine area: a seat with pads on the outside of your knees. Its twin, with pads on the inside, works the inner thighs.'),
('dumbbell-step-up', 'Dumbbell Step-Up', 'glutes', array['quads'], 'dumbbell',
  array['Place your whole foot on a sturdy box or bench.', 'Drive through that heel to stand up tall on top.', 'Step down slowly, keeping control.'],
  'The dumbbell rack, plus a plyo box (often stacked in the functional area) or a flat bench. Start low.'),
('kettlebell-swing', 'Kettlebell Swing', 'glutes', array['hamstrings', 'core'], 'kettlebell',
  array['Hinge at your hips, sending your bum back with a flat back.', 'Snap your hips forwards to float the bell up to chest height.', 'Keep your arms relaxed: your hips do the work.'],
  'The kettlebell rack, often in the functional or stretching area. Start light and leave plenty of space in front of you.'),
('kettlebell-deadlift', 'Kettlebell Deadlift', 'glutes', array['hamstrings', 'quads'], 'kettlebell',
  array['Stand with the kettlebell on the floor between your feet.', 'Push your hips back and grip the handle with a flat back.', 'Stand up tall by squeezing your glutes, then lower with control.'],
  'The kettlebell rack. A great first step before the barbell deadlift.'),

-- Hamstrings
('barbell-romanian-deadlift', 'Barbell Romanian Deadlift', 'hamstrings', array['glutes', 'back'], 'barbell',
  array['Start standing, with soft knees and the bar against your thighs.', 'Push your hips back, sliding the bar down your legs.', 'Stop when you feel a stretch in your hamstrings, then squeeze your glutes to stand.'],
  'Free-weights area: a barbell from a rack, or a pre-loaded fixed-weight bar from the rack of short bars.'),
('dumbbell-romanian-deadlift', 'Dumbbell Romanian Deadlift', 'hamstrings', array['glutes', 'back'], 'dumbbell',
  array['Hold the dumbbells in front of your thighs with soft knees.', 'Push your hips back and keep the weights close to your legs.', 'Feel the stretch, then drive your hips forward to stand.'],
  'The dumbbell rack. Use a clear patch of floor nearby.'),
('lying-leg-curl', 'Lying Leg Curl', 'hamstrings', array['calves'], 'machine',
  array['Lie face down with your knees just off the end of the bench.', 'Curl your heels up towards your bum.', 'Lower slowly all the way down.'],
  'The machine area: a bench you lie face down on, with a padded roller behind your ankles.'),
('seated-leg-curl', 'Seated Leg Curl', 'hamstrings', array[]::text[], 'machine',
  array['Adjust the thigh pad so it holds your legs snugly.', 'Pull your heels down and back under the seat.', 'Return slowly without letting the weights touch down.'],
  'The machine area: a seat with one pad on top of your thighs and a roller behind your ankles.'),
('barbell-deadlift', 'Barbell Deadlift', 'hamstrings', array['glutes', 'back', 'quads'], 'barbell',
  array['Stand with the bar over the middle of your feet.', 'Grip the bar, brace your stomach and keep your back flat.', 'Push the floor away and stand tall, keeping the bar close.'],
  'A lifting platform (the wooden or rubber square) or open floor in the free-weights area. Use large plates so the bar starts at mid-shin.'),

-- Calves
('standing-calf-raise', 'Standing Calf Raise', 'calves', array[]::text[], 'machine',
  array['Stand with the balls of your feet on the edge of the platform.', 'Rise up as high as you can onto your toes.', 'Lower slowly until you feel a stretch in your calves.'],
  'The machine area: shoulder pads above a small foot block. No machine? Hold a dumbbell and use a step.'),
('bodyweight-calf-raise', 'Bodyweight Calf Raise', 'calves', array[]::text[], 'bodyweight',
  array['Stand on a step with your heels hanging off the edge.', 'Rise up onto your toes and pause.', 'Lower your heels slowly below the step.'],
  'Any step or sturdy platform. Hold a wall or rail for balance.'),

-- Chest
('barbell-bench-press', 'Barbell Bench Press', 'chest', array['triceps', 'shoulders'], 'barbell',
  array['Feet flat on the floor and shoulder blades squeezed together.', 'Lower the bar with control to the middle of your chest.', 'Press up until your arms are straight over your shoulders.'],
  'A flat bench with a built-in rack in the free-weights area. Set the safety arms or ask someone to spot you.'),
('dumbbell-bench-press', 'Dumbbell Bench Press', 'chest', array['triceps', 'shoulders'], 'dumbbell',
  array['Lie back with a dumbbell in each hand above your chest.', 'Lower them to the sides of your chest, elbows at about 45 degrees.', 'Press up and bring the dumbbells together over your chest.'],
  'Dumbbells from the rack plus a flat bench. Sit with them on your thighs first, then lie back.'),
('incline-dumbbell-press', 'Incline Dumbbell Press', 'chest', array['shoulders', 'triceps'], 'dumbbell',
  array['Set the bench to a low incline, one or two notches up.', 'Lower the dumbbells to your upper chest with control.', 'Press up and slightly inwards.'],
  'Dumbbells from the rack plus an adjustable bench.'),
('machine-chest-press', 'Machine Chest Press', 'chest', array['triceps', 'shoulders'], 'machine',
  array['Set the seat so the handles line up with the middle of your chest.', 'Press forward until your arms are almost straight.', 'Let the handles come back slowly.'],
  'The machine area: an upright seat with handles at chest height.'),
('push-up', 'Push-Up', 'chest', array['triceps', 'shoulders', 'core'], 'bodyweight',
  array['Hands slightly wider than your shoulders, body in a straight line.', 'Lower your chest towards the floor, elbows angled back.', 'Push away until your arms are straight.'],
  'Anywhere. To make it easier, put your hands on a bench, a box or a wall.'),
('cable-chest-fly', 'Cable Chest Fly', 'chest', array['shoulders'], 'cable',
  array['Set both pulleys at shoulder height and take a step forward.', 'With a slight bend in your elbows, bring your hands together in front of your chest.', 'Open your arms slowly until you feel a stretch.'],
  'A cable machine with two towers (sometimes called a cable crossover), with a single handle on each side.'),

-- Back
('lat-pulldown', 'Lat Pulldown', 'back', array['biceps'], 'cable',
  array['Grip the bar slightly wider than your shoulders and tuck your knees under the pads.', 'Pull the bar down to your upper chest, leading with your elbows.', 'Let it rise slowly until your arms are straight.'],
  'The cable area: a seat with knee pads and a long bar hanging overhead.'),
('seated-cable-row', 'Seated Cable Row', 'back', array['biceps'], 'cable',
  array['Sit tall with your feet on the platform and knees slightly bent.', 'Pull the handle to your stomach, squeezing your shoulder blades together.', 'Reach forward slowly without rounding your back.'],
  'The cable area: a low bench with a foot platform and a handle at waist height.'),
('one-arm-dumbbell-row', 'One-Arm Dumbbell Row', 'back', array['biceps'], 'dumbbell',
  array['Rest one knee and hand on a bench, keeping your back flat.', 'Pull the dumbbell up towards your hip.', 'Lower it until your arm is straight.'],
  'A dumbbell from the rack plus a flat bench.'),
('barbell-bent-over-row', 'Barbell Bent-Over Row', 'back', array['biceps', 'hamstrings'], 'barbell',
  array['Hinge forward from your hips with a flat back and soft knees.', 'Pull the bar to your lower ribs.', 'Lower it with control, keeping your body still.'],
  'Free-weights area: a barbell from a rack, or a fixed-weight bar.'),
('assisted-pull-up', 'Assisted Pull-Up', 'back', array['biceps'], 'machine',
  array['Kneel or stand on the platform and grip the handles.', 'Pull yourself up until your chin passes the handles.', 'Lower slowly until your arms are straight.'],
  'The machine area: a tall frame with handles at the top and a knee pad or platform. More weight on the stack means more help.'),
('superman', 'Superman', 'back', array['glutes'], 'bodyweight',
  array['Lie face down with your arms stretched out in front.', 'Lift your arms, chest and legs a little off the floor.', 'Hold for a breath, then lower gently.'],
  'The stretching area: grab a mat. Works at home too.'),

-- Shoulders
('dumbbell-shoulder-press', 'Dumbbell Shoulder Press', 'shoulders', array['triceps'], 'dumbbell',
  array['Sit upright with the dumbbells at shoulder height, palms forward.', 'Press them up until your arms are straight overhead.', 'Lower slowly back to your shoulders.'],
  'Dumbbells from the rack plus an adjustable bench set upright.'),
('dumbbell-lateral-raise', 'Dumbbell Lateral Raise', 'shoulders', array[]::text[], 'dumbbell',
  array['Stand tall with light dumbbells by your sides.', 'Raise your arms out to the sides until they reach shoulder height.', 'Lower slowly. Lighter than you think is perfect here.'],
  'The lighter end of the dumbbell rack.'),
('cable-face-pull', 'Cable Face Pull', 'shoulders', array['back'], 'cable',
  array['Set the pulley at head height with a rope attachment.', 'Pull the rope towards your face, hands moving apart.', 'Squeeze your upper back, then return slowly.'],
  'A cable machine. The rope attachment usually hangs on a rack or hook nearby.'),
('barbell-overhead-press', 'Barbell Overhead Press', 'shoulders', array['triceps', 'core'], 'barbell',
  array['Start with the bar on your upper chest, hands just outside your shoulders.', 'Squeeze your glutes and press the bar straight up.', 'Move your head back slightly to let the bar pass, then finish with it overhead.'],
  'A squat rack with the hooks set at chest height.'),
('machine-shoulder-press', 'Machine Shoulder Press', 'shoulders', array['triceps'], 'machine',
  array['Set the seat so the handles start at shoulder height.', 'Press up until your arms are almost straight.', 'Lower with control.'],
  'The machine area: an upright seat with handles beside your shoulders.'),

-- Biceps
('dumbbell-biceps-curl', 'Dumbbell Biceps Curl', 'biceps', array[]::text[], 'dumbbell',
  array['Stand tall with your elbows tucked into your sides.', 'Curl the dumbbells up, turning your palms to face you.', 'Lower slowly without swinging.'],
  'The dumbbell rack.'),
('cable-biceps-curl', 'Cable Biceps Curl', 'biceps', array[]::text[], 'cable',
  array['Set the pulley low with a straight bar or rope.', 'Keep your elbows by your sides as you curl up.', 'Lower slowly to the start.'],
  'A cable machine at its lowest setting.'),
('dumbbell-hammer-curl', 'Dumbbell Hammer Curl', 'biceps', array[]::text[], 'dumbbell',
  array['Hold the dumbbells with your palms facing each other.', 'Curl up, keeping your elbows still.', 'Lower with control.'],
  'The dumbbell rack.'),

-- Triceps
('cable-triceps-pushdown', 'Cable Triceps Pushdown', 'triceps', array[]::text[], 'cable',
  array['Set the pulley high and grip the rope or bar.', 'Keep your elbows pinned to your sides and push down until your arms are straight.', 'Let it rise slowly to about chest height.'],
  'A cable machine at its highest setting.'),
('overhead-triceps-extension', 'Overhead Triceps Extension', 'triceps', array[]::text[], 'dumbbell',
  array['Hold one dumbbell with both hands above your head.', 'Lower it behind your head by bending your elbows.', 'Straighten your arms to lift it back up.'],
  'A dumbbell from the rack. Sit on a bench with a back rest if you like.'),
('bench-dip', 'Bench Dip', 'triceps', array['chest', 'shoulders'], 'bodyweight',
  array['Sit on the edge of a bench, hands beside your hips, and slide forward off it.', 'Bend your elbows to lower yourself a short way.', 'Press back up until your arms are straight.'],
  'Any flat bench, or a sturdy chair at home. Keep your knees bent to make it easier.'),

-- Core
('plank', 'Plank', 'core', array['shoulders'], 'bodyweight',
  array['Forearms on the floor, elbows under your shoulders.', 'Make a straight line from your head to your heels.', 'Breathe steadily and stop before your hips sag.'],
  'The stretching area: grab a mat.'),
('dead-bug', 'Dead Bug', 'core', array[]::text[], 'bodyweight',
  array['Lie on your back, arms up and knees bent over your hips.', 'Slowly lower the opposite arm and leg towards the floor.', 'Keep your lower back gently pressed into the floor, then swap sides.'],
  'The stretching area: grab a mat.'),
('kettlebell-suitcase-carry', 'Kettlebell Suitcase Carry', 'core', array['shoulders'], 'kettlebell',
  array['Pick up one kettlebell at your side, like a suitcase.', 'Walk tall without leaning towards the weight.', 'Swap hands and repeat.'],
  'The kettlebell rack, plus a clear walkway such as a turf strip.'),
('cable-pallof-press', 'Cable Pallof Press', 'core', array[]::text[], 'cable',
  array['Set the pulley at chest height and stand side-on to the machine.', 'Hold the handle at your chest and press it straight out.', 'Resist the twist, then bring it back in.'],
  'A cable machine with a single handle.'),

-- More quads
('front-squat', 'Barbell Front Squat', 'quads', array['glutes', 'core'], 'barbell',
  array['Rest the bar on the front of your shoulders, elbows pointing forwards and high.', 'Sit straight down, keeping your chest and elbows up.', 'Drive up through your whole foot, staying upright.'],
  'The squat rack, with the hooks at upper-chest height and the safety bars just below your lowest squat. A more advanced lift: master the goblet squat first.'),
('hack-squat', 'Hack Squat', 'quads', array['glutes'], 'machine',
  array['Stand with your back and shoulders against the pads, feet hip-width on the platform.', 'Release the safety handles and lower until your thighs are about level with the platform.', 'Press back up, then lock the safety handles before stepping out.'],
  'The machine area: an angled sled with shoulder pads, usually near the leg press.'),
('single-leg-leg-press', 'Single-Leg Leg Press', 'quads', array['glutes'], 'machine',
  array['Place one foot in the middle of the platform and rest the other on the frame.', 'Lower slowly until your knee is bent to about a right angle.', 'Press away without letting your knee cave inwards.'],
  'The leg press machine. Use roughly half the weight you would with two legs.'),
('dumbbell-walking-lunge', 'Dumbbell Walking Lunge', 'quads', array['glutes', 'hamstrings'], 'dumbbell',
  array['Hold a dumbbell in each hand and take a long step forwards.', 'Lower your back knee gently towards the floor.', 'Push through your front foot and step straight into the next lunge.'],
  'The dumbbell rack, plus a long clear strip of floor such as a turf track. Try it without weights first.'),
('kettlebell-goblet-squat', 'Kettlebell Goblet Squat', 'quads', array['glutes', 'core'], 'kettlebell',
  array['Hold the kettlebell by its horns, close to your chest.', 'Sit down between your heels with your chest proud.', 'Stand tall, squeezing your glutes at the top.'],
  'The kettlebell rack, often in the functional or stretching area.'),
('heels-elevated-goblet-squat', 'Heels-Elevated Goblet Squat', 'quads', array['glutes'], 'dumbbell',
  array['Stand with your heels on a small plate or wedge, a dumbbell held at your chest.', 'Sit straight down, letting your knees travel forwards over your toes.', 'Drive up through your feet and stand tall.'],
  'A dumbbell from the rack and a small weight plate or squat wedge (often near the squat racks).'),
('dumbbell-lateral-lunge', 'Dumbbell Lateral Lunge', 'quads', array['glutes', 'adductors'], 'dumbbell',
  array['Hold a dumbbell at your chest and take a wide step out to one side.', 'Sit back into that hip, keeping your other leg straight.', 'Push off to return to the middle, then switch sides.'],
  'A dumbbell from the rack, plus some clear floor on either side of you.'),
('bodyweight-reverse-lunge', 'Bodyweight Reverse Lunge', 'quads', array['glutes'], 'bodyweight',
  array['Stand tall with your hands on your hips.', 'Step one foot back and lower your back knee gently towards the floor.', 'Push through your front foot to return to standing.'],
  'Anywhere with a little space: the stretching area or at home.'),
('bodyweight-split-squat', 'Bodyweight Split Squat', 'quads', array['glutes'], 'bodyweight',
  array['Stand in a long stride with your back heel lifted.', 'Lower your back knee straight down towards the floor.', 'Press up through your front foot, keeping your chest tall.'],
  'Anywhere. Hold a wall or rail for balance if you need to.'),
('wall-sit', 'Wall Sit', 'quads', array['glutes'], 'bodyweight',
  array['Lean your back flat against a wall and walk your feet forwards.', 'Slide down until your knees are bent to about a right angle.', 'Hold, breathing steadily, then stand up when your time is up.'],
  'Any clear wall, in the gym or at home.'),
('banded-squat', 'Banded Squat', 'quads', array['glutes'], 'band',
  array['Loop a mini band just above your knees.', 'Sit down into a squat, gently pushing your knees out against the band.', 'Stand up tall, keeping tension in the band the whole time.'],
  'Mini bands usually hang on hooks in the stretching or functional area. They are cheap to buy for home too.'),
('jump-squat', 'Jump Squat', 'quads', array['glutes', 'calves'], 'bodyweight',
  array['Lower into a quarter squat with your arms back.', 'Jump straight up, swinging your arms.', 'Land softly through your whole foot and sink straight into the next rep.'],
  'Clear floor space, ideally a mat or turf. An advanced move: build up with bodyweight squats first.'),
('single-leg-box-squat', 'Single-Leg Box Squat', 'quads', array['glutes', 'core'], 'bodyweight',
  array['Stand on one leg in front of a box or bench, your other leg held out in front.', 'Sit back slowly until you lightly touch the box.', 'Drive up through your standing foot without bouncing.'],
  'A plyo box or flat bench. An advanced move: start with a higher box and go lower over time.'),
('barbell-box-squat', 'Barbell Box Squat', 'quads', array['glutes', 'hamstrings'], 'barbell',
  array['Set a box behind you at a height that puts your thighs about level when seated.', 'Sit back under control until you lightly touch the box, staying braced.', 'Drive up and stand tall without rocking.'],
  'The squat rack, with a plyo box or flat bench placed behind you. Set the safety bars too.'),
('cable-squat', 'Cable Squat', 'quads', array['glutes'], 'cable',
  array['Hold a rope or handle from a low cable at your chest and step back.', 'Sit down between your heels, letting the cable help you stay upright.', 'Stand tall and squeeze your glutes at the top.'],
  'A cable machine at its lowest setting, with a rope or double handle attachment.'),
('kettlebell-reverse-lunge', 'Kettlebell Reverse Lunge', 'quads', array['glutes'], 'kettlebell',
  array['Hold a kettlebell in each hand, or one at your chest.', 'Step back and lower your back knee gently towards the floor.', 'Drive through your front foot to stand back up.'],
  'The kettlebell rack, plus a little clear floor.'),

-- More glutes
('single-leg-glute-bridge', 'Single-Leg Glute Bridge', 'glutes', array['hamstrings'], 'bodyweight',
  array['Lie on your back with one foot flat and the other leg lifted.', 'Push through your planted heel to lift your hips.', 'Keep your hips level, pause at the top, then lower slowly.'],
  'The stretching area: grab a mat. Works at home too.'),
('dumbbell-hip-thrust', 'Dumbbell Hip Thrust', 'glutes', array['hamstrings'], 'dumbbell',
  array['Rest your upper back on a bench and hold a dumbbell on your hips.', 'Drive up through your heels until your body is flat like a table.', 'Squeeze your glutes hard, then lower with control.'],
  'A dumbbell from the rack plus a flat bench. Fold a mat over your hips for comfort.'),
('banded-glute-bridge', 'Banded Glute Bridge', 'glutes', array['hamstrings'], 'band',
  array['Loop a mini band just above your knees and lie on your back.', 'Push your knees out gently against the band as you lift your hips.', 'Pause at the top, then lower slowly.'],
  'A mini band and a mat from the stretching area.'),
('frog-pump', 'Frog Pump', 'glutes', array[]::text[], 'bodyweight',
  array['Lie on your back with the soles of your feet together and your knees falling out.', 'Push through the outside edges of your feet to lift your hips.', 'Squeeze your glutes at the top for a second, then lower.'],
  'The stretching area: grab a mat. Works at home too.'),
('hip-thrust-machine', 'Hip Thrust Machine', 'glutes', array['hamstrings'], 'machine',
  array['Sit with your upper back on the pad and the belt or pad across your hips.', 'Drive up through your heels until your hips are fully extended.', 'Squeeze at the top, then lower under control.'],
  'The machine area, often near the leg machines. Not every gym has one; the barbell or dumbbell version works just as well.'),
('banded-lateral-walk', 'Banded Lateral Walk', 'glutes', array[]::text[], 'band',
  array['Loop a mini band above your knees or around your ankles and sink into a half squat.', 'Step sideways, keeping tension in the band.', 'Take 10 to 15 steps one way, then come back.'],
  'A mini band from the stretching area, plus a clear strip of floor. A great warm-up.'),
('banded-clamshell', 'Banded Clamshell', 'glutes', array[]::text[], 'band',
  array['Lie on your side with a mini band above your knees, knees bent and heels together.', 'Keeping your heels touching, lift your top knee.', 'Pause, then lower slowly. Do all your reps, then swap sides.'],
  'A mini band and a mat from the stretching area.'),
('banded-kickback', 'Banded Kickback', 'glutes', array['hamstrings'], 'band',
  array['On all fours, loop a band around one foot and hold the ends under your hands.', 'Push that foot back and up until your leg is straight.', 'Lower with control, keeping your back flat.'],
  'A long resistance band and a mat from the stretching area.'),
('donkey-kick', 'Donkey Kick', 'glutes', array[]::text[], 'bodyweight',
  array['Start on all fours with your hands under your shoulders.', 'Keeping your knee bent, lift one foot towards the ceiling.', 'Squeeze your glute at the top, then lower without arching your back.'],
  'The stretching area: grab a mat. Works at home too.'),
('fire-hydrant', 'Fire Hydrant', 'glutes', array[]::text[], 'bodyweight',
  array['Start on all fours with a flat back.', 'Lift one bent knee out to the side, keeping your hips level.', 'Lower slowly and repeat, then swap sides.'],
  'The stretching area: grab a mat. Works at home too.'),
('cable-pull-through', 'Cable Pull-Through', 'glutes', array['hamstrings'], 'cable',
  array['Face away from a low cable with the rope between your legs.', 'Push your hips back, letting the rope travel back between your legs.', 'Drive your hips forwards to stand tall and squeeze your glutes.'],
  'A cable machine at its lowest setting, with the rope attachment.'),
('cable-hip-abduction', 'Standing Cable Hip Abduction', 'glutes', array[]::text[], 'cable',
  array['Attach an ankle strap to a low cable and stand side-on, with the strap on your outside ankle.', 'Lift that leg out to the side, keeping your body tall.', 'Lower slowly, then swap sides.'],
  'A cable machine at its lowest setting. Ankle straps hang on a hook or rack beside the cables.'),
('kettlebell-sumo-deadlift', 'Kettlebell Sumo Deadlift', 'glutes', array['adductors', 'hamstrings'], 'kettlebell',
  array['Stand wide with your toes turned out and the kettlebell between your feet.', 'Push your hips back, keep your chest up and grab the handle.', 'Stand tall, pushing your knees out, then lower with control.'],
  'The kettlebell rack. A heavy dumbbell held by one end works too.'),
('dumbbell-sumo-squat', 'Dumbbell Sumo Squat', 'glutes', array['quads', 'adductors'], 'dumbbell',
  array['Stand wide with your toes turned out, holding one dumbbell by its end between your legs.', 'Sit straight down, pushing your knees out over your toes.', 'Stand tall and squeeze your glutes at the top.'],
  'The dumbbell rack, plus some clear floor.'),
('barbell-glute-bridge', 'Barbell Glute Bridge', 'glutes', array['hamstrings'], 'barbell',
  array['Lie on the floor with the bar across your hips and your knees bent.', 'Drive through your heels to lift your hips.', 'Squeeze your glutes at the top, then lower slowly.'],
  'Free-weights area: a barbell with large plates so it can roll over your hips, a bar pad, and a mat.'),
('single-leg-hip-thrust', 'Single-Leg Hip Thrust', 'glutes', array['hamstrings'], 'bodyweight',
  array['Rest your upper back on a bench with one foot planted and the other leg lifted.', 'Drive up through your planted heel until your hips are level.', 'Lower slowly, keeping your hips square.'],
  'A flat bench. An advanced bodyweight move: master the two-leg version first.'),
('glute-focused-back-extension', 'Glute-Focused Back Extension', 'glutes', array['hamstrings', 'back'], 'machine',
  array['Set the pad just below your hips and turn your toes slightly out.', 'Round your upper back gently and lower your body.', 'Squeeze your glutes to lift until your body is in a straight line.'],
  'The 45-degree back-extension bench, usually near the stretching area.'),
('curtsy-lunge', 'Dumbbell Curtsy Lunge', 'glutes', array['quads', 'adductors'], 'dumbbell',
  array['Hold a dumbbell in each hand and stand tall.', 'Step one foot diagonally behind the other, like a curtsy, and lower.', 'Push through your front foot to return, then switch sides.'],
  'The dumbbell rack, plus a little clear floor. Try it without weights first.'),
('banded-hip-thrust', 'Banded Hip Thrust', 'glutes', array['hamstrings'], 'band',
  array['Rest your upper back on a bench with a mini band above your knees.', 'Drive up through your heels, pushing your knees out against the band.', 'Squeeze at the top, then lower with control.'],
  'A flat bench and a mini band from the stretching area. A sofa works at home.'),
('barbell-sumo-deadlift', 'Barbell Sumo Deadlift', 'glutes', array['adductors', 'hamstrings', 'back'], 'barbell',
  array['Take a wide stance with your toes out and the bar over your mid-foot.', 'Grip the bar inside your knees, chest up and back flat.', 'Push the floor apart and stand tall, keeping the bar close.'],
  'A lifting platform or open floor in the free-weights area, with large plates on the bar.'),
('glute-kickback-machine', 'Glute Kickback Machine', 'glutes', array['hamstrings'], 'machine',
  array['Set yourself on the machine with your chest on the pad and one foot on the platform.', 'Push the platform back and up until your leg is nearly straight.', 'Return slowly, then swap legs.'],
  'The machine area. Not every gym has one; the cable kickback works just as well.'),
('deficit-reverse-lunge', 'Deficit Reverse Lunge', 'glutes', array['quads', 'hamstrings'], 'dumbbell',
  array['Stand on a low step or plate with a dumbbell in each hand.', 'Step back off the step and lower your back knee towards the floor.', 'Lean slightly forwards and drive through your front heel to return.'],
  'Dumbbells from the rack and a low step or weight plate. An advanced lunge: master the reverse lunge first.'),
('trap-bar-deadlift', 'Trap Bar Deadlift', 'glutes', array['quads', 'hamstrings', 'back'], 'barbell',
  array['Stand in the middle of the bar and grip the handles at your sides.', 'Push your hips back, brace and keep your chest up.', 'Push the floor away and stand tall.'],
  'The trap bar (a hexagon-shaped bar you stand inside) usually leans against a wall near the racks.'),

-- Inner thighs
('hip-adduction-machine', 'Hip Adduction Machine', 'adductors', array[]::text[], 'machine',
  array['Sit tall with your back against the pad and the pads on the inside of your knees.', 'Squeeze your knees together.', 'Pause, then let them open slowly.'],
  'The machine area: the twin of the hip abduction machine, with pads on the inside of your knees.'),
('cable-hip-adduction', 'Standing Cable Hip Adduction', 'adductors', array[]::text[], 'cable',
  array['Attach an ankle strap to a low cable and stand side-on, with the strap on your inside ankle.', 'Sweep that leg across in front of your other leg.', 'Return slowly, then swap sides.'],
  'A cable machine at its lowest setting, with an ankle strap.'),
('side-lying-adduction', 'Side-Lying Inner Thigh Raise', 'adductors', array[]::text[], 'bodyweight',
  array['Lie on your side and cross your top foot in front of your bottom knee.', 'Lift your bottom leg a few inches off the floor.', 'Lower slowly, then swap sides.'],
  'The stretching area: grab a mat. Works at home too.'),
('copenhagen-plank', 'Copenhagen Plank', 'adductors', array['core'], 'bodyweight',
  array['Lie on your side with your top leg resting on a bench and your forearm on the floor.', 'Lift your hips until your body is in a straight line.', 'Hold, breathing steadily. Bend your top knee onto the bench to make it easier.'],
  'A flat bench and a mat. An advanced move: start with short holds.'),

-- More hamstrings
('single-leg-romanian-deadlift', 'Single-Leg Romanian Deadlift', 'hamstrings', array['glutes', 'core'], 'dumbbell',
  array['Hold a dumbbell in one hand and stand on the opposite leg.', 'Hinge forwards, letting your free leg travel back in line with your body.', 'Feel the stretch, then squeeze your glute to stand back up.'],
  'A dumbbell from the rack. Hold a rack or bench with your free hand for balance at first.'),
('kettlebell-romanian-deadlift', 'Kettlebell Romanian Deadlift', 'hamstrings', array['glutes'], 'kettlebell',
  array['Hold a kettlebell in both hands in front of your thighs.', 'Push your hips back with soft knees and a flat back.', 'Stop at the stretch, then drive your hips forwards to stand.'],
  'The kettlebell rack.'),
('nordic-curl', 'Nordic Curl', 'hamstrings', array['glutes'], 'bodyweight',
  array['Kneel on a mat with your ankles held down by a partner, pad or bench.', 'Lower your body forwards as slowly as you can, keeping your hips straight.', 'Catch yourself with your hands, then push back up to the start.'],
  'A mat plus something to hook your heels under, such as a Nordic bench or a loaded barbell. An advanced move: start with a short range.'),
('sliding-leg-curl', 'Sliding Leg Curl', 'hamstrings', array['glutes'], 'bodyweight',
  array['Lie on your back with your heels on sliders, or a towel on a smooth floor.', 'Lift your hips into a bridge.', 'Slide your heels out and back in, keeping your hips up.'],
  'A smooth floor and gliding discs (often in the functional area), or a towel at home.'),
('good-morning', 'Barbell Good Morning', 'hamstrings', array['glutes', 'back'], 'barbell',
  array['Rest a light bar across your upper back, as for a squat.', 'With soft knees and a flat back, push your hips back and lean forwards.', 'Stop at the stretch, then squeeze your glutes to stand.'],
  'The squat rack. Start with an empty or light bar.'),
('standing-cable-leg-curl', 'Standing Cable Leg Curl', 'hamstrings', array[]::text[], 'cable',
  array['Attach an ankle strap to a low cable and face the machine.', 'Curl your heel up towards your bum, keeping your thigh still.', 'Lower slowly, then swap legs.'],
  'A cable machine at its lowest setting, with an ankle strap.'),
('banded-hamstring-curl', 'Banded Hamstring Curl', 'hamstrings', array[]::text[], 'band',
  array['Anchor a long band low in front of you and loop it around your ankles.', 'Lie face down and curl your heels towards your bum.', 'Lower slowly against the band.'],
  'A long resistance band, a mat and something sturdy to anchor it to, such as a rack.'),

-- More calves
('seated-calf-raise', 'Seated Calf Raise', 'calves', array[]::text[], 'machine',
  array['Sit with the pad on your lower thighs and the balls of your feet on the platform.', 'Push up onto your toes as high as you can.', 'Lower slowly into a deep stretch.'],
  'The machine area: a low seat with a pad that rests on top of your knees.'),
('single-leg-calf-raise', 'Single-Leg Calf Raise', 'calves', array[]::text[], 'bodyweight',
  array['Stand on one foot on the edge of a step.', 'Rise as high as you can onto your toes.', 'Lower slowly until your heel dips below the step.'],
  'Any step or platform. Hold a wall or rail for balance.'),
('dumbbell-calf-raise', 'Dumbbell Calf Raise', 'calves', array[]::text[], 'dumbbell',
  array['Hold a dumbbell in one hand and hold on to something steady with the other.', 'Rise up onto your toes and pause.', 'Lower slowly back down.'],
  'A dumbbell from the rack, plus a step or weight plate under the balls of your feet.'),
('leg-press-calf-raise', 'Leg Press Calf Raise', 'calves', array[]::text[], 'machine',
  array['Sit in the leg press with the balls of your feet on the bottom edge of the platform.', 'Keeping your legs straight but not locked, push through your toes.', 'Let the platform come back slowly into a stretch.'],
  'The leg press machine. Keep the safety catches on.'),

-- More chest
('incline-barbell-bench-press', 'Incline Barbell Bench Press', 'chest', array['shoulders', 'triceps'], 'barbell',
  array['Lie on an incline bench with your feet flat and shoulder blades squeezed together.', 'Lower the bar to your upper chest with control.', 'Press up until your arms are straight.'],
  'An incline bench with a built-in rack in the free-weights area. Set the safety arms or ask someone to spot you.'),
('dumbbell-fly', 'Dumbbell Fly', 'chest', array['shoulders'], 'dumbbell',
  array['Lie on a flat bench with the dumbbells above your chest, palms facing.', 'With a slight bend in your elbows, open your arms out wide.', 'Bring them back together over your chest, as if hugging a tree.'],
  'Light dumbbells from the rack plus a flat bench.'),
('incline-push-up', 'Incline Push-Up', 'chest', array['triceps', 'shoulders'], 'bodyweight',
  array['Put your hands on a bench or box, slightly wider than your shoulders.', 'Lower your chest to the edge, keeping your body in a straight line.', 'Push away until your arms are straight.'],
  'A flat bench, box, kitchen counter or wall. The higher your hands, the easier it is.'),
('knee-push-up', 'Knee Push-Up', 'chest', array['triceps', 'shoulders'], 'bodyweight',
  array['Start on your knees with your hands slightly wider than your shoulders.', 'Keep a straight line from your knees to your head as you lower.', 'Push the floor away until your arms are straight.'],
  'A mat in the stretching area, or at home.'),
('decline-push-up', 'Decline Push-Up', 'chest', array['shoulders', 'triceps', 'core'], 'bodyweight',
  array['Put your feet on a bench and your hands on the floor.', 'Lower your chest towards the floor, keeping your body straight.', 'Push back up until your arms are straight.'],
  'A flat bench or box. An advanced move: master the standard push-up first.'),
('pec-deck', 'Pec Deck', 'chest', array['shoulders'], 'machine',
  array['Set the seat so the handles are at chest height.', 'With a slight bend in your elbows, bring the handles together in front of you.', 'Open slowly until you feel a stretch across your chest.'],
  'The machine area: a seat with two swinging arms. Often the same machine as the reverse pec deck.'),
('incline-machine-chest-press', 'Incline Machine Chest Press', 'chest', array['shoulders', 'triceps'], 'machine',
  array['Set the seat so the handles line up with your upper chest.', 'Press up and forwards until your arms are almost straight.', 'Let the handles return slowly.'],
  'The machine area: a reclined seat with handles at upper-chest height.'),
('low-to-high-cable-fly', 'Low-to-High Cable Fly', 'chest', array['shoulders'], 'cable',
  array['Set both pulleys low and step forwards with a handle in each hand.', 'Sweep your hands up and together to about chin height.', 'Lower slowly back to the start.'],
  'A cable machine with two towers, with the pulleys at their lowest position.'),
('band-chest-press', 'Band Chest Press', 'chest', array['triceps', 'shoulders'], 'band',
  array['Wrap a long band behind your back at chest height, with an end in each hand.', 'Press your hands forwards until your arms are straight.', 'Return slowly, keeping tension in the band.'],
  'A long resistance band from the stretching area. Great for home.'),
('dumbbell-floor-press', 'Dumbbell Floor Press', 'chest', array['triceps'], 'dumbbell',
  array['Lie on the floor with your knees bent and a dumbbell in each hand above your chest.', 'Lower until your upper arms gently touch the floor.', 'Press back up and bring the dumbbells together.'],
  'Dumbbells and a mat. Ideal when there is no bench free, or at home.'),
('chest-dip', 'Chest Dip', 'chest', array['triceps', 'shoulders'], 'bodyweight',
  array['Support yourself on parallel bars with straight arms.', 'Lean slightly forwards and lower until your shoulders are just below your elbows.', 'Press back up to straight arms.'],
  'The dip station (two parallel handles), often part of the pull-up frame. An advanced move: use the assisted dip machine first.'),
('kettlebell-floor-press', 'Kettlebell Floor Press', 'chest', array['triceps'], 'kettlebell',
  array['Lie on the floor with a kettlebell in one hand, resting on the back of your wrist.', 'Press it straight up over your shoulder.', 'Lower until your upper arm touches the floor, then swap sides.'],
  'The kettlebell rack and a mat.'),
('single-arm-cable-chest-press', 'Single-Arm Cable Chest Press', 'chest', array['triceps', 'core'], 'cable',
  array['Set a cable at chest height and face away from it, handle in one hand.', 'Press forwards until your arm is straight, resisting the twist.', 'Return slowly, then swap sides.'],
  'A cable machine with a single handle.'),

-- More back
('pull-up', 'Pull-Up', 'back', array['biceps'], 'bodyweight',
  array['Hang from the bar with your hands slightly wider than your shoulders, palms facing away.', 'Pull your chest towards the bar, leading with your elbows.', 'Lower slowly to a full hang.'],
  'The pull-up bar, often on top of a rack or a dedicated frame. An advanced move: build up on the assisted pull-up machine.'),
('chin-up', 'Chin-Up', 'back', array['biceps'], 'bodyweight',
  array['Hang from the bar with your hands shoulder-width apart, palms facing you.', 'Pull up until your chin passes the bar.', 'Lower slowly to a full hang.'],
  'The pull-up bar. An advanced move: build up on the assisted pull-up machine.'),
('inverted-row', 'Inverted Row', 'back', array['biceps', 'core'], 'bodyweight',
  array['Lie under a bar set at about waist height and grip it with straight arms.', 'Keep your body straight and pull your chest up to the bar.', 'Lower slowly. Bend your knees to make it easier.'],
  'A barbell set in a squat rack at waist height, or a Smith machine bar.'),
('chest-supported-dumbbell-row', 'Chest-Supported Dumbbell Row', 'back', array['biceps', 'shoulders'], 'dumbbell',
  array['Lie face down on an incline bench with a dumbbell in each hand.', 'Pull the dumbbells up, squeezing your shoulder blades together.', 'Lower until your arms are straight.'],
  'Dumbbells from the rack plus an adjustable bench set to a low incline.'),
('machine-row', 'Machine Row', 'back', array['biceps'], 'machine',
  array['Set the seat so the handles are at chest height and rest your chest on the pad.', 'Pull the handles back, squeezing your shoulder blades together.', 'Let them return slowly.'],
  'The machine area: a seat with a chest pad and handles in front of you.'),
('close-grip-lat-pulldown', 'Close-Grip Lat Pulldown', 'back', array['biceps'], 'cable',
  array['Attach a close-grip (V) handle and sit with your knees under the pads.', 'Pull the handle to your upper chest, leaning back slightly.', 'Let it rise slowly until your arms are straight.'],
  'The lat pulldown station. The V handle hangs on the attachments rack.'),
('single-arm-lat-pulldown', 'Single-Arm Lat Pulldown', 'back', array['biceps'], 'cable',
  array['Attach a single handle to a high cable and kneel or sit beneath it.', 'Pull your elbow down towards your hip.', 'Let your arm rise slowly into a stretch, then swap sides.'],
  'A cable machine at its highest setting, with a single handle.'),
('straight-arm-pulldown', 'Straight-Arm Pulldown', 'back', array['core'], 'cable',
  array['Face a high cable holding a bar or rope, arms straight in front of you.', 'Keeping your arms straight, sweep the handle down to your thighs.', 'Let it rise slowly back to eye level.'],
  'A cable machine at its highest setting, with a straight bar or rope.'),
('band-row', 'Band Row', 'back', array['biceps'], 'band',
  array['Anchor a long band at chest height, or loop it around your feet while seated.', 'Pull the ends towards your stomach, squeezing your shoulder blades together.', 'Return slowly against the band.'],
  'A long resistance band. Anchor it to a rack, or to a closed door at home using a door anchor.'),
('band-lat-pulldown', 'Band Lat Pulldown', 'back', array['biceps'], 'band',
  array['Anchor a long band high above you and kneel facing it.', 'Pull the ends down towards your chest, leading with your elbows.', 'Let your arms rise slowly.'],
  'A long resistance band anchored high on a rack or pull-up bar.'),
('kettlebell-row', 'Kettlebell Row', 'back', array['biceps'], 'kettlebell',
  array['Hinge forwards with a flat back, holding a kettlebell in one hand.', 'Pull the bell up towards your hip.', 'Lower it until your arm is straight, then swap sides.'],
  'The kettlebell rack. Rest your free hand on a bench for support.'),
('renegade-row', 'Renegade Row', 'back', array['core', 'shoulders'], 'dumbbell',
  array['Start in a push-up position with your hands on two dumbbells and feet wide.', 'Row one dumbbell to your hip without twisting your hips.', 'Lower it and repeat on the other side.'],
  'Two hexagonal dumbbells from the rack, plus a mat. An advanced move: start on your knees.'),
('back-extension', 'Back Extension', 'back', array['glutes', 'hamstrings'], 'machine',
  array['Set the pad just below your hips and cross your arms over your chest.', 'Lower your body slowly, keeping your back flat.', 'Lift until your body is in a straight line, without over-arching.'],
  'The 45-degree back-extension bench, usually near the stretching area.'),
('dumbbell-pullover', 'Dumbbell Pullover', 'back', array['chest', 'triceps'], 'dumbbell',
  array['Lie on a bench holding one dumbbell with both hands above your chest.', 'With slightly bent arms, lower it back behind your head.', 'Pull it back over your chest.'],
  'A dumbbell from the rack plus a flat bench.'),
('t-bar-row', 'T-Bar Row', 'back', array['biceps', 'hamstrings'], 'barbell',
  array['Straddle the bar with a V handle hooked under the bar near the plates.', 'Hinge forwards with a flat back and soft knees.', 'Pull the handle to your chest, then lower with control.'],
  'A landmine station (a barbell with one end fixed in a corner or holder), or a dedicated T-bar row machine.'),
('dumbbell-shrug', 'Dumbbell Shrug', 'back', array[]::text[], 'dumbbell',
  array['Stand tall with a dumbbell in each hand.', 'Lift your shoulders straight up towards your ears.', 'Pause, then lower slowly.'],
  'The dumbbell rack.'),

-- More shoulders
('arnold-press', 'Arnold Press', 'shoulders', array['triceps'], 'dumbbell',
  array['Sit upright with the dumbbells at shoulder height, palms facing you.', 'Press up, turning your palms to face forwards as you go.', 'Reverse the turn as you lower.'],
  'Dumbbells from the rack plus an adjustable bench set upright.'),
('cable-lateral-raise', 'Cable Lateral Raise', 'shoulders', array[]::text[], 'cable',
  array['Stand side-on to a low cable, holding the handle in your far hand.', 'Raise your arm out to the side, up to shoulder height.', 'Lower slowly, then swap sides.'],
  'A cable machine at its lowest setting, with a single handle.'),
('machine-lateral-raise', 'Machine Lateral Raise', 'shoulders', array[]::text[], 'machine',
  array['Set the seat so your shoulders line up with the machine''s pivot points.', 'Raise the pads out to the sides, up to shoulder height.', 'Lower slowly.'],
  'The machine area: a seat with pads that rest against the outside of your arms.'),
('rear-delt-fly', 'Bent-Over Rear Delt Fly', 'shoulders', array['back'], 'dumbbell',
  array['Hinge forwards with a flat back, light dumbbells hanging below you.', 'Raise your arms out to the sides with a slight bend in your elbows.', 'Lower slowly.'],
  'The lighter end of the dumbbell rack. Sit on the end of a bench and lean forwards if you prefer.'),
('reverse-pec-deck', 'Reverse Pec Deck', 'shoulders', array['back'], 'machine',
  array['Sit facing the pad with the handles at shoulder height.', 'Sweep your arms back and out until they are in line with your body.', 'Return slowly.'],
  'The pec deck machine, used the other way round so you face the pad.'),
('dumbbell-front-raise', 'Dumbbell Front Raise', 'shoulders', array[]::text[], 'dumbbell',
  array['Stand tall with light dumbbells in front of your thighs.', 'Raise them straight out in front of you to shoulder height.', 'Lower slowly without swinging.'],
  'The lighter end of the dumbbell rack.'),
('band-pull-apart', 'Band Pull-Apart', 'shoulders', array['back'], 'band',
  array['Hold a light band in front of you at shoulder height, arms straight.', 'Pull the band apart until it touches your chest.', 'Return slowly.'],
  'A light resistance band from the stretching area. A great warm-up.'),
('band-shoulder-press', 'Band Shoulder Press', 'shoulders', array['triceps'], 'band',
  array['Stand on the middle of a long band, holding the ends at your shoulders.', 'Press your hands overhead until your arms are straight.', 'Lower slowly back to your shoulders.'],
  'A long resistance band from the stretching area. Great for home.'),
('band-lateral-raise', 'Band Lateral Raise', 'shoulders', array[]::text[], 'band',
  array['Stand on the middle of a light band, with an end in each hand.', 'Raise your arms out to the sides, up to shoulder height.', 'Lower slowly.'],
  'A light resistance band from the stretching area.'),
('kettlebell-overhead-press', 'Kettlebell Overhead Press', 'shoulders', array['triceps', 'core'], 'kettlebell',
  array['Hold a kettlebell at your shoulder, resting on the back of your forearm.', 'Squeeze your glutes and press it straight up.', 'Lower it back to your shoulder, then swap sides.'],
  'The kettlebell rack.'),
('landmine-press', 'Landmine Press', 'shoulders', array['chest', 'triceps'], 'barbell',
  array['Hold the end of the bar at your shoulder in one hand, with a staggered stance.', 'Press up and forwards until your arm is straight.', 'Lower with control, then swap sides.'],
  'A landmine station: a barbell with one end fixed in a corner or holder.'),
('pike-push-up', 'Pike Push-Up', 'shoulders', array['triceps'], 'bodyweight',
  array['Start in a downward-dog shape, hips high and hands shoulder-width apart.', 'Bend your elbows to lower your head towards the floor.', 'Press back up.'],
  'A mat. An advanced move: master the push-up and shoulder press first.'),
('cable-rear-delt-fly', 'Cable Rear Delt Fly', 'shoulders', array['back'], 'cable',
  array['Set both pulleys at shoulder height and cross the cables, holding the opposite handles.', 'Pull your arms out and back until they are in line with your body.', 'Return slowly.'],
  'A cable machine with two towers. You can hold the cable ends without handles.'),
('incline-y-raise', 'Incline Y Raise', 'shoulders', array['back'], 'dumbbell',
  array['Lie face down on an incline bench holding very light dumbbells.', 'Raise your arms up and out into a Y shape, thumbs up.', 'Lower slowly.'],
  'The lightest dumbbells, plus an adjustable bench set to a low incline.'),

-- More biceps
('barbell-biceps-curl', 'Barbell Biceps Curl', 'biceps', array[]::text[], 'barbell',
  array['Stand tall holding the bar with your palms facing forwards.', 'Curl it up, keeping your elbows by your sides.', 'Lower slowly to straight arms.'],
  'A straight bar from the rack of short fixed-weight bars.'),
('ez-bar-curl', 'EZ-Bar Curl', 'biceps', array[]::text[], 'barbell',
  array['Hold the angled grips of the EZ bar, palms up.', 'Curl the bar up, keeping your elbows still.', 'Lower slowly.'],
  'The EZ bar (a short bar with a zigzag in the middle), usually on the rack of fixed-weight bars.'),
('incline-dumbbell-curl', 'Incline Dumbbell Curl', 'biceps', array[]::text[], 'dumbbell',
  array['Sit back on an incline bench with your arms hanging straight down.', 'Curl the dumbbells up without moving your elbows forwards.', 'Lower slowly into a stretch.'],
  'Dumbbells from the rack plus an adjustable bench.'),
('preacher-curl-machine', 'Preacher Curl Machine', 'biceps', array[]::text[], 'machine',
  array['Sit so your upper arms rest flat on the angled pad.', 'Curl the handles up towards your shoulders.', 'Lower slowly until your arms are nearly straight.'],
  'The machine area: a seat facing an angled arm pad.'),
('concentration-curl', 'Concentration Curl', 'biceps', array[]::text[], 'dumbbell',
  array['Sit on a bench and rest the back of your arm against your inner thigh.', 'Curl the dumbbell up towards your shoulder.', 'Lower slowly, then swap arms.'],
  'A dumbbell from the rack plus a flat bench.'),
('band-biceps-curl', 'Band Biceps Curl', 'biceps', array[]::text[], 'band',
  array['Stand on the middle of a band, with an end in each hand.', 'Curl your hands up towards your shoulders, keeping your elbows still.', 'Lower slowly against the band.'],
  'A resistance band from the stretching area. Great for home.'),
('cable-hammer-curl', 'Cable Rope Hammer Curl', 'biceps', array[]::text[], 'cable',
  array['Attach a rope to a low cable and hold it with your palms facing each other.', 'Curl the rope up, keeping your elbows by your sides.', 'Lower slowly.'],
  'A cable machine at its lowest setting, with the rope attachment.'),

-- More triceps
('close-grip-bench-press', 'Close-Grip Bench Press', 'triceps', array['chest', 'shoulders'], 'barbell',
  array['Grip the bar about shoulder-width apart.', 'Lower it to your lower chest, keeping your elbows close to your sides.', 'Press up until your arms are straight.'],
  'A flat bench with a built-in rack. Set the safety arms or ask someone to spot you.'),
('ez-bar-skull-crusher', 'EZ-Bar Skull Crusher', 'triceps', array[]::text[], 'barbell',
  array['Lie on a flat bench holding an EZ bar above your chest.', 'Bend only at the elbows to lower the bar towards your forehead.', 'Straighten your arms to lift it back up.'],
  'An EZ bar from the fixed-weight rack plus a flat bench. Start light.'),
('dumbbell-lying-triceps-extension', 'Dumbbell Lying Triceps Extension', 'triceps', array[]::text[], 'dumbbell',
  array['Lie on a bench with the dumbbells above your chest, palms facing.', 'Bend your elbows to lower the dumbbells beside your head.', 'Straighten your arms to lift them back up.'],
  'Light dumbbells from the rack plus a flat bench.'),
('cable-overhead-triceps-extension', 'Cable Overhead Triceps Extension', 'triceps', array[]::text[], 'cable',
  array['Face away from the cable with the rope held behind your head.', 'Keeping your elbows high, straighten your arms forwards.', 'Let the rope come back slowly behind your head.'],
  'A cable machine with the rope attachment, set low or at about head height.'),
('dumbbell-triceps-kickback', 'Dumbbell Triceps Kickback', 'triceps', array[]::text[], 'dumbbell',
  array['Hinge forwards with one hand on a bench and your working upper arm tucked in.', 'Straighten your arm back until it is in line with your body.', 'Bend it back slowly, then swap sides.'],
  'A light dumbbell from the rack plus a flat bench.'),
('band-triceps-pushdown', 'Band Triceps Pushdown', 'triceps', array[]::text[], 'band',
  array['Anchor a band high above you and hold the ends.', 'Keep your elbows by your sides and push down until your arms are straight.', 'Let your hands rise slowly.'],
  'A resistance band anchored high on a rack or pull-up bar, or a door anchor at home.'),
('close-grip-push-up', 'Close-Grip Push-Up', 'triceps', array['chest', 'shoulders'], 'bodyweight',
  array['Place your hands under your shoulders, body in a straight line.', 'Lower yourself with your elbows brushing your sides.', 'Push back up until your arms are straight.'],
  'Anywhere. Put your hands on a bench to make it easier.'),
('assisted-dip', 'Assisted Dip', 'triceps', array['chest', 'shoulders'], 'machine',
  array['Kneel or stand on the platform and grip the dip handles.', 'Lower yourself until your elbows are bent to about a right angle.', 'Press back up to straight arms.'],
  'The assisted pull-up machine: the dip handles are lower down on the same frame. More weight on the stack means more help.'),

-- More core
('side-plank', 'Side Plank', 'core', array['shoulders'], 'bodyweight',
  array['Lie on your side with your elbow under your shoulder.', 'Lift your hips so your body forms a straight line.', 'Hold, breathing steadily, then swap sides. Bend your knees to make it easier.'],
  'The stretching area: grab a mat.'),
('bird-dog', 'Bird Dog', 'core', array['glutes', 'back'], 'bodyweight',
  array['Start on all fours with a flat back.', 'Reach one arm forwards and the opposite leg back.', 'Hold for a breath, return, then swap sides.'],
  'The stretching area: grab a mat.'),
('hollow-body-hold', 'Hollow Body Hold', 'core', array[]::text[], 'bodyweight',
  array['Lie on your back and press your lower back into the floor.', 'Lift your shoulders and legs a little off the floor, arms by your ears.', 'Hold. Bend your knees or bring your arms in to make it easier.'],
  'The stretching area: grab a mat.'),
('hanging-knee-raise', 'Hanging Knee Raise', 'core', array[]::text[], 'bodyweight',
  array['Support yourself on the arm pads of the captain''s chair, or hang from a bar.', 'Lift your knees towards your chest without swinging.', 'Lower slowly.'],
  'The captain''s chair (a tall frame with arm pads and a back rest), or a pull-up bar.'),
('cable-crunch', 'Cable Crunch', 'core', array[]::text[], 'cable',
  array['Kneel facing a high cable, holding the rope beside your head.', 'Curl your ribs down towards your hips.', 'Return slowly, keeping your hips still.'],
  'A cable machine at its highest setting with the rope attachment, plus a mat for your knees.'),
('cable-woodchop', 'Cable Woodchop', 'core', array['shoulders'], 'cable',
  array['Stand side-on to a high cable, holding the handle with both hands.', 'Pull it diagonally down across your body, turning through your middle.', 'Return slowly, then swap sides.'],
  'A cable machine set high, with a single handle.'),
('ab-crunch-machine', 'Ab Crunch Machine', 'core', array[]::text[], 'machine',
  array['Sit with the pads against your chest or the handles beside your head.', 'Curl forwards, bringing your ribs towards your hips.', 'Return slowly.'],
  'The machine area: a seat with chest pads or overhead handles.'),
('reverse-crunch', 'Reverse Crunch', 'core', array[]::text[], 'bodyweight',
  array['Lie on your back with your knees bent over your hips.', 'Curl your hips off the floor, bringing your knees towards your chest.', 'Lower slowly without letting your legs swing.'],
  'The stretching area: grab a mat.'),
('mountain-climber', 'Mountain Climber', 'core', array['shoulders', 'quads'], 'bodyweight',
  array['Start in a high plank with your hands under your shoulders.', 'Drive one knee towards your chest, then switch legs.', 'Keep your hips level and move at a steady pace.'],
  'The stretching area: grab a mat.'),
('kettlebell-farmers-carry', 'Kettlebell Farmer''s Carry', 'core', array['shoulders'], 'kettlebell',
  array['Pick up a kettlebell in each hand.', 'Walk tall with your shoulders back and down.', 'Take short, steady steps, then set the bells down with care.'],
  'The kettlebell rack, plus a clear walkway such as a turf strip.'),
('band-pallof-press', 'Band Pallof Press', 'core', array[]::text[], 'band',
  array['Anchor a band at chest height and stand side-on to it.', 'Hold the band at your chest and press it straight out.', 'Resist the twist, then bring it back in. Swap sides.'],
  'A resistance band anchored to a rack, or a door anchor at home.'),
('lying-leg-raise', 'Lying Leg Raise', 'core', array[]::text[], 'bodyweight',
  array['Lie on your back with your hands under your hips.', 'Keeping your lower back down, lift your legs towards the ceiling.', 'Lower them slowly. Bend your knees to make it easier.'],
  'The stretching area: grab a mat.'),
('plank-shoulder-tap', 'Plank Shoulder Tap', 'core', array['shoulders'], 'bodyweight',
  array['Start in a high plank with your feet a little apart.', 'Lift one hand to tap the opposite shoulder.', 'Keep your hips still and alternate sides.'],
  'The stretching area: grab a mat.'),
('bear-plank', 'Bear Plank', 'core', array['shoulders', 'quads'], 'bodyweight',
  array['Start on all fours, hands under shoulders and knees under hips.', 'Lift your knees an inch off the floor.', 'Hold with a flat back, breathing steadily.'],
  'The stretching area: grab a mat.'),
('turkish-get-up', 'Turkish Get-Up', 'core', array['shoulders', 'glutes'], 'kettlebell',
  array['Lie on your back holding a light kettlebell straight up in one hand.', 'Keeping your eyes on the bell, roll to your elbow, then your hand, and stand up in stages.', 'Reverse each step slowly to lie back down, then swap sides.'],
  'The kettlebell rack, plus a mat and plenty of space. An advanced move: practise first with no weight.')

on conflict (id) do update set
  name = excluded.name,
  primary_muscle = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles,
  equipment = excluded.equipment,
  cues = excluded.cues,
  location_hint = excluded.location_hint;

-- Weight increase per exercise: smaller steps for small muscles and isolation lifts.
update public.exercises e
set weight_increase_kg = v.kg
from (values
  -- Barbell
  ('barbell-back-squat', 2.5), ('front-squat', 2.5), ('barbell-box-squat', 2.5),
  ('barbell-deadlift', 2.5), ('barbell-sumo-deadlift', 2.5), ('trap-bar-deadlift', 2.5),
  ('barbell-romanian-deadlift', 2.5), ('good-morning', 2.5),
  ('barbell-hip-thrust', 2.5), ('barbell-glute-bridge', 2.5),
  ('barbell-bench-press', 2.5), ('incline-barbell-bench-press', 2.5), ('close-grip-bench-press', 2.5),
  ('barbell-bent-over-row', 2.5), ('t-bar-row', 2.5), ('barbell-overhead-press', 2.5),
  ('landmine-press', 1.25),
  ('barbell-biceps-curl', 2.5), ('ez-bar-curl', 2.5), ('ez-bar-skull-crusher', 2.5),
  -- Dumbbell (per dumbbell)
  ('goblet-squat', 2), ('heels-elevated-goblet-squat', 2), ('dumbbell-sumo-squat', 2),
  ('bulgarian-split-squat', 2), ('dumbbell-reverse-lunge', 2), ('dumbbell-walking-lunge', 2),
  ('dumbbell-lateral-lunge', 2), ('curtsy-lunge', 2), ('deficit-reverse-lunge', 2),
  ('dumbbell-step-up', 2), ('dumbbell-romanian-deadlift', 2), ('single-leg-romanian-deadlift', 2),
  ('dumbbell-hip-thrust', 2), ('dumbbell-calf-raise', 2),
  ('dumbbell-bench-press', 2), ('incline-dumbbell-press', 2), ('dumbbell-floor-press', 2),
  ('one-arm-dumbbell-row', 2), ('chest-supported-dumbbell-row', 2), ('dumbbell-pullover', 2),
  ('dumbbell-shrug', 2),
  ('dumbbell-shoulder-press', 1), ('arnold-press', 1), ('renegade-row', 1),
  ('dumbbell-fly', 1), ('dumbbell-lateral-raise', 1), ('dumbbell-front-raise', 1),
  ('rear-delt-fly', 1), ('incline-y-raise', 1),
  ('dumbbell-biceps-curl', 1), ('dumbbell-hammer-curl', 1), ('incline-dumbbell-curl', 1),
  ('concentration-curl', 1),
  ('overhead-triceps-extension', 1), ('dumbbell-lying-triceps-extension', 1),
  ('dumbbell-triceps-kickback', 1),
  -- Machine
  ('leg-press', 5), ('single-leg-leg-press', 5), ('hack-squat', 5), ('hip-thrust-machine', 5),
  ('standing-calf-raise', 5), ('leg-press-calf-raise', 5),
  ('leg-extension', 2.5), ('lying-leg-curl', 2.5), ('seated-leg-curl', 2.5),
  ('hip-abduction-machine', 2.5), ('hip-adduction-machine', 2.5), ('glute-kickback-machine', 2.5),
  ('seated-calf-raise', 2.5), ('back-extension', 2.5), ('glute-focused-back-extension', 2.5),
  ('machine-chest-press', 2.5), ('incline-machine-chest-press', 2.5), ('pec-deck', 2.5),
  ('machine-row', 2.5), ('machine-shoulder-press', 2.5), ('machine-lateral-raise', 2.5),
  ('reverse-pec-deck', 2.5), ('preacher-curl-machine', 2.5), ('ab-crunch-machine', 2.5),
  ('assisted-pull-up', -5), ('assisted-dip', -5),
  -- Cable
  ('lat-pulldown', 2.5), ('close-grip-lat-pulldown', 2.5), ('seated-cable-row', 2.5),
  ('cable-squat', 2.5), ('cable-pull-through', 2.5), ('cable-crunch', 2.5),
  ('single-arm-lat-pulldown', 1.25), ('straight-arm-pulldown', 1.25),
  ('cable-glute-kickback', 1.25), ('cable-hip-abduction', 1.25), ('cable-hip-adduction', 1.25),
  ('standing-cable-leg-curl', 1.25),
  ('cable-chest-fly', 1.25), ('low-to-high-cable-fly', 1.25), ('single-arm-cable-chest-press', 1.25),
  ('cable-face-pull', 1.25), ('cable-lateral-raise', 1.25), ('cable-rear-delt-fly', 1.25),
  ('cable-biceps-curl', 1.25), ('cable-hammer-curl', 1.25),
  ('cable-triceps-pushdown', 1.25), ('cable-overhead-triceps-extension', 1.25),
  ('cable-pallof-press', 1.25), ('cable-woodchop', 1.25),
  -- Kettlebell
  ('kettlebell-swing', 2), ('kettlebell-deadlift', 2), ('kettlebell-sumo-deadlift', 2),
  ('kettlebell-romanian-deadlift', 2), ('kettlebell-goblet-squat', 2), ('kettlebell-reverse-lunge', 2),
  ('kettlebell-farmers-carry', 2), ('kettlebell-suitcase-carry', 2),
  ('kettlebell-floor-press', 2), ('kettlebell-row', 2), ('kettlebell-overhead-press', 2),
  ('turkish-get-up', 2)
) as v(id, kg)
where e.id = v.id;

-- Every weighted exercise needs an increase; bodyweight and band never have one.
alter table public.exercises add constraint exercises_weight_increase_check check (
  case when equipment in ('bodyweight', 'band')
    then weight_increase_kg is null
    else weight_increase_kg is not null and weight_increase_kg <> 0
  end
);

-- Link any photos that were uploaded before the trigger existed.
update public.exercises e
set media_url = o.name
from storage.objects o
where o.bucket_id = 'exercise-media'
  and e.id = public.exercise_id_from_media_path(o.name);
