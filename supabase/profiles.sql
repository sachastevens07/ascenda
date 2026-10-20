-- User profiles: onboarding quiz answers and settings, one row per user.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: it never deletes or overwrites anyone's answers.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  goal text,
  experience text,
  days_per_week smallint,
  equipment text,
  confidence smallint,
  -- Assigned from the quiz answers once programmes exist (Feature 5).
  programme_id text,
  cycle_tracking_enabled boolean not null default false,
  -- Set when the quiz is saved. Null means the user still needs to do the quiz.
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Allowed values. Keep these lists in step with src/lib/profile.tsx.
alter table public.profiles drop constraint if exists profiles_goal_check;
alter table public.profiles add constraint profiles_goal_check check (
  goal in ('strength', 'glutes_legs', 'general')
);
alter table public.profiles drop constraint if exists profiles_experience_check;
alter table public.profiles add constraint profiles_experience_check check (
  experience in ('new', 'some', 'confident')
);
alter table public.profiles drop constraint if exists profiles_days_per_week_check;
alter table public.profiles add constraint profiles_days_per_week_check check (
  days_per_week between 2 and 4
);
alter table public.profiles drop constraint if exists profiles_equipment_check;
alter table public.profiles add constraint profiles_equipment_check check (
  equipment in ('full_gym', 'dumbbells', 'home')
);
alter table public.profiles drop constraint if exists profiles_confidence_check;
alter table public.profiles add constraint profiles_confidence_check check (
  confidence between 1 and 5
);

-- Each user can only see and change her own profile.
alter table public.profiles enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.profiles to authenticated;

create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_profile_updated on public.profiles;
create trigger on_profile_updated
  before update on public.profiles
  for each row execute function public.touch_profile_updated_at();

-- Create an empty profile for every new account.
create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

-- Accounts created before this file was run get an empty profile too.
insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;
