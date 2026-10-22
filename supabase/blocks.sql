-- v1.2 P2: 8-week training blocks and conservative lift targets.
-- Run after supabase/sessions.sql, programmes.sql, onboarding_v1_1.sql and custom_workouts.sql.
-- Paste the whole file into Supabase > SQL Editor and click Run. Safe to run again.
-- Does not drop or rewrite anyone's sessions or sets.

-- 1. One active 8-week block per person, tied to her assigned programme.
create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  programme_id text not null references public.programmes (id),
  start_date date not null default current_date,
  length_weeks smallint not null default 8,
  status text not null default 'active',
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.blocks drop constraint if exists blocks_length_weeks_check;
alter table public.blocks add constraint blocks_length_weeks_check check (
  length_weeks between 1 and 16
);
alter table public.blocks drop constraint if exists blocks_status_check;
alter table public.blocks add constraint blocks_status_check check (
  status in ('active', 'complete')
);
alter table public.blocks drop constraint if exists blocks_completed_check;
alter table public.blocks add constraint blocks_completed_check check (
  (status = 'active' and completed_at is null)
  or (status = 'complete' and completed_at is not null)
);

create unique index if not exists blocks_one_active_idx
  on public.blocks (user_id)
  where status = 'active';
create index if not exists blocks_user_status_idx
  on public.blocks (user_id, status);

-- 2. 3–5 key lifts for the block. Null start/target until she has logged the lift.
create table if not exists public.block_targets (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.blocks (id) on delete cascade,
  exercise_id text not null references public.exercises (id),
  start_weight_kg numeric,
  start_reps smallint,
  target_weight_kg numeric,
  target_reps smallint,
  created_at timestamptz not null default now()
);

alter table public.block_targets drop constraint if exists block_targets_weights_check;
alter table public.block_targets add constraint block_targets_weights_check check (
  (start_weight_kg is null or start_weight_kg >= 0)
  and (target_weight_kg is null or target_weight_kg >= 0)
);
alter table public.block_targets drop constraint if exists block_targets_reps_check;
alter table public.block_targets add constraint block_targets_reps_check check (
  (start_reps is null or start_reps between 1 and 30)
  and (target_reps is null or target_reps between 1 and 30)
);

create unique index if not exists block_targets_block_exercise_idx
  on public.block_targets (block_id, exercise_id);
create index if not exists block_targets_block_idx
  on public.block_targets (block_id);

-- 3. Programme sessions can belong to a block. Custom sessions stay null.
alter table public.sessions add column if not exists block_id uuid
  references public.blocks (id) on delete set null;

create index if not exists sessions_block_idx
  on public.sessions (block_id)
  where block_id is not null;

-- 4. Existing users with a programme get an active block.
-- Start date = first programme session, or today if she hasn't logged one yet.
insert into public.blocks (user_id, programme_id, start_date, length_weeks, status)
select
  p.user_id,
  p.programme_id,
  coalesce(
    (
      select min(s.date)
      from public.sessions s
      where s.user_id = p.user_id
        and s.programme_day_id is not null
        and s.completed_at is not null
    ),
    current_date
  ),
  8,
  'active'
from public.profiles p
where p.programme_id is not null
  and not exists (
    select 1 from public.blocks b
    where b.user_id = p.user_id and b.status = 'active'
  );

-- Attach existing programme sessions to that block from its start date (history stays).
update public.sessions s
set block_id = b.id
from public.blocks b
where b.status = 'active'
  and s.user_id = b.user_id
  and s.block_id is null
  and s.programme_day_id is not null
  and s.date >= b.start_date;

-- 5. RLS. She only sees her own blocks and targets.
alter table public.blocks enable row level security;
alter table public.block_targets enable row level security;

drop policy if exists "Users can read their own blocks" on public.blocks;
create policy "Users can read their own blocks" on public.blocks
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users can create their own blocks" on public.blocks;
create policy "Users can create their own blocks" on public.blocks
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users can update their own blocks" on public.blocks;
create policy "Users can update their own blocks" on public.blocks
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can read targets on their blocks" on public.block_targets;
create policy "Users can read targets on their blocks" on public.block_targets
  for select to authenticated using (
    exists (
      select 1 from public.blocks b
      where b.id = block_id and b.user_id = (select auth.uid())
    )
  );
drop policy if exists "Users can add targets on their blocks" on public.block_targets;
create policy "Users can add targets on their blocks" on public.block_targets
  for insert to authenticated with check (
    exists (
      select 1 from public.blocks b
      where b.id = block_id and b.user_id = (select auth.uid())
    )
  );
drop policy if exists "Users can update targets on their blocks" on public.block_targets;
create policy "Users can update targets on their blocks" on public.block_targets
  for update to authenticated
  using (
    exists (
      select 1 from public.blocks b
      where b.id = block_id and b.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.blocks b
      where b.id = block_id and b.user_id = (select auth.uid())
    )
  );
drop policy if exists "Users can delete targets on their blocks" on public.block_targets;
create policy "Users can delete targets on their blocks" on public.block_targets
  for delete to authenticated using (
    exists (
      select 1 from public.blocks b
      where b.id = block_id and b.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.blocks, public.block_targets to authenticated;
