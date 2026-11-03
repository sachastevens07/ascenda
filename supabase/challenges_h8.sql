-- v2.2 H8: rolling challenge starts (Monday or the 1st of the month).
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets, or challenge joins.
-- Needs public.routines and public.images (from supabase/routines.sql).
-- Creates the challenges tables if supabase/paths.sql has not been run yet.

do $$
begin
  if to_regclass('public.routines') is null or to_regclass('public.images') is null then
    raise exception 'Run supabase/routines.sql first, then paste this file again.';
  end if;
end $$;

create table if not exists public.challenges (
  id text primary key,
  name text not null,
  description text not null,
  cover_image_id text references public.images (id) on delete set null,
  routine_id text not null references public.routines (id),
  start_date date not null,
  end_date date not null,
  is_pro boolean not null default false
);

create table if not exists public.challenge_participants (
  challenge_id text not null references public.challenges (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (challenge_id, user_id)
);

create index if not exists challenge_participants_user_idx
  on public.challenge_participants (user_id, joined_at desc);

alter table public.challenge_participants
  add column if not exists start_date date;

alter table public.challenge_participants
  add column if not exists end_date date;

update public.challenge_participants p
set
  start_date = c.start_date,
  end_date = c.end_date
from public.challenges c
where p.challenge_id = c.id
  and p.start_date is null
  and p.end_date is null;

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

insert into public.challenges (
  id, name, description, cover_image_id, routine_id, start_date, end_date, is_pro
)
select
  'challenge-quiet-nov',
  'Quiet start',
  'Four weeks of Gym Confidence, starting in a one-spot dumbbell corner. Start on any Monday or the 1st of the month. No leaderboard.',
  (select id from public.images where id = 'cover-gym-confidence-6'),
  'gym-confidence-6',
  date '2026-11-01',
  date '2026-11-28',
  false
where exists (select 1 from public.routines where id = 'gym-confidence-6')
on conflict (id) do update
set description = excluded.description;

insert into public.challenges (
  id, name, description, cover_image_id, routine_id, start_date, end_date, is_pro
)
select
  'challenge-new-year',
  'New Year, Quiet Start',
  'A calm four-week reset with Gym Confidence. Start on any Monday or the 1st of the month. No leaderboard.',
  coalesce(
    (select id from public.images where id = 'cover-one-spot-6'),
    (select id from public.images where id = 'cover-gym-confidence-6')
  ),
  'gym-confidence-6',
  date '2027-01-04',
  date '2027-01-31',
  false
where exists (select 1 from public.routines where id = 'gym-confidence-6')
on conflict (id) do update
set description = excluded.description;

alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;

drop policy if exists "Signed-in users can read challenges" on public.challenges;
create policy "Signed-in users can read challenges" on public.challenges
  for select to authenticated using (true);

drop policy if exists "Signed-in users can read challenge joins" on public.challenge_participants;
create policy "Signed-in users can read challenge joins" on public.challenge_participants
  for select to authenticated using (true);
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
