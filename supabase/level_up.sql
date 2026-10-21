-- v1.1 C5: level-up moments. After 4 sessions at her level she can try one exercise
-- from the next zone; after she completes it twice she can move up a level.
-- Run after zones.sql and onboarding_v1_1.sql.
-- Paste the whole file into Supabase > SQL Editor and click Run. Safe to run again.

-- Level changes. Keep columns in step with ConfidenceHistory in src/lib/levelUp.ts.
create table if not exists public.confidence_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null default current_date,
  from_level smallint not null,
  to_level smallint not null,
  created_at timestamptz not null default now()
);

alter table public.confidence_history drop constraint if exists confidence_history_from_level_check;
alter table public.confidence_history add constraint confidence_history_from_level_check check (
  from_level between 1 and 4
);
alter table public.confidence_history drop constraint if exists confidence_history_to_level_check;
alter table public.confidence_history add constraint confidence_history_to_level_check check (
  to_level between 1 and 4
);

create index if not exists confidence_history_user_created_idx
  on public.confidence_history (user_id, created_at desc);

alter table public.confidence_history enable row level security;

drop policy if exists "Users can read their own confidence history" on public.confidence_history;
create policy "Users can read their own confidence history" on public.confidence_history
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can create their own confidence history" on public.confidence_history;
create policy "Users can create their own confidence history" on public.confidence_history
  for insert to authenticated with check ((select auth.uid()) = user_id);

grant select, insert on public.confidence_history to authenticated;

-- One open try at a time: the next-zone exercise she's been offered.
-- Keep status values in step with LEVEL_CHALLENGE_STATUSES in src/lib/levelUp.ts.
create table if not exists public.level_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_level smallint not null,
  exercise_id text not null references public.exercises (id),
  status text not null,
  offered_at timestamptz not null default now(),
  accepted_at timestamptz,
  resolved_at timestamptz
);

alter table public.level_challenges drop constraint if exists level_challenges_from_level_check;
alter table public.level_challenges add constraint level_challenges_from_level_check check (
  from_level between 1 and 3
);
alter table public.level_challenges drop constraint if exists level_challenges_status_check;
alter table public.level_challenges add constraint level_challenges_status_check check (
  status in ('offered', 'accepted', 'ready', 'declined', 'completed', 'level_declined')
);

create unique index if not exists level_challenges_one_open_idx
  on public.level_challenges (user_id)
  where resolved_at is null;

create index if not exists level_challenges_user_resolved_idx
  on public.level_challenges (user_id, resolved_at desc);

alter table public.level_challenges enable row level security;

drop policy if exists "Users can read their own level challenges" on public.level_challenges;
create policy "Users can read their own level challenges" on public.level_challenges
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can create their own level challenges" on public.level_challenges;
create policy "Users can create their own level challenges" on public.level_challenges
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own level challenges" on public.level_challenges;
create policy "Users can update their own level challenges" on public.level_challenges
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own level challenges" on public.level_challenges;
create policy "Users can delete their own level challenges" on public.level_challenges
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.level_challenges to authenticated;
