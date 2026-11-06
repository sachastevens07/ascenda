-- X5 onboarding v2. Paste into Supabase > SQL Editor after review.
-- Safe to run again. Does not touch sessions, sets, enrolments or other user history.
-- Under 18 is never stored: age_band only accepts adult ranges.

alter table public.profiles
  add column if not exists onboarding_answers jsonb not null default '{}'::jsonb;

alter table public.profiles
  add column if not exists age_band text;

alter table public.profiles
  add column if not exists cardio_preference text;

alter table public.profiles drop constraint if exists profiles_age_band_check;
alter table public.profiles add constraint profiles_age_band_check check (
  age_band is null
  or age_band in ('18_24', '25_34', '35_44', '45_54', '55_plus')
);

alter table public.profiles drop constraint if exists profiles_cardio_preference_check;
alter table public.profiles add constraint profiles_cardio_preference_check check (
  cardio_preference is null
  or cardio_preference in ('love', 'fine', 'avoid')
);

comment on column public.profiles.onboarding_answers is
  'X5 extras: statement scores, machines_used, preferred_days. Never stores under-18.';

comment on column public.profiles.age_band is
  'Adult age range only. Under 18 is never written.';

comment on column public.profiles.cardio_preference is
  'How she feels about cardio: love, fine or avoid. Used later for weekly cardio amount.';
