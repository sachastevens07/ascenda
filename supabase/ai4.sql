-- v2.5 AI4: Ask Ascenda.
-- Conversations and messages, kept 30 days, deletable from Profile → Privacy.
-- Also reuses ai_usage and ai_quota from AI1 (safe to run again).
-- Paste into Supabase > SQL Editor and click Run.
-- Never deletes sessions, sets or other profile data.
-- Skip the ai_usage / ai_quota block if you already pasted ai1.sql, ai2.sql, ai3.sql or ai6.sql.
-- Feature slug: ask_ascenda. Daily limit 30 (UK midnight).
-- The ask-ascenda Edge Function writes quota, usage and messages with the service role.

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

create index if not exists ai_conversations_user_updated_idx
  on public.ai_conversations (user_id, updated_at desc);

alter table public.ai_conversations enable row level security;

drop policy if exists "Users can read their own Ask Ascenda threads" on public.ai_conversations;
create policy "Users can read their own Ask Ascenda threads" on public.ai_conversations
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own Ask Ascenda threads" on public.ai_conversations;
create policy "Users can delete their own Ask Ascenda threads" on public.ai_conversations
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
create policy "Users can read their own Ask Ascenda messages" on public.ai_messages
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can update feedback on their Ask Ascenda messages" on public.ai_messages;
create policy "Users can update feedback on their Ask Ascenda messages" on public.ai_messages
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own Ask Ascenda messages" on public.ai_messages;
create policy "Users can delete their own Ask Ascenda messages" on public.ai_messages
  for delete to authenticated using (user_id = (select auth.uid()));

revoke insert on public.ai_messages from authenticated;
grant select, update, delete on public.ai_messages to authenticated;

comment on table public.ai_conversations is 'Ask Ascenda threads. 30-day retention. Written by the Edge Function. Deletable by her.';
comment on table public.ai_messages is 'Ask Ascenda messages. Never used for model training. Feedback is thumbs up or down only.';
comment on table public.ai_usage is 'AI1+ token log. Written only by Edge Functions. Never stores prompts, answers or photos.';
comment on table public.ai_quota is 'Per-user daily AI fair-use counts. period_start is the UK calendar date.';
