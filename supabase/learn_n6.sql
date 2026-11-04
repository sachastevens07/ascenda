-- v2.2 N6: Learn articles, related links and reading progress.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets, enrolments or account data.
-- Article bodies stay in the app (src/lib/learnArticles.ts) so this paste stays small.
-- If body_markdown is later filled here, the app uses that copy instead.

create table if not exists public.learn_articles (
  id text primary key,
  slug text not null unique,
  title text not null,
  summary text not null default '',
  category text not null,
  read_minutes smallint not null default 3,
  cover_image_id text,
  body_markdown text,
  is_pro boolean not null default false,
  sources jsonb not null default '[]'::jsonb,
  reviewed_by text,
  reviewed_at timestamptz,
  published_at date,
  sort_order integer not null default 0
);

alter table public.learn_articles drop constraint if exists learn_articles_category_check;
alter table public.learn_articles add constraint learn_articles_category_check
  check (category in (
    'getting_started', 'gym_confidence', 'technique', 'programmes',
    'recovery', 'fuelling', 'mindset', 'myths'
  ));

create table if not exists public.learn_links (
  article_id text not null references public.learn_articles (id) on delete cascade,
  routine_id text,
  exercise_id text
);

alter table public.learn_links drop constraint if exists learn_links_target_check;
alter table public.learn_links add constraint learn_links_target_check
  check (routine_id is not null or exercise_id is not null);

create unique index if not exists learn_links_unique_idx
  on public.learn_links (article_id, coalesce(routine_id, ''), coalesce(exercise_id, ''));

create table if not exists public.article_reads (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  article_id text not null references public.learn_articles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, article_id)
);

create index if not exists article_reads_user_idx
  on public.article_reads (user_id, read_at desc);

alter table public.learn_articles enable row level security;
alter table public.learn_links enable row level security;
alter table public.article_reads enable row level security;

drop policy if exists "Signed-in users can read learn articles" on public.learn_articles;
create policy "Signed-in users can read learn articles" on public.learn_articles
  for select to authenticated using (true);

drop policy if exists "Signed-in users can read learn links" on public.learn_links;
create policy "Signed-in users can read learn links" on public.learn_links
  for select to authenticated using (true);

drop policy if exists "Users can read their own article reads" on public.article_reads;
create policy "Users can read their own article reads" on public.article_reads
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can write their own article reads" on public.article_reads;
create policy "Users can write their own article reads" on public.article_reads
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their own article reads" on public.article_reads;
create policy "Users can update their own article reads" on public.article_reads
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own article reads" on public.article_reads;
create policy "Users can delete their own article reads" on public.article_reads
  for delete to authenticated using (user_id = (select auth.uid()));

grant select on public.learn_articles to authenticated;
grant select on public.learn_links to authenticated;
grant select, insert, update, delete on public.article_reads to authenticated;

