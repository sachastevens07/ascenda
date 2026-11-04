import type { LearnArticle, LearnLink } from '@/lib/learn';

const NHS_EXERCISE: { label: string; url: string } = {
  label: 'NHS: exercise',
  url: 'https://www.nhs.uk/live-well/exercise/',
};
const NHS_STRENGTH: { label: string; url: string } = {
  label: 'NHS: strength and flexibility',
  url: 'https://www.nhs.uk/live-well/exercise/strength-and-flexibility-exercises/',
};
const NHS_ADULTS: { label: string; url: string } = {
  label: 'NHS: activity guidelines for adults',
  url: 'https://www.nhs.uk/live-well/exercise/physical-activity-guidelines-for-adults-aged-19-to-64/',
};
const NHS_SLEEP: { label: string; url: string } = {
  label: 'NHS: why sleep matters',
  url: 'https://www.nhs.uk/live-well/sleep-and-tiredness/why-lack-of-sleep-is-bad-for-your-health/',
};
const NHS_EAT: { label: string; url: string } = {
  label: 'NHS: eat well',
  url: 'https://www.nhs.uk/live-well/eat-well/',
};
const GOV_ACTIVITY: { label: string; url: string } = {
  label: 'UK Chief Medical Officers: physical activity guidelines',
  url: 'https://www.gov.uk/government/publications/physical-activity-guidelines-adults-and-older-adults',
};

function article(
  item: Omit<LearnArticle, 'reviewed_by' | 'reviewed_at' | 'published_at' | 'slug'> & { slug?: string }
): LearnArticle {
  return {
    ...item,
    slug: item.slug ?? item.id,
    reviewed_by: null,
    reviewed_at: null,
    published_at: '2026-11-04',
  };
}

