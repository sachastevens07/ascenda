-- v2.2 X4: per-exercise notes and rest-timer prefs, remembered next time.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Does not touch sessions, sets, routines or profiles.

create table if not exists public.exercise_notes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_id text not null,
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

create table if not exists public.exercise_rest_prefs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_id text not null,
  rest_seconds integer not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

alter table public.exercise_rest_prefs drop constraint if exists exercise_rest_prefs_seconds_check;
alter table public.exercise_rest_prefs
  add constraint exercise_rest_prefs_seconds_check
  check (rest_seconds >= 15 and rest_seconds <= 600);

create index if not exists exercise_notes_user_idx on public.exercise_notes (user_id);
create index if not exists exercise_rest_prefs_user_idx on public.exercise_rest_prefs (user_id);

alter table public.exercise_notes enable row level security;
alter table public.exercise_rest_prefs enable row level security;

drop policy if exists "Users can read their own exercise notes" on public.exercise_notes;
create policy "Users can read their own exercise notes" on public.exercise_notes
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can write their own exercise notes" on public.exercise_notes;
create policy "Users can write their own exercise notes" on public.exercise_notes
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their own exercise notes" on public.exercise_notes;
create policy "Users can update their own exercise notes" on public.exercise_notes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own exercise notes" on public.exercise_notes;
create policy "Users can delete their own exercise notes" on public.exercise_notes
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can read their own exercise rest prefs" on public.exercise_rest_prefs;
create policy "Users can read their own exercise rest prefs" on public.exercise_rest_prefs
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can write their own exercise rest prefs" on public.exercise_rest_prefs;
create policy "Users can write their own exercise rest prefs" on public.exercise_rest_prefs
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their own exercise rest prefs" on public.exercise_rest_prefs;
create policy "Users can update their own exercise rest prefs" on public.exercise_rest_prefs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own exercise rest prefs" on public.exercise_rest_prefs;
create policy "Users can delete their own exercise rest prefs" on public.exercise_rest_prefs
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.exercise_notes to authenticated;
grant select, insert, update, delete on public.exercise_rest_prefs to authenticated;
