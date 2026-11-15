-- v2.5 AI7: remove Scan a machine leftovers.
-- Show this, then paste into Supabase > SQL Editor after you confirm.
-- Drops machine_scan_misses only. Does not touch sessions, sets, profiles,
-- ai_usage, ai_quota, ai_conversations or ai_messages.

drop table if exists public.machine_scan_misses;
