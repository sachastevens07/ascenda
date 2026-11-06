-- v2.2 H6: hide achievements, store earned ids, migrate old milestone types.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets, milestones or other profile fields.

alter table public.profiles
  add column if not exists hide_achievements boolean;

update public.profiles
set hide_achievements = false
where hide_achievements is null;

alter table public.profiles
  alter column hide_achievements set default false;

create table if not exists public.user_achievements (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  achievement_id text not null,
  achieved_at timestamptz not null default now(),
  times integer not null default 1,
  primary key (user_id, achievement_id)
);

alter table public.user_achievements drop constraint if exists user_achievements_id_len;
alter table public.user_achievements add constraint user_achievements_id_len check (
  char_length(achievement_id) between 1 and 80
);

alter table public.user_achievements drop constraint if exists user_achievements_times_check;
alter table public.user_achievements add constraint user_achievements_times_check check (times >= 1);

alter table public.user_achievements enable row level security;

drop policy if exists "Users can read their own achievements" on public.user_achievements;
create policy "Users can read their own achievements" on public.user_achievements
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can create their own achievements" on public.user_achievements;
create policy "Users can create their own achievements" on public.user_achievements
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their own achievements" on public.user_achievements;
create policy "Users can update their own achievements" on public.user_achievements
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.user_achievements to authenticated;

-- Map old Awards / milestone types onto H6 ids. Keep the original milestones rows.
insert into public.user_achievements (user_id, achievement_id, achieved_at, times)
select
  m.user_id,
  mapped.achievement_id,
  min(m.achieved_at) as achieved_at,
  1
from public.milestones m
join lateral (
  select case m.type
    when 'session-1' then 'first-session'
    when 'first_session' then 'first-session'
    when 'first-session' then 'first-session'
    when 'week-1' then 'first-full-week'
    when 'gold-week' then 'first-full-week'
    when 'gold_week' then 'first-full-week'
    when 'first_full_week' then 'first-full-week'
    when 'first-full-week' then 'first-full-week'
    when 'pb-1' then 'first-pb'
    when 'first_pb' then 'first-pb'
    when 'first-pb' then 'first-pb'
    when 'back-on-track' then 'back-on-track'
    when 'back_on_track' then 'back-on-track'
    when 'welcome_back' then 'back-on-track'
    when 'consistent' then 'consistent-8'
    when 'consistent-8' then 'consistent-8'
    when 'stretch-habit' then 'stretch-habit'
    when 'stretch_habit' then 'stretch-habit'
    when 'session-5' then 'sessions-5'
    when 'sessions-5' then 'sessions-5'
    when 'session-10' then 'sessions-10'
    when 'sessions-10' then 'sessions-10'
    when 'session-25' then 'sessions-25'
    when 'sessions-25' then 'sessions-25'
    when 'session-50' then 'sessions-50'
    when 'sessions-50' then 'sessions-50'
    when 'session-100' then 'sessions-100'
    when 'sessions-100' then 'sessions-100'
    when 'session-250' then 'sessions-250'
    when 'sessions-250' then 'sessions-250'
    when 'weeks-4' then 'weeks-4'
    when 'weeks-12' then 'weeks-12'
    when 'weeks-26' then 'weeks-26'
    when 'weeks-52' then 'weeks-52'
    when 'pb-10' then 'pbs-10'
    when 'pbs-10' then 'pbs-10'
    when 'pb-50' then 'pbs-50'
    when 'pbs-50' then 'pbs-50'
    when 'routine-1' then 'programmes-1'
    when 'programmes-1' then 'programmes-1'
    when 'routine-3' then 'programmes-3'
    when 'programmes-3' then 'programmes-3'
    when 'routine-10' then 'programmes-10'
    when 'programmes-10' then 'programmes-10'
    when 'weight-1000' then 'lifted-1000'
    when 'lifted-1000' then 'lifted-1000'
    when 'weight-10000' then 'lifted-10000'
    when 'lifted-10000' then 'lifted-10000'
    when 'weight-50000' then 'lifted-50000'
    when 'lifted-50000' then 'lifted-50000'
    when 'equipment-dumbbell' then 'first-dumbbell-lift'
    when 'first-dumbbell-lift' then 'first-dumbbell-lift'
    when 'equipment-machine' then 'first-machine'
    when 'first-machine' then 'first-machine'
    when 'equipment-cable' then 'first-cable'
    when 'first-cable' then 'first-cable'
    when 'equipment-kettlebell' then 'first-kettlebell'
    when 'first-kettlebell' then 'first-kettlebell'
    when 'equipment-barbell' then 'first-barbell-lift'
    when 'first-barbell-lift' then 'first-barbell-lift'
    when 'exercises-10' then 'exercises-tried-10'
    when 'exercises-tried-10' then 'exercises-tried-10'
    when 'exercises-25' then 'exercises-tried-25'
    when 'exercises-tried-25' then 'exercises-tried-25'
    else null
  end as achievement_id
) mapped on mapped.achievement_id is not null
group by m.user_id, mapped.achievement_id
on conflict (user_id, achievement_id) do update
set
  achieved_at = least(public.user_achievements.achieved_at, excluded.achieved_at),
  times = greatest(public.user_achievements.times, excluded.times);
