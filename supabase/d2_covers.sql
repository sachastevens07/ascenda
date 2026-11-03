-- v2.2 D2: unique licensed covers for every strength and stretch routine.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again. Never deletes sessions, sets, enrolments or routines.
-- Needs public.images and public.routines (from supabase/routines.sql).
-- Bundled app files in assets/covers/ show even before this runs.

do $$
begin
  if to_regclass('public.images') is null or to_regclass('public.routines') is null then
    raise exception 'Run supabase/routines.sql first, then paste this file again.';
  end if;
end $$;

insert into public.images (id, url, storage_path, alt_text, licence_source) values
  (
    'cover-gym-confidence-6',
    'https://images.pexels.com/photos/4753986/pexels-photo-4753986.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-gym-confidence-6.jpg',
    'Woman tying her trainers before a gym session',
    'Photo by cottonbro studio on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/4753986/'
  ),
  (
    'cover-full-body-3',
    'https://images.pexels.com/photos/416809/pexels-photo-416809.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-full-body-3.jpg',
    'Woman swinging a kettlebell in a gym',
    'Photo by Pixabay on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/416809/'
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
    'https://images.pexels.com/photos/14591531/pexels-photo-14591531.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-lower-body-3.jpg',
    'Woman lifting a barbell in a gym',
    'Photo by Ali Alcántara on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/14591531/'
  ),
  (
    'cover-full-body-2',
    'https://images.pexels.com/photos/414029/pexels-photo-414029.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-full-body-2.jpg',
    'Woman training with suspension straps in a gym',
    'Photo by Pixabay on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/414029/'
  ),
  (
    'cover-home-strength-6',
    'https://images.pexels.com/photos/8846119/pexels-photo-8846119.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-home-strength-6.jpg',
    'Woman squatting in a living room',
    'Photo by MART PRODUCTION on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/8846119/'
  ),
  (
    'cover-upper-body-6',
    'https://images.pexels.com/photos/3775576/pexels-photo-3775576.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-upper-body-6.jpg',
    'Woman doing a shoulder press on a gym machine',
    'Photo by Andrea Piacquadio on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/3775576/'
  ),
  (
    'cover-glute-builder-6',
    'https://images.pexels.com/photos/3775567/pexels-photo-3775567.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-glute-builder-6.jpg',
    'Woman using gym equipment for lower-body work',
    'Photo by Andrea Piacquadio on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/3775567/'
  ),
  (
    'cover-joint-friendly-6',
    'https://images.pexels.com/photos/3768916/pexels-photo-3768916.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-joint-friendly-6.jpg',
    'Woman using a gym machine at an easy pace',
    'Photo by Andrea Piacquadio on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/3768916/'
  ),
  (
    'cover-short-cycle-4',
    'https://images.pexels.com/photos/4498294/pexels-photo-4498294.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-short-cycle-4.jpg',
    'Woman holding a pair of dumbbells',
    'Photo by Karolina Grabowska on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/4498294/'
  ),
  (
    'cover-barbell-strength-8',
    'https://images.pexels.com/photos/14623703/pexels-photo-14623703.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-barbell-strength-8.jpg',
    'Woman lifting dumbbells in a gym, smiling',
    'Photo by Miguel González on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/14623703/'
  ),
  (
    'cover-one-spot-2',
    'https://images.pexels.com/photos/11191187/pexels-photo-11191187.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-one-spot-2.jpg',
    'Woman at a dumbbell rack in the gym',
    'Photo by André Henrique on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/11191187/'
  ),
  (
    'cover-stretch-morning',
    'https://images.pexels.com/photos/9004756/pexels-photo-9004756.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-stretch-morning.jpg',
    'Woman stretching on a mat beside a sofa',
    'Photo on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/9004756/'
  ),
  (
    'cover-stretch-desk',
    'https://images.pexels.com/photos/7900045/pexels-photo-7900045.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-stretch-desk.jpg',
    'Woman stretching her arm during a break at home',
    'Photo on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/7900045/'
  ),
  (
    'cover-stretch-post-leg',
    'https://images.pexels.com/photos/6246255/pexels-photo-6246255.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-stretch-post-leg.jpg',
    'Woman in a seated hamstring stretch on a yoga mat',
    'Photo on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/6246255/'
  ),
  (
    'cover-stretch-lower-back',
    'https://images.pexels.com/photos/4534638/pexels-photo-4534638.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-stretch-lower-back.jpg',
    'Woman in a child pose on a yoga mat',
    'Photo by Vlada Karpovich on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/4534638/'
  ),
  (
    'cover-stretch-full-body',
    'https://images.pexels.com/photos/3823039/pexels-photo-3823039.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-stretch-full-body.jpg',
    'Woman in a low lunge stretch on a yoga mat',
    'Photo by Elina Fairytale on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/3823039/'
  ),
  (
    'cover-stretch-upper',
    'https://images.pexels.com/photos/3822190/pexels-photo-3822190.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-stretch-upper.jpg',
    'Two women stretching together on a yoga mat',
    'Photo by Elina Fairytale on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/3822190/'
  ),
  (
    'cover-stretch-hips',
    'https://images.pexels.com/photos/4534662/pexels-photo-4534662.jpeg?auto=compress&cs=tinysrgb&w=1400',
    'cover-stretch-hips.jpg',
    'Woman in a pigeon stretch on a yoga mat',
    'Photo by Vlada Karpovich on Pexels. Pexels Licence (commercial use). https://www.pexels.com/photo/4534662/'
  )
