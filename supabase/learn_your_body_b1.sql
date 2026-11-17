-- B1: allow Learn category your_body (Your body and training).
-- Paste only if you already ran learn_n6.sql. Safe to run again.
-- Does not delete or change any rows. Bundled articles work without this paste.

alter table public.learn_articles drop constraint if exists learn_articles_category_check;
alter table public.learn_articles add constraint learn_articles_category_check
  check (category in (
    'getting_started', 'gym_confidence', 'technique', 'programmes',
    'recovery', 'fuelling', 'mindset', 'myths', 'your_body'
  ));
