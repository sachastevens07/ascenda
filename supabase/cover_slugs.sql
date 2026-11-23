-- Point routines, paths and challenges at the current cover slugs.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets, enrolments or old routine rows.
--
-- The live catalogue uses slugs such as strong-foundations-cover, not the old
-- Pexels ids (cover-gym-confidence-6 and friends). Those old ids stayed on
-- routines.cover_image_id if content_routines_1.sql or images_manifest.sql
-- was skipped. This file only remaps covers. It does not rebuild weeks or days.
--
-- Needs public.images and public.routines. Does not overwrite a photo that
-- is already marked ready.

do $$
begin
  if to_regclass('public.images') is null or to_regclass('public.routines') is null then
    raise exception 'Run supabase/routines.sql first, then paste this file again.';
  end if;
end $$;

alter table public.images add column if not exists slug text;
update public.images set slug = id where slug is null or btrim(slug) = '';

insert into public.images (id, slug, alt_text) values
  ('strong-foundations-cover', 'strong-foundations-cover', 'Strong Foundations in 6 Weeks'),
  ('two-day-start-cover', 'two-day-start-cover', 'The Two-Day Start'),
  ('the-climb-cover', 'the-climb-cover', 'The Climb in 8 Weeks'),
  ('glute-challenge-cover', 'glute-challenge-cover', '30-Day Glute Challenge'),
  ('glutes-legs-cover', 'glutes-legs-cover', 'Glutes and Legs in 8 Weeks'),
  ('higher-ground-cover', 'higher-ground-cover', 'Higher Ground'),
  ('upper-body-cover', 'upper-body-cover', 'Upper Body Strong in 6 Weeks'),
  ('quick-ascent-cover', 'quick-ascent-cover', 'Quick Ascent'),
  ('busy-gym-cover', 'busy-gym-cover', 'Dumbbells and a Bench'),
  ('four-day-foundation-cover', 'four-day-foundation-cover', 'The Four-Day Foundation'),
  ('twice-a-week-strong-cover', 'twice-a-week-strong-cover', 'Twice a Week Strong'),
  ('machines-cover', 'machines-cover', 'Machines Made Easy'),
  ('summit-cover', 'summit-cover', 'Summit'),
  ('strong-for-life-cover', 'strong-for-life-cover', 'Strong for Life'),
  ('welcome-back-cover', 'welcome-back-cover', 'Welcome Back: 4-Week Restart'),
  ('strong-and-fit-cover', 'strong-and-fit-cover', 'Strong and Fit in 8 Weeks'),
  ('strength-and-stamina-cover', 'strength-and-stamina-cover', 'Strength and Stamina'),
  ('one-spot-cover', 'one-spot-cover', 'Dumbbells and a Bench: Full Body'),
  ('home-dumbbell-cover', 'home-dumbbell-cover', 'Days you cannot get to the gym'),
  ('first-session-cover', 'first-session-cover', 'Your First Gym Session'),
  ('challenge-four-weeks-strong', 'challenge-four-weeks-strong', 'Four Weeks Strong'),
  ('morning-mobility-cover', 'morning-mobility-cover', 'Morning Mobility'),
  ('after-leg-day-cover', 'after-leg-day-cover', 'After Leg Day'),
  ('desk-reset-cover', 'desk-reset-cover', 'Desk Reset'),
  ('happy-hips-cover', 'happy-hips-cover', 'Happy Hips'),
  ('back-unwind-cover', 'back-unwind-cover', 'Back Unwind'),
  ('shoulders-cover', 'shoulders-cover', 'Shoulders and Upper Back'),
  ('recovery-flow-cover', 'recovery-flow-cover', 'Full-Body Recovery Flow'),
  ('wind-down-cover', 'wind-down-cover', 'Wind Down')
on conflict (id) do update set
  slug = excluded.slug,
  alt_text = excluded.alt_text;

-- Leftover Pexels rows keep their files. same_as sends the app to the new slug.
update public.images set same_as = 'strong-foundations-cover' where id = 'cover-gym-confidence-6';
update public.images set same_as = 'quick-ascent-cover' where id = 'cover-full-body-3';
update public.images set same_as = 'busy-gym-cover' where id in ('cover-one-spot-6', 'cover-busy-gym-6');
update public.images set same_as = 'four-day-foundation-cover' where id = 'cover-upper-lower-4';
update public.images set same_as = 'glutes-legs-cover' where id in ('cover-lower-body-3', 'cover-glute-builder-6');
update public.images set same_as = 'twice-a-week-strong-cover' where id = 'cover-full-body-2';
update public.images set same_as = 'home-dumbbell-cover' where id = 'cover-home-strength-6';
update public.images set same_as = 'upper-body-cover' where id = 'cover-upper-body-6';
update public.images set same_as = 'strong-for-life-cover' where id = 'cover-joint-friendly-6';
update public.images set same_as = 'challenge-four-weeks-strong' where id = 'cover-short-cycle-4';
update public.images set same_as = 'higher-ground-cover' where id = 'cover-barbell-strength-8';
update public.images set same_as = 'two-day-start-cover' where id = 'cover-one-spot-2';
update public.images set same_as = 'morning-mobility-cover' where id = 'cover-stretch-morning';
update public.images set same_as = 'desk-reset-cover' where id = 'cover-stretch-desk';
update public.images set same_as = 'after-leg-day-cover' where id = 'cover-stretch-post-leg';
update public.images set same_as = 'back-unwind-cover' where id = 'cover-stretch-lower-back';
update public.images set same_as = 'recovery-flow-cover' where id = 'cover-stretch-full-body';
update public.images set same_as = 'shoulders-cover' where id = 'cover-stretch-upper';
update public.images set same_as = 'happy-hips-cover' where id = 'cover-stretch-hips';

