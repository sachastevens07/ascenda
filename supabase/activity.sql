-- v2.0 R8: Activity tab — streak fields, session time backfill, milestones, private progress photos.
-- Run after supabase/routines.sql and supabase/planned_sessions.sql.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: it never deletes sessions or sets.
-- Do not run until the user confirms.

-- 1. Profile fields for the weekly streak (R9 will ask for the goal in onboarding).
alter table public.profiles add column if not exists streak_goal_weeks smallint;
alter table public.profiles add column if not exists rest_passes_used_month smallint;
alter table public.profiles add column if not exists rest_passes_month text;

update public.profiles
set streak_goal_weeks = 8
where streak_goal_weeks is null;

alter table public.profiles alter column streak_goal_weeks set default 8;

alter table public.profiles drop constraint if exists profiles_streak_goal_weeks_check;
alter table public.profiles add constraint profiles_streak_goal_weeks_check check (
  streak_goal_weeks in (4, 8, 12)
);

alter table public.profiles drop constraint if exists profiles_rest_passes_used_month_check;
alter table public.profiles add constraint profiles_rest_passes_used_month_check check (
  rest_passes_used_month is null or rest_passes_used_month >= 0
);

-- 2. Session time (column already added in routines.sql). Backfill from clock times only
--    where duration is still empty. Never touches sets.
alter table public.sessions add column if not exists duration_seconds integer;
alter table public.sessions drop constraint if exists sessions_duration_seconds_check;
alter table public.sessions add constraint sessions_duration_seconds_check check (
  duration_seconds is null or duration_seconds >= 0
);

update public.sessions
set duration_seconds = greatest(
  0,
  floor(extract(epoch from (completed_at - started_at)))::integer
)
where completed_at is not null
  and started_at is not null
  and duration_seconds is null;

-- 3. Milestones she has unlocked (display can also be computed from history).
create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null,
  achieved_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.milestones drop constraint if exists milestones_type_check;
alter table public.milestones add constraint milestones_type_check check (
  char_length(type) between 1 and 60
);

create unique index if not exists milestones_user_type_idx
  on public.milestones (user_id, type);
create index if not exists milestones_user_achieved_idx
  on public.milestones (user_id, achieved_at desc);

alter table public.milestones enable row level security;

drop policy if exists "Users can read their own milestones" on public.milestones;
create policy "Users can read their own milestones" on public.milestones
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users can create their own milestones" on public.milestones;
create policy "Users can create their own milestones" on public.milestones
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users can update their own milestones" on public.milestones;
create policy "Users can update their own milestones" on public.milestones
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.milestones to authenticated;

-- 4. Progress photos metadata. Files live in the private progress-photos bucket.
create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path text not null,
  taken_on date not null,
  created_at timestamptz not null default now()
);

create index if not exists progress_photos_user_taken_idx
  on public.progress_photos (user_id, taken_on desc, created_at desc);

alter table public.progress_photos enable row level security;

drop policy if exists "Users can read their own progress photos" on public.progress_photos;
create policy "Users can read their own progress photos" on public.progress_photos
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users can create their own progress photos" on public.progress_photos;
create policy "Users can create their own progress photos" on public.progress_photos
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users can delete their own progress photos" on public.progress_photos;
create policy "Users can delete their own progress photos" on public.progress_photos
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, delete on public.progress_photos to authenticated;

-- 5. Private storage bucket. Photos are never public and never sent to AI.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'progress-photos',
  'progress-photos',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their own progress photo files" on storage.objects;
create policy "Users can read their own progress photo files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can upload their own progress photo files" on storage.objects;
create policy "Users can upload their own progress photo files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own progress photo files" on storage.objects;
create policy "Users can delete their own progress photo files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
