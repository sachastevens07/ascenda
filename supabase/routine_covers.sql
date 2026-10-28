-- v2.0 R11: licensed routine cover photos + a public storage bucket to host them.
-- Run after supabase/routines.sql.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: it never deletes sessions, sets, routines or enrolments.
-- Do not run until the user confirms.
--
-- After this file: optionally upload the six jpgs from assets/covers/ to the
-- routine-covers bucket, using the same file names (cover-gym-confidence-6.jpg, …).
-- Until you upload, the app uses the bundled files (and these Pexels URLs).
-- Swap a cover later by changing public.images.url — no app code change.

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

insert into public.images (id, url, storage_path, alt_text, licence_source) values
  (
    'cover-gym-confidence-6',
    'https://images.pexels.com/photos/3757376/pexels-photo-3757376.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-gym-confidence-6.jpg',
    'Woman holding a dumbbell in a bright gym',
    'Photo by Andrea Piacquadio on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/3757376/'
  ),
  (
    'cover-full-body-3',
    'https://images.pexels.com/photos/3768868/pexels-photo-3768868.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-full-body-3.jpg',
    'Women lifting dumbbells together in a bright studio',
    'Photo by Andrea Piacquadio on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/3768868/'
  ),
  (
    'cover-one-spot-6',
    'https://images.pexels.com/photos/3757370/pexels-photo-3757370.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-one-spot-6.jpg',
    'Woman training with two dumbbells in one gym spot',
    'Photo by Andrea Piacquadio on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/3757370/'
  ),
  (
    'cover-busy-gym-6',
    'https://images.pexels.com/photos/3854187/pexels-photo-3854187.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-busy-gym-6.jpg',
    'Woman using a lat pulldown machine',
    'Photo by Andrea Piacquadio on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/3854187/'
  ),
  (
    'cover-upper-lower-4',
    'https://images.pexels.com/photos/3768183/pexels-photo-3768183.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-upper-lower-4.jpg',
    'Woman using an upper-body machine',
    'Photo by Andrea Piacquadio on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/3768183/'
  ),
  (
    'cover-lower-body-3',
    'https://images.pexels.com/photos/3775566/pexels-photo-3775566.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-lower-body-3.jpg',
    'Women doing squats in a bright studio',
    'Photo by Andrea Piacquadio on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/3775566/'
  )
on conflict (id) do update set
  url = excluded.url,
  storage_path = excluded.storage_path,
  alt_text = excluded.alt_text,
  licence_source = excluded.licence_source;
