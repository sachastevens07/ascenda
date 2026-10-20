-- Exercise library: table, security rules and starter data.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: it updates existing exercises instead of duplicating them.

create table if not exists public.exercises (
  id text primary key,
  name text not null,
  primary_muscle text not null,
  secondary_muscles text[] not null default '{}',
  equipment text not null,
  media_url text,
  cues text[] not null,
  location_hint text not null,
  created_at timestamptz not null default now(),

  constraint exercises_primary_muscle_check check (
    primary_muscle in ('glutes', 'quads', 'hamstrings', 'calves', 'chest', 'back', 'shoulders', 'biceps', 'triceps', 'core')
  ),
  constraint exercises_secondary_muscles_check check (
    secondary_muscles <@ array['glutes', 'quads', 'hamstrings', 'calves', 'chest', 'back', 'shoulders', 'biceps', 'triceps', 'core']::text[]
  ),
  constraint exercises_equipment_check check (
    equipment in ('barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'bodyweight')
  ),
  constraint exercises_cues_check check (cardinality(cues) = 3)
);

-- Signed-in users can read the library. Nobody can change it from the app.
alter table public.exercises enable row level security;

drop policy if exists "Signed-in users can read exercises" on public.exercises;
create policy "Signed-in users can read exercises" on public.exercises
  for select to authenticated using (true);

grant select on public.exercises to authenticated;

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
  'A cable machine with a single handle.')

on conflict (id) do update set
  name = excluded.name,
  primary_muscle = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles,
  equipment = excluded.equipment,
  cues = excluded.cues,
  location_hint = excluded.location_hint;
