-- Read-only check: which SQL files have already been pasted? Changes nothing.
-- Paste into the Supabase SQL editor, run it, and send Claude the result table.
with markers(file, tbl, col) as (values
  ('activity.sql','sessions','duration_seconds'),
  ('main_goals.sql','profiles','main_goals'),
  ('reminders.sql','profiles','session_reminders'),
  ('streak_h1.sql','streak_weeks',null),
  ('photos_h7.sql','profiles','photos_enabled'),
  ('challenges_h8.sql','challenge_participants','start_date'),
  ('quotes_n7.sql','quotes',null),
  ('profile_d8.sql','profiles','weight_unit'),
  ('theme_preference.sql','profiles','theme_preference'),
  ('n2_routines.sql','routines','progression_note'),
  ('learn_n6.sql','learn_articles',null),
  ('images_manifest.sql','images','kind'),
  ('gym_experience_g1.sql','profiles','gym_experience'),
  ('routines_is_active.sql','routines','is_active'),
  ('session_blocks_w1.sql','routine_day_blocks',null),
  ('complete_week_w5.sql','planned_sessions','session_kind'),
  ('exercise_notes_x4.sql','exercise_notes',null),
  ('workoutx_m1.sql','exercises','workoutx_id'),
  ('subscriptions_p1.sql','subscriptions',null),
  ('onboarding_x5.sql','profiles','onboarding_answers'),
  ('achievements_h6.sql','profiles','hide_achievements'),
  ('referrals_x6.sql','referrals',null),
  ('ai7_coach.sql','ai_conversations','context_type'),
  ('ai5.sql','monthly_recaps',null),
  ('food_f2.sql','recipes',null),
  ('food_f5.sql','shopping_list_items',null),
  ('cardio_w2.sql','cardio_logs',null),
  ('cardio_w8.sql','sessions','logged_after'),
  ('weekly_plan.sql','routines','weekly_plan'),
  ('group8_health.sql','health_consents',null),
  ('session_feel_b2.sql','sessions','session_feel'),
  ('sets_l5.sql','sets','set_type'),
  ('period_log_l9.sql','period_logs',null)
)
select m.file,
  case when exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = m.tbl
      and (m.col is null or c.column_name = m.col)
  ) then 'pasted' else 'NOT pasted' end as status
from markers m
order by status, m.file;