/** Conservative launch copy. Coach review still needed before App Store. */
export const LEARN_ARTICLES: LearnArticle[] = [
  article({
    id: 'first-gym-session',
    title: 'Your first gym session, step by step',
    summary: 'A calm order of events for walking in, finding a spot and leaving with a log.',
    category: 'getting_started',
    read_minutes: 3,
    cover_image_id: 'cover-full-body-2',
    is_pro: false,
    sort_order: 1,
    sources: [NHS_EXERCISE, NHS_STRENGTH],
    body_markdown: `Walk in with a plan in your pocket. You do not need to know the whole gym. You need one session and a way home.

## Before you go
Wear shoes you can squat in. Take headphones if they help. Open the session on your phone before you leave the changing room, so you are not guessing on the floor.

## On the floor
Start with the warm-up on the session card. Then do the first lift in the list, in the spot it asks for. If that bench or rack is taken, use the swap. You are still doing the session.

Log each set as you go. Suggested weights are a starting point, not a test. Leave the gym when the list is done. That is a full session.

> You belong in the room as soon as you start the first set.

If anything feels sharp or wrong, stop. Training is not medical advice. Ask a coach on the gym floor if a movement is new.`,
  }),
  article({
    id: 'how-logging-helps',
    title: 'Why logging a session helps you get stronger',
    summary: 'The log is how the next session knows what to suggest. Keep it simple.',
    category: 'getting_started',
    read_minutes: 2,
    cover_image_id: 'cover-busy-gym-6',
    is_pro: false,
    sort_order: 2,
    sources: [NHS_STRENGTH, GOV_ACTIVITY],
    body_markdown: `Strength work gets easier to repeat when last time is written down. You are not chasing a perfect session. You are leaving a note for next week.

Tick a set when you finish it. Write the weight you actually lifted, not the one you hoped for. If you only have time for three of four sets, log those three. The next suggestion still has something to work from.

## What the app uses
The progression rule looks at the first set of a main lift. Hit the top of the rep range with room left, and it will suggest a small jump next time. Miss it, and the same weight comes back. That is on purpose.

Accessories often add reps first, then load. Bodyweight work may not need a number at all.

The log is yours. It is not a score, and nobody else sees it.`,
  }),
  article({
    id: 'starting-weights',
    title: 'How to pick a starting weight',
    summary: 'Find a load you could lift three more times. Then write it down.',
    category: 'getting_started',
    read_minutes: 3,
    cover_image_id: 'cover-upper-lower-4',
    is_pro: false,
    sort_order: 3,
    sources: [NHS_STRENGTH],
    body_markdown: `The first week is for finding loads, not proving them. A good starting weight is one you could lift about three more times at the end of the set.

## A simple test
Warm up. Choose a light pair. Do the first few reps. If they feel easy, go up a little. If the path gets messy, go down. You should finish the set able to talk, with the last two reps tidy.

Leave reps in the tank. That is what “stop with 2 or 3 reps left” means. It is not a weak session. It is how you stay in the work for weeks.

Suggested weights in the logger are estimates from what you already logged. They are not a prescription. Skip them if they feel like too much.

Never grind a first-week set. If a movement is new, stay lighter than you think.`,
  }),
  article({
    id: 'one-spot-sessions',
    title: 'Why one-spot sessions make the gym smaller',
    summary: 'Stay in one area, repeat the same shapes, and the room gets quieter.',
    category: 'gym_confidence',
    read_minutes: 3,
    cover_image_id: 'cover-lower-body-3',
    is_pro: false,
    sort_order: 10,
    sources: [NHS_EXERCISE],
    body_markdown: `A one-spot session is a full-body workout you can do from a dumbbell bench or a quiet corner. You do not tour the gym. You do not wait on four machines.

That is useful when the floor feels busy, or when you are new and do not want to hunt for kit. The session still covers squat, hinge, push, pull and a little core. The map is just smaller.

## How to use it
Pick a bench or a patch of floor. Lay out the dumbbells you need. Work down the list. If a bench is taken, stand and do the swap.

Gym Confidence starts this way on purpose. Later weeks add machines once the session itself feels familiar. You can stay in one spot for as long as you like. Moving on is a choice, not a test.`,
  }),
  article({
    id: 'if-kit-is-taken',
    title: 'What to do when the kit is taken',
    summary: 'Swap, wait one set, or skip. The session still counts.',
    category: 'gym_confidence',
    read_minutes: 2,
    cover_image_id: 'cover-upper-body-6',
    is_pro: false,
    sort_order: 11,
    sources: [NHS_EXERCISE],
    body_markdown: `Busy gyms are normal. A taken bench is not a failed session.

## Three options
Use the swap on the exercise. It keeps the same pattern: a squat stays a squat, a row stays a row.

If you are happy to wait, do the next exercise first and come back. Logging still works in any order.

If nothing nearby works, skip that lift for today. Do the rest. One missing accessory does not undo the week.

You do not need to explain yourself to anyone on the floor. Take the space you need, keep the path tidy, and leave when the list is done.`,
  }),
  article({
    id: 'squat-and-hinge',
    title: 'Squat and hinge, in plain English',
    summary: 'Two patterns that show up every week, and how they should feel.',
    category: 'technique',
    read_minutes: 4,
    cover_image_id: 'cover-glute-builder-6',
    is_pro: false,
    sort_order: 20,
    sources: [NHS_STRENGTH],
    body_markdown: `Most lower-body work is one of two shapes: a squat or a hinge. You do not need a perfect textbook copy. You need a path you can repeat.

## Squat
Think sit down, stand up. Knees and hips bend together. Heels stay down. The chest can lean a little. Stop at a depth you can own, then stand without rushing the last inch.

Goblet squats, leg press and many machines are still squats. If a free-weight squat feels unstable, a machine is a fair swap.

## Hinge
Think push the hips back, then stand tall. The spine stays long. You should feel the work in the back of the legs and the glutes, not as a pinch in the low back. Romanian deadlifts, hip thrusts and many kettlebell lifts are hinges.

If a hinge feels sharp, stop and pick the swap. Ask an instructor if you are unsure. Demos in the app are guidance, not a personal coaching session.`,
  }),
  article({
    id: 'brace-and-breathe',
    title: 'How to brace without holding your breath',
    summary: 'A gentle way to keep the middle quiet on a heavy-feeling set.',
    category: 'technique',
    read_minutes: 3,
    cover_image_id: 'cover-barbell-strength-8',
    is_pro: false,
    sort_order: 21,
    sources: [NHS_STRENGTH],
    body_markdown: `Bracing is just making the middle of you solid for a moment, so the load has a place to sit. It is not a competition to go red in the face.

Breathe in before the hard part. Gently press the ribs out into the belt line, as if you were about to be tapped in the stomach. Keep that for the lifting part. Breathe out as you finish the rep, or at the top.

You should still be able to keep the face calm. If you feel dizzy, put the weight down and breathe normally. That is enough for today.

On accessories, a lighter brace is fine. Save the stronger one for the main lift. Tempo cues such as a slow lower are there to help you feel the path, not to add drama.`,
  }),
  article({
    id: 'how-routines-are-built',
    title: 'How a routine is put together',
    summary: 'Phases, days and why the week repeats on purpose.',
    category: 'programmes',
    read_minutes: 3,
    cover_image_id: 'cover-stretch-desk',
    is_pro: false,
    sort_order: 30,
    sources: [GOV_ACTIVITY, NHS_ADULTS],
    body_markdown: `A routine is a named block with a finish line. It has a few phases, each with a job: learn the movements, build, then often a lighter week and a simple re-test.

## Why the days repeat
Repeating the same two, three or four days is how you learn the session. Variety can wait. When the lifts are familiar, adding a little load is easier to see.

Each day has a focus, a warm-up, one or two main lifts, then accessories. Rest times are longer on the main lifts so you can do the next set well.

UK activity guidelines for adults include muscle-strengthening work on at least two days a week, plus regular movement. A two, three or four day routine sits inside that, not on top of a secret extra plan.

You can switch or end a routine. Your log stays.`,
  }),
  article({
    id: 'double-progression',
    title: 'How double progression actually works',
    summary: 'When to add load, when to add reps, and why we never chase a max.',
    category: 'programmes',
    read_minutes: 4,
    cover_image_id: 'cover-stretch-full-body',
    is_pro: true,
    sort_order: 31,
    sources: [NHS_STRENGTH, GOV_ACTIVITY],
    body_markdown: `Double progression means you earn a small increase in load only after you can hit the top of the rep range, usually on the first set, with reps still left in the tank.

Until then, you stay on the same weight and try to add a rep or two. That is the whole rule. It is slow on purpose.

## Main lifts
Dumbbells often jump 1 to 2 kg. Barbells 2.5 kg. Machines, one plate. If the jump feels like too much, stay and add reps instead.

## Accessories
These usually add reps first. Holds add a few seconds. There is no prize for turning an accessory into a max effort.

We do not use one-rep max tests in beginner plans. Leave two or three reps in reserve. If a set gets ugly, stop. The next session will still be there.

This guide is general. It is not a personal programme review.`,
  }),
  article({
    id: 'rest-days-count',
    title: 'Rest days are part of the plan',
    summary: 'The week is built with days off. Taking them is not falling behind.',
    category: 'recovery',
    read_minutes: 2,
    cover_image_id: 'cover-stretch-post-leg',
    is_pro: false,
    sort_order: 40,
    sources: [NHS_ADULTS, NHS_SLEEP],
    body_markdown: `A rest day is not a hole in the week. Strength is built between sessions as well as in them.

Adult activity guidance includes rest and a mix of movement, not a session every calendar day. If your plan has three training days, the other four can be walks, stretches or nothing much.

Sleep, food and a quieter evening help more than an extra set you do not recover from. If you feel run down, swap to a stretch or take the day. A planned rest week, when you have one banked, keeps the habit without the load.

You have not lost the week by resting. You have used the plan as written.`,
  }),
  article({
    id: 'sleep-and-training',
    title: 'Sleep, training and the next session',
    summary: 'Why a shorter night is a reason to train a little kinder, not harder.',
    category: 'recovery',
    read_minutes: 4,
    cover_image_id: 'cover-stretch-lower-back',
    is_pro: true,
    sort_order: 41,
    sources: [NHS_SLEEP, NHS_ADULTS],
    body_markdown: `Sleep is where a lot of the repair happens. The NHS notes that too little sleep is linked with feeling low on energy and finding everyday tasks harder. Training is one of those tasks.

You do not need a perfect eight hours to train. You do need to notice a short night. On those days, keep the session, reduce the drama. Same lifts, tidy reps, skip the extra set.

Caffeine late in the day can make sleep harder for some people. A darker, cooler room helps others. None of this is a medical plan. If sleep has been poor for weeks, or you snore heavily and wake unrefreshed, speak to a doctor or other qualified professional.

A stretch session of ten minutes or more still counts toward showing up. Use it when a full lift day feels like too much.`,
  }),
  article({
    id: 'eating-around-training',
    title: 'Eating around training, without a diet',
    summary: 'Regular meals and enough fluid. No calorie targets, no meal plans.',
    category: 'fuelling',
    read_minutes: 3,
    cover_image_id: 'cover-stretch-upper',
    is_pro: false,
    sort_order: 50,
    sources: [NHS_EAT, NHS_EXERCISE],
    body_markdown: `You do not need a special diet to lift. NHS eat-well guidance is still the useful picture: regular meals, fruit and vegetables, some protein foods, and drinks.

Train when you have eaten enough to feel steady. Some people like a small snack an hour before. Some prefer a meal two hours before. Both are fine. If you feel light-headed, stop and have something to eat and drink.

After a session, an ordinary meal is enough. You do not need a shake unless you like one.

This app will not give calorie targets, macros or weight-loss promises. If you have a medical condition, are pregnant, or have a history of disordered eating, talk to a qualified professional before changing how you eat.`,
  }),
  article({
    id: 'protein-without-the-noise',
    title: 'Protein, without the noise',
    summary: 'Include a protein food in meals you already eat. That is the useful version.',
    category: 'fuelling',
    read_minutes: 3,
    cover_image_id: 'cover-stretch-hips',
    is_pro: true,
    sort_order: 51,
    sources: [NHS_EAT],
    body_markdown: `Protein foods help you repair muscle after strength work. The practical version is simple: include beans, lentils, dairy, eggs, fish, tofu or meat in the meals you already have.

You do not need a number on the screen. You do not need to eat chicken at every sitting. Spreading protein foods across the day is enough for most healthy adults.

Supplements are optional. Food first. If you use a powder, treat it as a snack, not a requirement.

This is general information from public eat-well guidance, not a meal plan and not medical advice. Anyone with kidney disease or another condition that affects protein should follow their clinician, not an app.`,
  }),
  article({
    id: 'showing-up',
    title: 'Showing up counts more than a perfect week',
    summary: 'A shorter session still moves the habit. Perfection is not the goal.',
    category: 'mindset',
    read_minutes: 2,
    cover_image_id: 'cover-full-body-3',
    is_pro: false,
    sort_order: 60,
    sources: [GOV_ACTIVITY],
    body_markdown: `The week you almost skipped still matters if you did one session. Strength is a pile of ordinary visits, not a streak of perfect ones.

If time is short, do the warm-up and the main lifts. Leave the accessories. Log what you did. That is an honest session.

We do not score you on volume. We do not send “you broke it” messages. A new week is a fresh start. Rest weeks and repairs exist so one quiet week does not wipe the story.

Come back when you can. The plan will still be there.`,
  }),
  article({
    id: 'coming-back',
    title: 'Coming back after a gap',
    summary: 'Start lighter than you left. The strength is not gone. It is quieter.',
    category: 'mindset',
    read_minutes: 3,
    cover_image_id: 'cover-one-spot-2',
    is_pro: false,
    sort_order: 61,
    sources: [NHS_EXERCISE, NHS_STRENGTH],
    body_markdown: `Time away happens. Illness, work, holidays, a week that got away. You have not undone the work.

When you open the app after a gap, take the lighter session if it is offered. Fewer sets, a little less load. The pattern is the same, so the skill comes back faster than the ego wants to admit.

You can also restart the current week, or switch to a calmer routine if you have been away a while. None of those is a demotion.

The first session back is for feeling the path, not matching your old numbers. Write down what you actually lifted. Next week can add a little.`,
  }),
  article({
    id: 'you-will-not-bulk-overnight',
    title: 'You will not bulk overnight',
    summary: 'Getting stronger is slow. Looking “big” from a few weeks of lifting is a myth.',
    category: 'myths',
    read_minutes: 3,
    cover_image_id: 'cover-joint-friendly-6',
    is_pro: false,
    sort_order: 70,
    sources: [NHS_STRENGTH, NHS_EXERCISE],
    body_markdown: `A common worry is that lifting will make you bulky in a few weeks. Building a large amount of muscle takes years of focused training and a lot of food. Beginner programmes do not do that by accident.

What you might notice first is that everyday tasks feel easier, and that you can lift a little more than last month. Clothes may fit differently because you are using the muscle you already have, not because you have become someone else overnight.

Lifting does not replace medical care, and it is not a weight-loss plan. If your goal includes losing body fat, the useful response is still strength work plus the ordinary eat-well pattern, not a promise from an app.

Train in a range you can control. Add load slowly. That is how it stays.`,
  }),
];

