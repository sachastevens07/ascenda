-- L5: set type on logged sets (normal, warmup, drop).
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions or sets.
-- Existing rows become 'normal'. Warm-up rows may use set_number 0, -1, -2
-- so working set 1 still drives progression.

alter table public.sets add column if not exists set_type text;

update public.sets set set_type = 'normal' where set_type is null;

alter table public.sets alter column set_type set default 'normal';
alter table public.sets alter column set_type set not null;

alter table public.sets drop constraint if exists sets_set_type_check;
alter table public.sets add constraint sets_set_type_check
  check (set_type in ('normal', 'warmup', 'drop'));

-- Drop the original set_number >= 1 check, whatever Postgres named it.
alter table public.sets drop constraint if exists sets_set_number_check;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'sets'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%set_number%'
      and pg_get_constraintdef(con.oid) ilike '%>=%1%'
  loop
    execute format('alter table public.sets drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table public.sets drop constraint if exists sets_set_number_range;
alter table public.sets add constraint sets_set_number_range
  check (set_number between -20 and 50);
