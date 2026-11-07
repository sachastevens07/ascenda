-- v2.2 X6: Refer a friend.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets, enrolments or account data.
--
-- App users can generate their own referral_code and read invites they sent.
-- Claiming a friend's code goes through claim_referral() so the invitee cannot
-- invent a referrer_id (profiles are otherwise private).
-- Status updates and rewards are written only by the RevenueCat webhook
-- (service role). Rewards: extend a paid Apple renewal by 30 days, or grant a
-- 1-month promotional entitlement if she has no store subscription. Cap 2 a year.

alter table public.profiles
  add column if not exists referral_code text;

alter table public.profiles drop constraint if exists profiles_referral_code_format;
alter table public.profiles add constraint profiles_referral_code_format
  check (referral_code is null or referral_code ~ '^[A-Z0-9]{4,12}$');

create unique index if not exists profiles_referral_code_key
  on public.profiles (referral_code)
  where referral_code is not null;

create or replace function public.freeze_referral_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.referral_code is not null and new.referral_code is distinct from old.referral_code then
    new.referral_code := old.referral_code;
  end if;
  return new;
end;
$$;

drop trigger if exists freeze_referral_code on public.profiles;
create trigger freeze_referral_code
  before update on public.profiles
  for each row execute function public.freeze_referral_code();

alter table public.subscriptions
  add column if not exists original_transaction_id text;

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users (id) on delete cascade,
  invitee_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  status text not null default 'invited',
  rewarded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.referrals drop constraint if exists referrals_status_check;
alter table public.referrals add constraint referrals_status_check
  check (status in ('invited', 'trial', 'subscribed', 'rewarded'));

alter table public.referrals drop constraint if exists referrals_not_self_check;
alter table public.referrals add constraint referrals_not_self_check
  check (referrer_id <> invitee_id);

create unique index if not exists referrals_invitee_key
  on public.referrals (invitee_id);

create index if not exists referrals_referrer_idx
  on public.referrals (referrer_id, created_at desc);

create index if not exists referrals_rewarded_idx
  on public.referrals (referrer_id, rewarded_at)
  where rewarded_at is not null;

alter table public.referrals enable row level security;

drop policy if exists "Referrer or invitee can read a referral" on public.referrals;
create policy "Referrer or invitee can read a referral" on public.referrals
  for select to authenticated
  using (
    referrer_id = (select auth.uid())
    or invitee_id = (select auth.uid())
  );

revoke insert, update, delete on public.referrals from authenticated, anon;
grant select on public.referrals to authenticated;
grant all on public.referrals to service_role;

create or replace function public.claim_referral(p_code text)
returns table (id uuid, status text, referrer_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_invitee uuid := auth.uid();
  v_referrer uuid;
  v_existing public.referrals%rowtype;
begin
  if v_invitee is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if v_code = '' then
    raise exception 'unknown_code' using errcode = 'P0002';
  end if;

  select p.user_id into v_referrer
  from public.profiles p
  where p.referral_code = v_code;

  if v_referrer is null then
    raise exception 'unknown_code' using errcode = 'P0002';
  end if;
  if v_referrer = v_invitee then
    raise exception 'own_code' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.referrals r
  where r.invitee_id = v_invitee;

  if found then
    return query select v_existing.id, v_existing.status, v_existing.referrer_id;
    return;
  end if;

  return query
    insert into public.referrals (referrer_id, invitee_id, code, status)
    values (v_referrer, v_invitee, v_code, 'invited')
    returning referrals.id, referrals.status, referrals.referrer_id;
end;
$$;

revoke all on function public.claim_referral(text) from public;
grant execute on function public.claim_referral(text) to authenticated;
grant execute on function public.claim_referral(text) to service_role;
