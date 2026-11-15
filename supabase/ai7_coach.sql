-- v2.5 AI7: Ascenda Coach conversations, cards and lasting preferences.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets or other profile data.
-- Reuses ai_usage / ai_quota from AI1 (skip those tables if they already exist).
-- Feature slug: coach. Daily limit 40 messages (UK midnight).
-- The coach Edge Function writes quota, usage and messages with the service role.

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

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_conversations add column if not exists context_type text;
alter table public.ai_conversations add column if not exists context_id text;
alter table public.ai_conversations add column if not exists title text;
alter table public.ai_conversations add column if not exists last_message_at timestamptz;
alter table public.ai_conversations add column if not exists summary text;
alter table public.ai_conversations add column if not exists context_payload jsonb;

alter table public.ai_conversations drop constraint if exists ai_conversations_context_type_check;
alter table public.ai_conversations add constraint ai_conversations_context_type_check check (
  context_type is null
  or context_type in ('exercise', 'machine', 'session_today', 'routine', 'recipe', 'article', 'none')
);

alter table public.ai_conversations drop constraint if exists ai_conversations_title_len;
alter table public.ai_conversations add constraint ai_conversations_title_len check (
  title is null or char_length(title) between 1 and 80
);

create index if not exists ai_conversations_user_last_idx
  on public.ai_conversations (user_id, last_message_at desc nulls last);

alter table public.ai_conversations enable row level security;

drop policy if exists "Users can read their own Ask Ascenda threads" on public.ai_conversations;
drop policy if exists "Users can read their own Coach threads" on public.ai_conversations;
create policy "Users can read their own Coach threads" on public.ai_conversations
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own Ask Ascenda threads" on public.ai_conversations;
drop policy if exists "Users can delete their own Coach threads" on public.ai_conversations;
create policy "Users can delete their own Coach threads" on public.ai_conversations
  for delete to authenticated using (user_id = (select auth.uid()));

revoke insert, update on public.ai_conversations from authenticated;
grant select, delete on public.ai_conversations to authenticated;

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  content text not null,
  safety_flag text,
  links jsonb,
  action jsonb,
  feedback text,
  created_at timestamptz not null default now()
);

alter table public.ai_messages add column if not exists cards jsonb;
alter table public.ai_messages add column if not exists retrieved_ids jsonb;

alter table public.ai_messages drop constraint if exists ai_messages_role_check;
alter table public.ai_messages add constraint ai_messages_role_check check (role in ('user', 'assistant'));

alter table public.ai_messages drop constraint if exists ai_messages_feedback_check;
alter table public.ai_messages add constraint ai_messages_feedback_check check (
  feedback is null or feedback in ('up', 'down')
);

alter table public.ai_messages drop constraint if exists ai_messages_content_len;
alter table public.ai_messages add constraint ai_messages_content_len check (
  char_length(content) between 1 and 4000
);

create index if not exists ai_messages_conversation_created_idx
  on public.ai_messages (conversation_id, created_at);

alter table public.ai_messages enable row level security;

drop policy if exists "Users can read their own Ask Ascenda messages" on public.ai_messages;
drop policy if exists "Users can read their own Coach messages" on public.ai_messages;
create policy "Users can read their own Coach messages" on public.ai_messages
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can update feedback on their Ask Ascenda messages" on public.ai_messages;
drop policy if exists "Users can update feedback on their Coach messages" on public.ai_messages;
create policy "Users can update feedback on their Coach messages" on public.ai_messages
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own Ask Ascenda messages" on public.ai_messages;
drop policy if exists "Users can delete their own Coach messages" on public.ai_messages;
create policy "Users can delete their own Coach messages" on public.ai_messages
  for delete to authenticated using (user_id = (select auth.uid()));

revoke insert on public.ai_messages from authenticated;
grant select, update, delete on public.ai_messages to authenticated;

create table if not exists public.coach_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  exercise_id text,
  equipment text,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.coach_preferences drop constraint if exists coach_preferences_kind_check;
alter table public.coach_preferences add constraint coach_preferences_kind_check check (
  kind in ('avoid_exercise', 'no_equipment_at_my_gym')
);

alter table public.coach_preferences drop constraint if exists coach_preferences_reason_check;
alter table public.coach_preferences add constraint coach_preferences_reason_check check (
  reason in ('dislike', 'not_available', 'other')
);

alter table public.coach_preferences drop constraint if exists coach_preferences_target_check;
alter table public.coach_preferences add constraint coach_preferences_target_check check (
  (kind = 'avoid_exercise' and exercise_id is not null and char_length(exercise_id) between 1 and 80)
  or (kind = 'no_equipment_at_my_gym' and equipment is not null and char_length(equipment) between 1 and 40)
);

create unique index if not exists coach_preferences_user_exercise_idx
  on public.coach_preferences (user_id, exercise_id)
  where kind = 'avoid_exercise' and exercise_id is not null;

create unique index if not exists coach_preferences_user_equipment_idx
  on public.coach_preferences (user_id, equipment)
  where kind = 'no_equipment_at_my_gym' and equipment is not null;

create index if not exists coach_preferences_user_idx
  on public.coach_preferences (user_id, created_at desc);

alter table public.coach_preferences enable row level security;

drop policy if exists "Users can read their own Coach preferences" on public.coach_preferences;
create policy "Users can read their own Coach preferences" on public.coach_preferences
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can insert their own Coach preferences" on public.coach_preferences;
create policy "Users can insert their own Coach preferences" on public.coach_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own Coach preferences" on public.coach_preferences;
create policy "Users can delete their own Coach preferences" on public.coach_preferences
  for delete to authenticated using (user_id = (select auth.uid()));

revoke update on public.coach_preferences from authenticated;
grant select, insert, delete on public.coach_preferences to authenticated;

comment on table public.ai_conversations is 'Coach threads. 30-day retention. Written by the Edge Function. Deletable by her.';
comment on table public.ai_messages is 'Coach messages with optional cards and retrieved_ids. Never used for model training.';
comment on table public.coach_preferences is 'Lasting Coach preferences. Applied by the swap engine and session builder. Editable in Profile.';
comment on table public.ai_usage is 'AI token log. Written only by Edge Functions. Never stores prompts, answers or photos.';
comment on table public.ai_quota is 'Per-user daily AI fair-use counts. period_start is the UK calendar date.';
