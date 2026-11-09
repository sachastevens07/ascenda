-- Public storage bucket for routine cover photos.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: it never deletes sessions, sets, routines or enrolments.
--
-- Photo rows live in supabase/images_manifest.sql. This file used to insert
-- six old Pexels covers (cover-gym-confidence-6 and the rest). Those rows
-- have no slug, so the insert fails now that images.slug is required, and
-- the app no longer uses those slugs. Do not put them back.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'routine-covers',
  'routine-covers',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Signed-in users can read routine covers" on storage.objects;
create policy "Signed-in users can read routine covers"
  on storage.objects for select to authenticated
  using (bucket_id = 'routine-covers');

-- Older image inserts omit slug. Fill it from id so those files still run.
create or replace function public.images_fill_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists images_fill_slug on public.images;
create trigger images_fill_slug
  before insert or update on public.images
  for each row
  execute function public.images_fill_slug();