-- Current catalogue
update public.routines set cover_image_id = 'strong-foundations-cover' where id = 'strong-foundations-6-weeks';
update public.routines set cover_image_id = 'two-day-start-cover' where id = 'the-two-day-start';
update public.routines set cover_image_id = 'the-climb-cover' where id = 'the-climb-in-8-weeks';
update public.routines set cover_image_id = 'glute-challenge-cover' where id = '30-day-glute-challenge';
update public.routines set cover_image_id = 'glutes-legs-cover' where id = 'glutes-and-legs-in-8-weeks';
update public.routines set cover_image_id = 'higher-ground-cover' where id = 'higher-ground';
update public.routines set cover_image_id = 'upper-body-cover' where id = 'upper-body-strong-in-6-weeks';
update public.routines set cover_image_id = 'quick-ascent-cover' where id = 'quick-ascent';
update public.routines set cover_image_id = 'busy-gym-cover' where id = 'busy-gym-no-problem';
update public.routines set cover_image_id = 'four-day-foundation-cover' where id = 'the-four-day-foundation';
update public.routines set cover_image_id = 'twice-a-week-strong-cover' where id = 'twice-a-week-strong';
update public.routines set cover_image_id = 'machines-cover' where id = 'machines-made-easy';
update public.routines set cover_image_id = 'summit-cover' where id = 'summit';
update public.routines set cover_image_id = 'strong-for-life-cover' where id = 'strong-for-life';
update public.routines set cover_image_id = 'welcome-back-cover' where id = 'welcome-back-4-week-restart';
update public.routines set cover_image_id = 'strong-and-fit-cover' where id = 'strong-and-fit-in-8-weeks';
update public.routines set cover_image_id = 'strength-and-stamina-cover' where id = 'strength-and-stamina';
update public.routines set cover_image_id = 'morning-mobility-cover' where id = 'stretch-morning';
update public.routines set cover_image_id = 'after-leg-day-cover' where id = 'stretch-post-leg';
update public.routines set cover_image_id = 'desk-reset-cover' where id = 'stretch-desk';
update public.routines set cover_image_id = 'happy-hips-cover' where id = 'stretch-hips';
update public.routines set cover_image_id = 'back-unwind-cover' where id = 'stretch-lower-back';
update public.routines set cover_image_id = 'shoulders-cover' where id = 'stretch-upper';
update public.routines set cover_image_id = 'recovery-flow-cover' where id = 'stretch-full-body';
update public.routines set cover_image_id = 'wind-down-cover' where id = 'wind-down';

-- Leftover original 14 ids (enrolments stay on these rows)
update public.routines set cover_image_id = 'strong-foundations-cover' where id = 'gym-confidence-6';
update public.routines set cover_image_id = 'quick-ascent-cover' where id = 'full-body-3';
update public.routines set cover_image_id = 'busy-gym-cover' where id in ('one-spot-6', 'busy-gym-6');
update public.routines set cover_image_id = 'four-day-foundation-cover' where id = 'upper-lower-4';
update public.routines set cover_image_id = 'glutes-legs-cover' where id in ('lower-body-3', 'glute-builder-6');
update public.routines set cover_image_id = 'twice-a-week-strong-cover' where id = 'full-body-2';
update public.routines set cover_image_id = 'home-dumbbell-cover' where id = 'home-strength-6';
update public.routines set cover_image_id = 'upper-body-cover' where id = 'upper-body-6';
update public.routines set cover_image_id = 'strong-for-life-cover' where id = 'joint-friendly-6';
update public.routines set cover_image_id = 'challenge-four-weeks-strong' where id = 'short-cycle-4';
update public.routines set cover_image_id = 'higher-ground-cover' where id = 'barbell-strength-8';
update public.routines set cover_image_id = 'two-day-start-cover' where id = 'one-spot-2';

do $$
begin
  if to_regclass('public.routine_paths') is not null then
    update public.routine_paths
      set cover_image_id = 'strong-foundations-cover'
      where cover_image_id = 'cover-gym-confidence-6';
  end if;
  if to_regclass('public.challenges') is not null then
    update public.challenges
      set cover_image_id = 'strong-foundations-cover'
      where cover_image_id = 'cover-gym-confidence-6';
    update public.challenges
      set cover_image_id = 'busy-gym-cover'
      where cover_image_id = 'cover-one-spot-6';
    update public.challenges
      set cover_image_id = 'challenge-four-weeks-strong'
      where cover_image_id in ('cover-short-cycle-4', 'four-weeks-strong-cover');
  end if;
end $$;
