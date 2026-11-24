-- Rename: Ascenda -> Evoluma (24 November 2026).
-- Paste into Supabase > SQL Editor and click Run. Safe to run again.
-- Only changes display text already stored in the database. Never touches sessions, sets or ids.

-- Daily quotes are attributed to the brand.
update public.quotes set attribution = 'Evoluma' where attribution = 'Ascenda';

-- Text columns that may hold the old name, if the tables exist.
do $$
begin
  if to_regclass('public.learn_articles') is not null then
    update public.learn_articles
      set body_markdown = replace(body_markdown, 'Ascenda', 'Evoluma'),
          summary = replace(summary, 'Ascenda', 'Evoluma'),
          title = replace(title, 'Ascenda', 'Evoluma')
      where body_markdown like '%Ascenda%' or summary like '%Ascenda%' or title like '%Ascenda%';
  end if;
  if to_regclass('public.routines') is not null then
    update public.routines set description = replace(description, 'Ascenda', 'Evoluma')
      where description like '%Ascenda%';
  end if;
  if to_regclass('public.challenges') is not null then
    update public.challenges set description = replace(description, 'Ascenda', 'Evoluma')
      where description like '%Ascenda%';
  end if;
end $$;

-- Check: should return 0.
select count(*) as quotes_still_ascenda from public.quotes where attribution = 'Ascenda';
