-- v2.2 H8: rolling challenge starts (next Monday or the 1st of the month).
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets, or challenge joins.
-- Catalogue rows use content slugs. start_date lives on challenge_participants.
-- Challenges run alongside any routine, so routine_id is optional.
-- Needs public.routines and public.images only if you still have older rows
-- that point at them. New content rows do not need a routine.

create table if not exists public.challenges (
  id text primary key,
  name text not null,
  description text not null,
  cover_image_id text,
  routine_id text,
  start_date date,
  end_date date,
  is_pro boolean not null default false
);

create table if not exists public.challenge_participants (
  challenge_id text not null references public.challenges (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (challenge_id, user_id)
);

alter table public.challenges alter column routine_id drop not null;
alter table public.challenges alter column start_date drop not null;
alter table public.challenges alter column end_date drop not null;
alter table public.challenges drop constraint if exists challenges_dates_check;

alter table public.challenge_participants
  add column if not exists start_date date;

alter table public.challenge_participants
  add column if not exists end_date date;

create index if not exists challenge_participants_user_idx
  on public.challenge_participants (user_id, joined_at desc);

do $$
begin
  alter table public.challenge_participants
    drop constraint if exists challenge_participants_window_check;
  alter table public.challenge_participants
    add constraint challenge_participants_window_check check (
      start_date is null
      or end_date is null
      or end_date >= start_date
    );
exception
  when duplicate_object then
    null;
end $$;

insert into public.challenges (id, name, description, is_pro)
values
  (
    'four-weeks-strong',
    'Four Weeks Strong',
    'Three sessions a week for four weeks. Build the habit that makes everything else easier.',
    false
  ),
  (
    'the-gym-explorer',
    'The Gym Explorer',
    'Try one new thing each week and make more of the gym feel like yours.',
    false
  ),
  (
    '28-days-of-stretch',
    '28 Days of Stretch',
    'Three stretch sessions a week for four weeks. Feel looser, calmer and ready to train.',
    false
  ),
  (
    'quiet-start',
    'Quiet Start',
    'Two calm sessions a week for four weeks, all in one spot. The gentlest way to begin.',
    false
  )
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description;

alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;

drop policy if exists "Signed-in users can read challenges" on public.challenges;
create policy "Signed-in users can read challenges" on public.challenges
  for select to authenticated using (true);

drop policy if exists "Signed-in users can read challenge joins" on public.challenge_participants;
create policy "Signed-in users can read challenge joins" on public.challenge_participants
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users can join challenges" on public.challenge_participants;
create policy "Users can join challenges" on public.challenge_participants
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users can update their own challenge joins" on public.challenge_participants;
create policy "Users can update their own challenge joins" on public.challenge_participants
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists "Users can leave challenges" on public.challenge_participants;
create policy "Users can leave challenges" on public.challenge_participants
  for delete to authenticated using (user_id = (select auth.uid()));

grant select on public.challenges to authenticated;
grant select, insert, update, delete on public.challenge_participants to authenticated;
