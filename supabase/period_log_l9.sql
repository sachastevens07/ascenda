-- L9 period log (B4 moved forward). Special-category health data.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions or sets.
--
-- period_logs holds start and end dates she taps in the Planner. No symptoms,
-- flow, mood or predictions. Rows are hers only (RLS). Turning the Privacy
-- toggle off, or withdrawing consent, deletes every row for that user.
-- health_consents purpose 'period_log' is granted from the consent screen.
-- Account deletion also removes period_logs (cascade plus an explicit delete).

-- 1. Period dates. end_date null means the period is still open.

create table if not exists public.period_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now()
);

alter table public.period_logs drop constraint if exists period_logs_dates_check;
alter table public.period_logs add constraint period_logs_dates_check check (
  end_date is null or end_date >= start_date
);

create index if not exists period_logs_user_idx
  on public.period_logs (user_id);

create index if not exists period_logs_user_start_idx
  on public.period_logs (user_id, start_date);

drop index if exists period_logs_one_open_idx;
create unique index period_logs_one_open_idx
  on public.period_logs (user_id)
  where end_date is null;

alter table public.period_logs enable row level security;
alter table public.period_logs force row level security;

drop policy if exists "Users can read their own period logs" on public.period_logs;
create policy "Users can read their own period logs" on public.period_logs
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own period logs" on public.period_logs;
create policy "Users can insert their own period logs" on public.period_logs
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own period logs" on public.period_logs;
create policy "Users can update their own period logs" on public.period_logs
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own period logs" on public.period_logs;
create policy "Users can delete their own period logs" on public.period_logs
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.period_logs from public, anon;
grant select, insert, update, delete on public.period_logs to authenticated;

-- 2. Account deletion removes period dates and health consents, then the auth user.

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
  delete from public.period_logs where user_id = auth.uid();
  delete from public.health_consents where user_id = auth.uid();
  update public.profiles set life_stage = null where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