insert into public.learn_articles (
  id, slug, title, summary, category, read_minutes, cover_image_id, is_pro, sources, published_at, sort_order
) values
  ('first-gym-session', 'first-gym-session', 'Your first gym session, step by step',
    'A calm order of events for walking in, finding a spot and leaving with a log.',
    'getting_started', 3, 'cover-full-body-2', false,
    '[{"label":"NHS: exercise","url":"https://www.nhs.uk/live-well/exercise/"},{"label":"NHS: strength and flexibility","url":"https://www.nhs.uk/live-well/exercise/strength-and-flexibility-exercises/"}]'::jsonb,
    '2026-11-04', 1),
  ('how-logging-helps', 'how-logging-helps', 'Why logging a session helps you get stronger',
    'The log is how the next session knows what to suggest. Keep it simple.',
    'getting_started', 2, 'cover-busy-gym-6', false,
    '[{"label":"NHS: strength and flexibility","url":"https://www.nhs.uk/live-well/exercise/strength-and-flexibility-exercises/"}]'::jsonb,
    '2026-11-04', 2),
  ('starting-weights', 'starting-weights', 'How to pick a starting weight',
    'Find a load you could lift three more times. Then write it down.',
    'getting_started', 3, 'cover-upper-lower-4', false,
    '[{"label":"NHS: strength and flexibility","url":"https://www.nhs.uk/live-well/exercise/strength-and-flexibility-exercises/"}]'::jsonb,
    '2026-11-04', 3),
  ('one-spot-sessions', 'one-spot-sessions', 'Why one-spot sessions make the gym smaller',
    'Stay in one area, repeat the same shapes, and the room gets quieter.',
    'gym_confidence', 3, 'cover-lower-body-3', false,
    '[{"label":"NHS: exercise","url":"https://www.nhs.uk/live-well/exercise/"}]'::jsonb,
    '2026-11-04', 10),
  ('if-kit-is-taken', 'if-kit-is-taken', 'What to do when the kit is taken',
    'Swap, wait one set, or skip. The session still counts.',
    'gym_confidence', 2, 'cover-upper-body-6', false,
    '[{"label":"NHS: exercise","url":"https://www.nhs.uk/live-well/exercise/"}]'::jsonb,
    '2026-11-04', 11),
  ('squat-and-hinge', 'squat-and-hinge', 'Squat and hinge, in plain English',
    'Two patterns that show up every week, and how they should feel.',
    'technique', 4, 'cover-glute-builder-6', false,
    '[{"label":"NHS: strength and flexibility","url":"https://www.nhs.uk/live-well/exercise/strength-and-flexibility-exercises/"}]'::jsonb,
    '2026-11-04', 20),
  ('brace-and-breathe', 'brace-and-breathe', 'How to brace without holding your breath',
    'A gentle way to keep the middle quiet on a heavy-feeling set.',
    'technique', 3, 'cover-barbell-strength-8', false,
    '[{"label":"NHS: strength and flexibility","url":"https://www.nhs.uk/live-well/exercise/strength-and-flexibility-exercises/"}]'::jsonb,
    '2026-11-04', 21),
  ('how-routines-are-built', 'how-routines-are-built', 'How a routine is put together',
    'Phases, days and why the week repeats on purpose.',
    'programmes', 3, 'cover-stretch-desk', false,
    '[{"label":"UK Chief Medical Officers: physical activity guidelines","url":"https://www.gov.uk/government/publications/physical-activity-guidelines-adults-and-older-adults"}]'::jsonb,
    '2026-11-04', 30),
  ('double-progression', 'double-progression', 'How double progression actually works',
    'When to add load, when to add reps, and why we never chase a max.',
    'programmes', 4, 'cover-stretch-full-body', true,
    '[{"label":"NHS: strength and flexibility","url":"https://www.nhs.uk/live-well/exercise/strength-and-flexibility-exercises/"}]'::jsonb,
    '2026-11-04', 31),
  ('rest-days-count', 'rest-days-count', 'Rest days are part of the plan',
    'The week is built with days off. Taking them is not falling behind.',
    'recovery', 2, 'cover-stretch-post-leg', false,
    '[{"label":"NHS: why sleep matters","url":"https://www.nhs.uk/live-well/sleep-and-tiredness/why-lack-of-sleep-is-bad-for-your-health/"}]'::jsonb,
    '2026-11-04', 40),
  ('sleep-and-training', 'sleep-and-training', 'Sleep, training and the next session',
    'Why a shorter night is a reason to train a little kinder, not harder.',
    'recovery', 4, 'cover-stretch-lower-back', true,
    '[{"label":"NHS: why sleep matters","url":"https://www.nhs.uk/live-well/sleep-and-tiredness/why-lack-of-sleep-is-bad-for-your-health/"}]'::jsonb,
    '2026-11-04', 41),
  ('eating-around-training', 'eating-around-training', 'Eating around training, without a diet',
    'Regular meals and enough fluid. No calorie targets, no meal plans.',
    'fuelling', 3, 'cover-stretch-upper', false,
    '[{"label":"NHS: eat well","url":"https://www.nhs.uk/live-well/eat-well/"}]'::jsonb,
    '2026-11-04', 50),
  ('protein-without-the-noise', 'protein-without-the-noise', 'Protein, without the noise',
    'Include a protein food in meals you already eat. That is the useful version.',
    'fuelling', 3, 'cover-stretch-hips', true,
    '[{"label":"NHS: eat well","url":"https://www.nhs.uk/live-well/eat-well/"}]'::jsonb,
    '2026-11-04', 51),
  ('showing-up', 'showing-up', 'Showing up counts more than a perfect week',
    'A shorter session still moves the habit. Perfection is not the goal.',
    'mindset', 2, 'cover-full-body-3', false,
    '[{"label":"UK Chief Medical Officers: physical activity guidelines","url":"https://www.gov.uk/government/publications/physical-activity-guidelines-adults-and-older-adults"}]'::jsonb,
    '2026-11-04', 60),
  ('coming-back', 'coming-back', 'Coming back after a gap',
    'Start lighter than you left. The strength is not gone. It is quieter.',
    'mindset', 3, 'cover-one-spot-2', false,
    '[{"label":"NHS: exercise","url":"https://www.nhs.uk/live-well/exercise/"}]'::jsonb,
    '2026-11-04', 61),
  ('you-will-not-bulk-overnight', 'you-will-not-bulk-overnight', 'You will not bulk overnight',
    'Getting stronger is slow. Looking big from a few weeks of lifting is a myth.',
    'myths', 3, 'cover-joint-friendly-6', false,
    '[{"label":"NHS: strength and flexibility","url":"https://www.nhs.uk/live-well/exercise/strength-and-flexibility-exercises/"}]'::jsonb,
    '2026-11-04', 70)
