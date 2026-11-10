-- v2.5 AI6: What can I cook.
-- Reuses ai_usage and ai_quota from AI1. Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets or other profile data.
-- Skip this file if you already pasted supabase/ai1.sql (those tables are the same).
-- Photos are never stored. The what-can-i-cook Edge Function writes quota and usage
-- with the service role. Feature slug: what_can_i_cook. Daily limit 10 (UK midnight).

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

comment on table public.ai_usage is 'AI1+ token log. Written only by Edge Functions. Never stores prompts, answers or photos.';
comment on table public.ai_quota is 'Per-user daily AI fair-use counts. period_start is the UK calendar date.';