on conflict (id) do update set
  url = excluded.url,
  storage_path = excluded.storage_path,
  alt_text = excluded.alt_text,
  licence_source = excluded.licence_source;

update public.routines set cover_image_id = 'cover-gym-confidence-6' where id = 'gym-confidence-6';
update public.routines set cover_image_id = 'cover-full-body-3' where id = 'full-body-3';
update public.routines set cover_image_id = 'cover-one-spot-6' where id = 'one-spot-6';
update public.routines set cover_image_id = 'cover-busy-gym-6' where id = 'busy-gym-6';
update public.routines set cover_image_id = 'cover-upper-lower-4' where id = 'upper-lower-4';
update public.routines set cover_image_id = 'cover-lower-body-3' where id = 'lower-body-3';
update public.routines set cover_image_id = 'cover-full-body-2' where id = 'full-body-2';
update public.routines set cover_image_id = 'cover-home-strength-6' where id = 'home-strength-6';
update public.routines set cover_image_id = 'cover-upper-body-6' where id = 'upper-body-6';
update public.routines set cover_image_id = 'cover-glute-builder-6' where id = 'glute-builder-6';
update public.routines set cover_image_id = 'cover-joint-friendly-6' where id = 'joint-friendly-6';
update public.routines set cover_image_id = 'cover-short-cycle-4' where id = 'short-cycle-4';
update public.routines set cover_image_id = 'cover-barbell-strength-8' where id = 'barbell-strength-8';
update public.routines set cover_image_id = 'cover-one-spot-2' where id = 'one-spot-2';
update public.routines set cover_image_id = 'cover-stretch-morning' where id = 'stretch-morning';
update public.routines set cover_image_id = 'cover-stretch-desk' where id = 'stretch-desk';
update public.routines set cover_image_id = 'cover-stretch-post-leg' where id = 'stretch-post-leg';
update public.routines set cover_image_id = 'cover-stretch-lower-back' where id = 'stretch-lower-back';
update public.routines set cover_image_id = 'cover-stretch-full-body' where id = 'stretch-full-body';
update public.routines set cover_image_id = 'cover-stretch-upper' where id = 'stretch-upper';
update public.routines set cover_image_id = 'cover-stretch-hips' where id = 'stretch-hips';
