-- X1 photo batch 1: Home and paywall heroes.
-- Paste into Supabase > SQL Editor and click Run.
-- Safe to run again. Does not touch sessions, sets, enrolments or profiles.
-- Overwrites url and licence_source for these two slugs only.

insert into public.images (id, url, storage_path, alt_text, licence_source) values
  (
    'hero-home',
    'https://images.pexels.com/photos/7675414/pexels-photo-7675414.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'hero-home.jpg',
    'Woman in a black matching set sitting on a plyo box in a gym',
    'Photo by cottonbro studio on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/7675414/'
  ),
  (
    'hero-paywall',
    'https://images.pexels.com/photos/12859461/pexels-photo-12859461.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'hero-paywall.jpg',
    'Woman in a black matching set using resistance bands in a gym',
    'Photo by Marco Cyrus on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/12859461/'
  )
on conflict (id) do update
set
  url = excluded.url,
  storage_path = excluded.storage_path,
  alt_text = excluded.alt_text,
  licence_source = excluded.licence_source;
