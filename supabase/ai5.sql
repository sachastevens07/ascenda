-- v2.5 AI5: monthly recap rows.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets or other profile data.
-- The monthly-recap Edge Function writes these rows with the service role.
-- Stats are calculated in the app. The story is validated on the server.

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null,
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_recaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null,
  stats jsonb not null default '{}'::jsonb,
  headline text not null default '',
  story_text text not null,
  highlight text,
  used_fallback boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.monthly_recaps drop constraint if exists monthly_recaps_month_day;
alter table public.monthly_recaps add constraint monthly_recaps_month_day check (
  date_trunc('month', month)::date = month
);

alter table public.monthly_recaps drop constraint if exists monthly_recaps_headline_len;
alter table public.monthly_recaps add constraint monthly_recaps_headline_len check (
  char_length(headline) between 0 and 80
);

alter table public.monthly_recaps drop constraint if exists monthly_recaps_story_len;
alter table public.monthly_recaps add constraint monthly_recaps_story_len check (
  char_length(story_text) between 1 and 500
);

alter table public.monthly_recaps drop constraint if exists monthly_recaps_highlight_len;
alter table public.monthly_recaps add constraint monthly_recaps_highlight_len check (
  highlight is null or char_length(highlight) between 1 and 40
);

create unique index if not exists monthly_recaps_user_month_idx
  on public.monthly_recaps (user_id, month);

create index if not exists monthly_recaps_user_created_idx
  on public.monthly_recaps (user_id, created_at desc);

alter table public.monthly_recaps enable row level security;

drop policy if exists "Users can read their own monthly recaps" on public.monthly_recaps;
create policy "Users can read their own monthly recaps" on public.monthly_recaps
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.monthly_recaps from authenticated;
grant select on public.monthly_recaps to authenticated;

comment on table public.monthly_recaps is 'AI5 monthly recap. Stats from the app. Story from Claude or the template fallback. No photos or body data.';
