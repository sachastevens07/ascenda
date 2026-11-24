-- Rename to Evoluma (24 November 2026). Replaces both older names.
-- Paste into Supabase > SQL Editor and click Run. Safe to run again.
-- Only changes display text already stored in the database. Never touches sessions, sets or ids.

update public.quotes set attribution = 'Evoluma' where attribution in ('Ascenda', 'Strivella');

do $$
declare old_name text;
begin
  foreach old_name in array array['Ascenda', 'Strivella'] loop
    if to_regclass('public.learn_articles') is not null then
      update public.learn_articles
        set body_markdown = replace(body_markdown, old_name, 'Evoluma'),
            summary = replace(summary, old_name, 'Evoluma'),
            title = replace(title, old_name, 'Evoluma')
        where body_markdown like '%' || old_name || '%' or summary like '%' || old_name || '%' or title like '%' || old_name || '%';
    end if;
    if to_regclass('public.routines') is not null then
      update public.routines set description = replace(description, old_name, 'Evoluma')
        where description like '%' || old_name || '%';
    end if;
    if to_regclass('public.challenges') is not null then
      update public.challenges set description = replace(description, old_name, 'Evoluma')
        where description like '%' || old_name || '%';
    end if;
  end loop;
end $$;

-- Check: should return 0.
select count(*) as quotes_not_renamed from public.quotes where attribution in ('Ascenda', 'Strivella');
