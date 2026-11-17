-- Group 8 B2 + B3: periods and menopause ("train with how you feel").
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions or sets.
--
-- B2: sessions.lighter_session says only that today was lighter.
--     Do not add a column for the check-in option or the reason.
-- B3: profiles.life_stage is null unless she gives explicit consent.
--     health_consents holds that consent and can be withdrawn on its own.
-- Account deletion (delete_own_account) clears life_stage and health_consents,
-- then deletes the auth user so profiles cascade too.

-- 1. Session flag. Existing rows become false. No reason column.

alter table public.sessions
  add column if not exists lighter_session boolean;

update public.sessions
set lighter_session = false
where lighter_session is null;

alter table public.sessions
  alter column lighter_session set default false;

alter table public.sessions
  alter column lighter_session set not null;

-- 2. Hide the daily check-in. Off means the card is shown (hide_checkin = false).

alter table public.profiles
  add column if not exists hide_checkin boolean;

update public.profiles
set hide_checkin = false
where hide_checkin is null;

alter table public.profiles
  alter column hide_checkin set default false;

alter table public.profiles
  alter column hide_checkin set not null;

-- 3. Optional life stage. Null, perimenopause or menopause only.

alter table public.profiles
  add column if not exists life_stage text;

alter table public.profiles drop constraint if exists profiles_life_stage_check;
alter table public.profiles add constraint profiles_life_stage_check check (
  life_stage is null or life_stage in ('perimenopause', 'menopause')
);

-- 4. Explicit health consents. One row per user per purpose.

create table if not exists public.health_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  purpose text not null,
  consent_version integer not null,
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz
);

alter table public.health_consents drop constraint if exists health_consents_purpose_len;
alter table public.health_consents add constraint health_consents_purpose_len check (
  char_length(purpose) between 1 and 80
);

alter table public.health_consents drop constraint if exists health_consents_version_check;
alter table public.health_consents add constraint health_consents_version_check check (
  consent_version >= 1
);

create unique index if not exists health_consents_user_purpose_key
  on public.health_consents (user_id, purpose);

create index if not exists health_consents_user_idx
  on public.health_consents (user_id);

alter table public.health_consents enable row level security;

drop policy if exists "Users can read their own health consents" on public.health_consents;
create policy "Users can read their own health consents" on public.health_consents
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own health consents" on public.health_consents;
create policy "Users can insert their own health consents" on public.health_consents
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own health consents" on public.health_consents;
create policy "Users can update their own health consents" on public.health_consents
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.health_consents from public, anon;
grant select, insert, update on public.health_consents to authenticated;

-- 5. Account deletion removes consents and life_stage, then the auth user.
--    health_consents and profiles also cascade from auth.users.

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
  delete from public.health_consents where user_id = auth.uid();
  update public.profiles set life_stage = null where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
