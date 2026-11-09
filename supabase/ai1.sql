-- v2.5 AI1: usage log, daily quota and machine-scan misses.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets or other profile data.
-- The scan-machine Edge Function writes these rows with the service role.
-- Photos are never stored.

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null,
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

alter table public.ai_usage drop constraint if exists ai_usage_feature_len;
alter table public.ai_usage add constraint ai_usage_feature_len check (
  char_length(feature) between 1 and 40
);

alter table public.ai_usage drop constraint if exists ai_usage_tokens_check;
alter table public.ai_usage add constraint ai_usage_tokens_check check (
  (input_tokens is null or input_tokens >= 0)
  and (output_tokens is null or output_tokens >= 0)
);

create index if not exists ai_usage_user_created_idx
  on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;

drop policy if exists "Users can read their own AI usage" on public.ai_usage;
create policy "Users can read their own AI usage" on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.ai_usage from authenticated;
grant select on public.ai_usage to authenticated;

create table if not exists public.ai_quota (
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null,
  period_start date not null,
  count integer not null default 0,
  primary key (user_id, feature, period_start)
);

alter table public.ai_quota drop constraint if exists ai_quota_feature_len;
alter table public.ai_quota add constraint ai_quota_feature_len check (
  char_length(feature) between 1 and 40
);

alter table public.ai_quota drop constraint if exists ai_quota_count_check;
alter table public.ai_quota add constraint ai_quota_count_check check (count >= 0);

alter table public.ai_quota enable row level security;

drop policy if exists "Users can read their own AI quota" on public.ai_quota;
create policy "Users can read their own AI quota" on public.ai_quota
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.ai_quota from authenticated;
grant select on public.ai_quota to authenticated;

create table if not exists public.machine_scan_misses (
  id uuid primary key default gen_random_uuid(),
  model_guess text,
  created_at timestamptz not null default now()
);

alter table public.machine_scan_misses drop constraint if exists machine_scan_misses_guess_len;
alter table public.machine_scan_misses add constraint machine_scan_misses_guess_len check (
  model_guess is null or char_length(model_guess) between 1 and 80
);

alter table public.machine_scan_misses enable row level security;

revoke select, insert, update, delete on public.machine_scan_misses from authenticated;
revoke select, insert, update, delete on public.machine_scan_misses from anon;

comment on table public.ai_usage is 'AI1+ token log. Written only by Edge Functions. Never stores prompts, answers or photos.';
comment on table public.ai_quota is 'Per-user daily AI fair-use counts. period_start is the UK calendar date.';
comment on table public.machine_scan_misses is 'AI1 None of these. model_guess only. No photo, no user id.';
