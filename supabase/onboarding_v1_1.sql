-- v1.1 C2: starting confidence level, optional bodyweight and 18+ confirmation on profiles.
-- Run after profiles.sql. Paste into Supabase > SQL Editor and click Run. Safe to run again.
-- Allowed values: keep in step with LEVELS in src/lib/profile.tsx.

-- 1 Corner, 2 Dumbbell area, 3 Machines, 4 Whole gym (the exercise zones she's comfortable in).
alter table public.profiles add column if not exists confidence_level smallint;
-- Optional. Only for relative-strength stats; never BMI or any health score.
alter table public.profiles add column if not exists bodyweight_kg numeric;
-- When she confirmed she's 18 or over. Null means the app asks before the quiz.
alter table public.profiles add column if not exists age_confirmed_at timestamptz;

alter table public.profiles drop constraint if exists profiles_confidence_level_check;
alter table public.profiles add constraint profiles_confidence_level_check check (
  confidence_level between 1 and 4
);
alter table public.profiles drop constraint if exists profiles_bodyweight_kg_check;
alter table public.profiles add constraint profiles_bodyweight_kg_check check (
  bodyweight_kg between 30 and 300
);

-- Gym confidence answer (1-5) to starting level: 1-2 -> 1, 3 -> 2, 4 -> 3, 5 -> 4.
create or replace function public.level_for_confidence(confidence smallint)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case
    when confidence is null then null
    when confidence <= 2 then 1
    else confidence - 1
  end::smallint;
$$;

-- Existing users who did the quiz before levels existed.
update public.profiles
set confidence_level = public.level_for_confidence(confidence)
where confidence_level is null and confidence is not null;

-- New accounts: the app confirms 18+ before sign-up and sends it as account metadata.
-- A separate trigger, so re-running profiles.sql doesn't undo it. Upsert, so trigger order doesn't matter.
create or replace function public.record_age_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.raw_user_meta_data ->> 'age_confirmed') = 'true' then
    insert into public.profiles (user_id, age_confirmed_at)
    values (new.id, now())
    on conflict (user_id) do update set age_confirmed_at = coalesce(public.profiles.age_confirmed_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_age on auth.users;
create trigger on_auth_user_created_age
  after insert on auth.users
  for each row execute function public.record_age_confirmation();

-- Lets a signed-in user delete her own account. Used when someone says she's under 18.
-- Deleting the account also deletes her profile, sessions, sets and swaps (on delete cascade).
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
