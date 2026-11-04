-- v2.2 N7: daily quotes table.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets or profile data.
-- Also adds profiles.hide_quote if quotes_d3.sql has not been run.
-- The app still shows the bundled list if this file has not been pasted.

alter table public.profiles
  add column if not exists hide_quote boolean;

update public.profiles
set hide_quote = false
where hide_quote is null;

alter table public.profiles
  alter column hide_quote set default false;

create table if not exists public.quotes (
  id text primary key,
  text text not null,
  attribution text not null default 'Ascenda',
  is_active boolean not null default true
);

alter table public.quotes enable row level security;

drop policy if exists "Signed-in users can read quotes" on public.quotes;
create policy "Signed-in users can read quotes" on public.quotes
  for select to authenticated using (true);

grant select on public.quotes to authenticated;

insert into public.quotes (id, text, attribution, is_active) values
  ('q-001', $q$Showing up is the work. The rest follows.$q$, 'Ascenda', true),
  ('q-002', $q$Strong is a habit, not a mood.$q$, 'Ascenda', true),
  ('q-003', $q$One session is enough for today.$q$, 'Ascenda', true),
  ('q-004', $q$Quiet progress still counts.$q$, 'Ascenda', true),
  ('q-005', $q$You do not have to feel ready. Begin anyway.$q$, 'Ascenda', true),
  ('q-006', $q$Small lifts, repeated, become strength.$q$, 'Ascenda', true),
  ('q-007', $q$The gym gets quieter once you have a plan.$q$, 'Ascenda', true),
  ('q-008', $q$Consistency is kinder than intensity.$q$, 'Ascenda', true),
  ('q-009', $q$Today’s session does not have to be perfect.$q$, 'Ascenda', true),
  ('q-010', $q$A calmer start still counts as a start.$q$, 'Ascenda', true),
  ('q-011', $q$You can go slowly and still go somewhere.$q$, 'Ascenda', true),
  ('q-012', $q$Strength is built on ordinary Tuesdays.$q$, 'Ascenda', true),
  ('q-013', $q$Leave the session proud you came.$q$, 'Ascenda', true),
  ('q-014', $q$Your next set is the only one that matters right now.$q$, 'Ascenda', true),
  ('q-015', $q$Rest is part of the plan, not a pause from it.$q$, 'Ascenda', true),
  ('q-016', $q$You belong in this space as much as anyone.$q$, 'Ascenda', true),
  ('q-017', $q$Form first. Load later. That is how it stays.$q$, 'Ascenda', true),
  ('q-018', $q$A lighter day can still move you forward.$q$, 'Ascenda', true),
  ('q-019', $q$Keep the promise you made to yourself this week.$q$, 'Ascenda', true),
  ('q-020', $q$The first five minutes are the hardest. Then you are in.$q$, 'Ascenda', true),
  ('q-021', $q$Stronger is a direction, not a deadline.$q$, 'Ascenda', true),
  ('q-022', $q$You can start in one spot and still grow.$q$, 'Ascenda', true),
  ('q-023', $q$Trust the plan on the days you do not feel like it.$q$, 'Ascenda', true),
  ('q-024', $q$Repeat the basics until they feel like home.$q$, 'Ascenda', true),
  ('q-025', $q$Courage can look like walking in and choosing a bench.$q$, 'Ascenda', true),
  ('q-026', $q$Progress likes people who come back.$q$, 'Ascenda', true),
  ('q-027', $q$If it is heavy, make it neat. If it is neat, you are learning.$q$, 'Ascenda', true),
  ('q-028', $q$You do not need a big moment. You need the next one.$q$, 'Ascenda', true),
  ('q-029', $q$Train like someone who plans to still be here next year.$q$, 'Ascenda', true),
  ('q-030', $q$A finished session is a kind thing to give yourself.$q$, 'Ascenda', true),
  ('q-031', $q$The weights do not mind if you are new.$q$, 'Ascenda', true),
  ('q-032', $q$Steady beats spectacular, most weeks.$q$, 'Ascenda', true),
  ('q-033', $q$Take up the space you need. Then train.$q$, 'Ascenda', true),
  ('q-034', $q$You can swap, skip and still finish.$q$, 'Ascenda', true),
  ('q-035', $q$Let today be simple: start, lift, leave.$q$, 'Ascenda', true),
  ('q-036', $q$The sessions you almost skipped still teach you something.$q$, 'Ascenda', true),
  ('q-037', $q$There is no late. There is only next.$q$, 'Ascenda', true),
  ('q-038', $q$Warm up kindly. Then do the work.$q$, 'Ascenda', true),
  ('q-039', $q$Strength grows in the boring middle.$q$, 'Ascenda', true),
  ('q-040', $q$You are allowed to take your time with this.$q$, 'Ascenda', true),
  ('q-041', $q$A plan in your pocket makes the gym feel smaller.$q$, 'Ascenda', true),
  ('q-042', $q$Do the session you have, not the one you imagined.$q$, 'Ascenda', true),
  ('q-043', $q$Coming back is a skill. You are practising it.$q$, 'Ascenda', true),
  ('q-044', $q$Lift with curiosity. See what you can do today.$q$, 'Ascenda', true),
  ('q-045', $q$The goal is not to impress the room. It is to finish.$q$, 'Ascenda', true),
  ('q-046', $q$Soft days still count towards the week.$q$, 'Ascenda', true),
  ('q-047', $q$You can be careful and still be strong.$q$, 'Ascenda', true),
  ('q-048', $q$Put the phone down. Pick the dumbbells up.$q$, 'Ascenda', true),
  ('q-049', $q$One more week of showing up changes the story.$q$, 'Ascenda', true),
  ('q-050', $q$If the machine is taken, you still have a plan.$q$, 'Ascenda', true),
  ('q-051', $q$Breathe at the bottom. Stand up on purpose.$q$, 'Ascenda', true),
  ('q-052', $q$You do not owe anyone a harder session.$q$, 'Ascenda', true),
  ('q-053', $q$Keep your rest. Keep your form. Keep going.$q$, 'Ascenda', true),
  ('q-054', $q$The first time is supposed to feel new.$q$, 'Ascenda', true),
  ('q-055', $q$Build a week you can repeat.$q$, 'Ascenda', true),
  ('q-056', $q$Confidence arrives after the reps, not before.$q$, 'Ascenda', true),
  ('q-057', $q$You can pause a set. You do not have to pause the habit.$q$, 'Ascenda', true),
  ('q-058', $q$Choose the weight you can own.$q$, 'Ascenda', true),
  ('q-059', $q$Today can be the easy version. That still counts.$q$, 'Ascenda', true),
  ('q-060', $q$Walk in with a list. Walk out with a tick.$q$, 'Ascenda', true),
  ('q-061', $q$Nobody is watching as closely as you think.$q$, 'Ascenda', true),
  ('q-062', $q$Strong for life starts with this hour.$q$, 'Ascenda', true),
  ('q-063', $q$Make it neat. Make it yours. Then go home.$q$, 'Ascenda', true),
  ('q-064', $q$A good session is one you can do again tomorrow.$q$, 'Ascenda', true),
  ('q-065', $q$You are allowed to take the corner and stay there.$q$, 'Ascenda', true),
  ('q-066', $q$The work is quiet. The change is not.$q$, 'Ascenda', true),
  ('q-067', $q$Start where you are standing.$q$, 'Ascenda', true),
  ('q-068', $q$Leave two reps in the tank and keep the week.$q$, 'Ascenda', true),
  ('q-069', $q$You can be new at this and still belong here.$q$, 'Ascenda', true),
  ('q-070', $q$The plan is a kindness you wrote in advance.$q$, 'Ascenda', true),
  ('q-071', $q$Show up once. Then show up again.$q$, 'Ascenda', true),
  ('q-072', $q$Your pace is not a problem.$q$, 'Ascenda', true),
  ('q-073', $q$Strength likes people who keep ordinary promises.$q$, 'Ascenda', true),
  ('q-074', $q$If you are unsure, choose the simpler option.$q$, 'Ascenda', true),
  ('q-075', $q$Train within your limits. That is how you stay.$q$, 'Ascenda', true),
  ('q-076', $q$A tick on the first set is a good beginning.$q$, 'Ascenda', true),
  ('q-077', $q$You do not need to earn rest. You already planned it.$q$, 'Ascenda', true),
  ('q-078', $q$The room gets friendlier when you have somewhere to stand.$q$, 'Ascenda', true),
  ('q-079', $q$Do less, well, rather than more, rushed.$q$, 'Ascenda', true),
  ('q-080', $q$This week is still open. Begin where you can.$q$, 'Ascenda', true),
  ('q-081', $q$Let the session be ordinary. Ordinary builds.$q$, 'Ascenda', true),
  ('q-082', $q$You can change the day and still keep the habit.$q$, 'Ascenda', true),
  ('q-083', $q$Hold the bar like you mean to put it down safely.$q$, 'Ascenda', true),
  ('q-084', $q$A calmer gym day is still a gym day.$q$, 'Ascenda', true),
  ('q-085', $q$You are practising being someone who trains.$q$, 'Ascenda', true),
  ('q-086', $q$Finish, log it, go and live the rest of your day.$q$, 'Ascenda', true),
  ('q-087', $q$The next session will wait. This one is yours.$q$, 'Ascenda', true),
  ('q-088', $q$Keep your shoulders down and your week moving.$q$, 'Ascenda', true),
  ('q-089', $q$Nothing here requires you to hurry.$q$, 'Ascenda', true),
  ('q-090', $q$Come as you are. Leave a little stronger.$q$, 'Ascenda', true)
on conflict (id) do update set
  text = excluded.text,
  attribution = excluded.attribution,
  is_active = excluded.is_active;
