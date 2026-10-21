-- v1.1 C3: Quiet Mode on the profile (whole session stays in one gym zone).
-- Run after onboarding_v1_1.sql. Paste into Supabase > SQL Editor and click Run. Safe to run again.
-- Keep in step with Profile.quiet_mode in src/lib/profile.tsx.

-- Off by default: existing testers keep mixed-zone sessions at their level until they turn it on.
-- When on, Today fills every slot from zone 1 (Corner) so she never has to move around the gym.
alter table public.profiles add column if not exists quiet_mode boolean not null default false;
