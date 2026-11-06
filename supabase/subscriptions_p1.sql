-- v2.2 P1: Hard paywall. Roadmap step 13.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Does not touch sessions, sets, enrolments or profile fields.
--
-- The RevenueCat webhook Edge Function is the only writer of public.subscriptions.
-- App users can read their own row. RLS uses has_ascenda_pro() to hide
-- routine weeks after week 1 and exercise prescriptions until she has
-- trial, active or grace access.
-- Plan-reveal data stays readable: routine name, description, cover, tags,
-- and week 1 day names.
-- is_pro columns stay on routines / articles / challenges. The app no longer
-- uses them for locks.
--
-- Recipes and AI tables are not in this paste (F2 / v2.5). When those tables
-- exist, add the same has_ascenda_pro() check.
--
-- After this paste, deploy supabase/functions/revenuecat-webhook and set
-- the REVENUECAT_WEBHOOK_SECRET. Until a row exists, testers can insert one
-- (see the commented example at the bottom).

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  entitlement text not null default 'ascenda_pro',
  status text not null,
  product_id text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('trial', 'active', 'grace', 'expired'));

alter table public.subscriptions drop constraint if exists subscriptions_entitlement_check;
alter table public.subscriptions add constraint subscriptions_entitlement_check
  check (entitlement = 'ascenda_pro');

create index if not exists subscriptions_status_idx
  on public.subscriptions (status, expires_at);

alter table public.subscriptions enable row level security;

drop policy if exists "Users can read their own subscription" on public.subscriptions;
create policy "Users can read their own subscription" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.subscriptions from authenticated, anon;
grant select on public.subscriptions to authenticated;

create or replace function public.has_ascenda_pro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions
    where user_id = (select auth.uid())
      and entitlement = 'ascenda_pro'
      and status in ('trial', 'active', 'grace')
      and (expires_at is null or expires_at > now())
  );
$$;

revoke all on function public.has_ascenda_pro() from public;
grant execute on function public.has_ascenda_pro() to authenticated;
grant execute on function public.has_ascenda_pro() to service_role;

-- Week 1 overview stays readable for the plan reveal. Later weeks need access.
drop policy if exists "Signed-in users can read routine weeks" on public.routine_weeks;
create policy "Signed-in users can read routine weeks" on public.routine_weeks
  for select to authenticated
  using (week_number = 1 or public.has_ascenda_pro());

drop policy if exists "Signed-in users can read routine days" on public.routine_days;
create policy "Signed-in users can read routine days" on public.routine_days
  for select to authenticated
  using (
    public.has_ascenda_pro()
    or exists (
      select 1
      from public.routine_weeks w
      where w.id = routine_days.routine_week_id
        and w.week_number = 1
    )
  );

-- Exercise prescriptions (sets, reps, rest) need an active entitlement.
drop policy if exists "Signed-in users can read routine day exercises" on public.routine_day_exercises;
create policy "Signed-in users can read routine day exercises" on public.routine_day_exercises
  for select to authenticated
  using (public.has_ascenda_pro());

-- Optional tables from later pastes. Skip quietly if they are not there yet.
do $$
begin
  if to_regclass('public.routine_day_blocks') is not null then
    execute 'drop policy if exists "Signed-in users can read routine day blocks" on public.routine_day_blocks';
    execute $p$
      create policy "Signed-in users can read routine day blocks" on public.routine_day_blocks
        for select to authenticated
        using (
          public.has_ascenda_pro()
          or exists (
            select 1
            from public.routine_days d
            join public.routine_weeks w on w.id = d.routine_week_id
            where d.id = routine_day_blocks.routine_day_id
              and w.week_number = 1
              and routine_day_blocks.block_type in ('warmup', 'cooldown', 'stretch')
          )
        )
    $p$;
  end if;

  if to_regclass('public.learn_articles') is not null then
    execute 'drop policy if exists "Signed-in users can read learn articles" on public.learn_articles';
    execute $p$
      create policy "Signed-in users can read learn articles" on public.learn_articles
        for select to authenticated
        using (body_markdown is null or btrim(body_markdown) = '' or public.has_ascenda_pro())
    $p$;
  end if;

  if to_regclass('public.recipes') is not null then
    execute 'drop policy if exists "Subscribers can read recipes" on public.recipes';
    execute $p$
      create policy "Subscribers can read recipes" on public.recipes
        for select to authenticated
        using (public.has_ascenda_pro())
    $p$;
  end if;
end $$;

-- Tester helper (uncomment, swap the user id, run once):
-- insert into public.subscriptions (user_id, entitlement, status, product_id, expires_at, updated_at)
-- values (
--   '00000000-0000-0000-0000-000000000000',
--   'ascenda_pro',
--   'trial',
--   'ascenda_annual',
--   now() + interval '7 days',
--   now()
-- )
-- on conflict (user_id) do update
--   set status = excluded.status,
--       product_id = excluded.product_id,
--       expires_at = excluded.expires_at,
--       updated_at = now();
