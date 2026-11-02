-- v2.1 S11: remove the em dash from the Full body routine description.
-- Run after supabase/routines.sql.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: it only updates this one string. Sessions and sets stay.
-- Do not run until the user confirms.

update public.routines
set description = 'Three full-body sessions a week. Beginner-friendly, and it works at any level. Eight weeks of the same three days. Go up when you hit the top of the range.'
where id = 'full-body-3';