on conflict (id) do update set
  title = excluded.title,
  summary = excluded.summary,
  category = excluded.category,
  read_minutes = excluded.read_minutes,
  cover_image_id = excluded.cover_image_id,
  is_pro = excluded.is_pro,
  sources = excluded.sources,
  published_at = excluded.published_at,
  sort_order = excluded.sort_order;

insert into public.learn_links (article_id, routine_id, exercise_id)
select * from (values
  ('first-gym-session', 'gym-confidence-6', null),
  ('first-gym-session', 'one-spot-6', null),
  ('one-spot-sessions', 'gym-confidence-6', null),
  ('one-spot-sessions', 'one-spot-6', null),
  ('one-spot-sessions', 'one-spot-2', null),
  ('if-kit-is-taken', 'busy-gym-6', null),
  ('if-kit-is-taken', 'gym-confidence-6', null),
  ('starting-weights', 'gym-confidence-6', null),
  ('starting-weights', 'full-body-3', null),
  ('how-logging-helps', 'full-body-3', null),
  ('how-routines-are-built', 'full-body-3', null),
  ('how-routines-are-built', 'gym-confidence-6', null),
  ('double-progression', 'full-body-3', null),
  ('double-progression', 'barbell-strength-8', null),
  ('squat-and-hinge', 'glute-builder-6', null),
  ('squat-and-hinge', 'lower-body-3', null),
  ('squat-and-hinge', null, 'goblet-squat'),
  ('squat-and-hinge', null, 'leg-press'),
  ('squat-and-hinge', null, 'dumbbell-romanian-deadlift'),
  ('squat-and-hinge', null, 'barbell-deadlift'),
  ('squat-and-hinge', null, 'dumbbell-hip-thrust'),
  ('brace-and-breathe', null, 'goblet-squat'),
  ('brace-and-breathe', null, 'barbell-deadlift'),
  ('coming-back', 'gym-confidence-6', null),
  ('rest-days-count', 'full-body-2', null),
  ('you-will-not-bulk-overnight', 'gym-confidence-6', null)
) as seed(article_id, routine_id, exercise_id)
where exists (select 1 from public.learn_articles a where a.id = seed.article_id)
  and not exists (
    select 1 from public.learn_links l
    where l.article_id = seed.article_id
      and coalesce(l.routine_id, '') = coalesce(seed.routine_id, '')
      and coalesce(l.exercise_id, '') = coalesce(seed.exercise_id, '')
  );