export const LEARN_LINKS: LearnLink[] = [
  { article_id: 'first-gym-session', routine_id: 'gym-confidence-6', exercise_id: null },
  { article_id: 'first-gym-session', routine_id: 'one-spot-6', exercise_id: null },
  { article_id: 'one-spot-sessions', routine_id: 'gym-confidence-6', exercise_id: null },
  { article_id: 'one-spot-sessions', routine_id: 'one-spot-6', exercise_id: null },
  { article_id: 'one-spot-sessions', routine_id: 'one-spot-2', exercise_id: null },
  { article_id: 'if-kit-is-taken', routine_id: 'busy-gym-6', exercise_id: null },
  { article_id: 'if-kit-is-taken', routine_id: 'gym-confidence-6', exercise_id: null },
  { article_id: 'starting-weights', routine_id: 'gym-confidence-6', exercise_id: null },
  { article_id: 'starting-weights', routine_id: 'full-body-3', exercise_id: null },
  { article_id: 'how-logging-helps', routine_id: 'full-body-3', exercise_id: null },
  { article_id: 'how-routines-are-built', routine_id: 'full-body-3', exercise_id: null },
  { article_id: 'how-routines-are-built', routine_id: 'gym-confidence-6', exercise_id: null },
  { article_id: 'double-progression', routine_id: 'full-body-3', exercise_id: null },
  { article_id: 'double-progression', routine_id: 'barbell-strength-8', exercise_id: null },
  { article_id: 'squat-and-hinge', routine_id: 'glute-builder-6', exercise_id: null },
  { article_id: 'squat-and-hinge', routine_id: 'lower-body-3', exercise_id: null },
  { article_id: 'squat-and-hinge', routine_id: null, exercise_id: 'goblet-squat' },
  { article_id: 'squat-and-hinge', routine_id: null, exercise_id: 'leg-press' },
  { article_id: 'squat-and-hinge', routine_id: null, exercise_id: 'dumbbell-romanian-deadlift' },
  { article_id: 'squat-and-hinge', routine_id: null, exercise_id: 'barbell-deadlift' },
  { article_id: 'squat-and-hinge', routine_id: null, exercise_id: 'dumbbell-hip-thrust' },
  { article_id: 'brace-and-breathe', routine_id: null, exercise_id: 'goblet-squat' },
  { article_id: 'brace-and-breathe', routine_id: null, exercise_id: 'barbell-deadlift' },
  { article_id: 'coming-back', routine_id: 'gym-confidence-6', exercise_id: null },
  { article_id: 'rest-days-count', routine_id: 'full-body-2', exercise_id: null },
  { article_id: 'you-will-not-bulk-overnight', routine_id: 'gym-confidence-6', exercise_id: null },
];
