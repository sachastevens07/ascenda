-- v2.0: licensed photos for the exercises we could match accurately.
-- Run after supabase/exercises.sql.
-- Paste the whole file into Supabase > SQL Editor and click Run.
-- Safe to run again: it only updates media_url on these rows.
-- Do not run until the user confirms.
--
-- Only 14 exercises have a clearly matching Pexels photo. The rest stay null
-- on purpose. Swap later by changing media_url, or by uploading
-- `<exercise-id>.jpg` to the public exercise-media bucket.

update public.exercises set
  media_url = 'https://images.pexels.com/photos/13822300/pexels-photo-13822300.jpeg?auto=compress&cs=tinysrgb&w=1200'
where id = 'barbell-deadlift';

update public.exercises set
  media_url = 'https://images.pexels.com/photos/32317373/pexels-photo-32317373.jpeg?auto=compress&cs=tinysrgb&w=1200'
where id = 'barbell-overhead-press';

update public.exercises set
  media_url = 'https://images.pexels.com/photos/8032754/pexels-photo-8032754.jpeg?auto=compress&cs=tinysrgb&w=1200'
where id = 'bodyweight-squat';

update public.exercises set
  media_url = 'https://images.pexels.com/photos/8846565/pexels-photo-8846565.jpeg?auto=compress&cs=tinysrgb&w=1200'
where id = 'dumbbell-biceps-curl';

update public.exercises set
  media_url = 'https://images.pexels.com/photos/8846122/pexels-photo-8846122.jpeg?auto=compress&cs=tinysrgb&w=1200'
where id = 'dumbbell-reverse-lunge';

update public.exercises set
  media_url = 'https://images.pexels.com/photos/14623711/pexels-photo-14623711.jpeg?auto=compress&cs=tinysrgb&w=1200'
where id = 'kettlebell-deadlift';

update public.exercises set
  media_url = 'https://images.pexels.com/photos/14252286/pexels-photo-14252286.jpeg?auto=compress&cs=tinysrgb&w=1200'
where id = 'kettlebell-swing';

update public.exercises set
  media_url = 'https://images.pexels.com/photos/3854187/pexels-photo-3854187.jpeg?auto=compress&cs=tinysrgb&w=1200'
where id = 'lat-pulldown';

update public.exercises set
  media_url = 'https://images.pexels.com/photos/3768183/pexels-photo-3768183.jpeg?auto=compress&cs=tinysrgb&w=1200'
where id = 'machine-shoulder-press';

update public.exercises set
  media_url = 'https://images.pexels.com/photos/7801525/pexels-photo-7801525.jpeg?auto=compress&cs=tinysrgb&w=1200'
where id = 'plank';

update public.exercises set
  media_url = 'https://images.pexels.com/photos/14148334/pexels-photo-14148334.jpeg?auto=compress&cs=tinysrgb&w=1200'
where id = 'pull-up';

update public.exercises set
  media_url = 'https://images.pexels.com/photos/6739040/pexels-photo-6739040.jpeg?auto=compress&cs=tinysrgb&w=1200'
where id = 'push-up';

update public.exercises set
  media_url = 'https://images.pexels.com/photos/2247179/pexels-photo-2247179.jpeg?auto=compress&cs=tinysrgb&w=1200'
where id = 'renegade-row';

update public.exercises set
  media_url = 'https://images.pexels.com/photos/14843543/pexels-photo-14843543.jpeg?auto=compress&cs=tinysrgb&w=1200'
where id = 'side-plank';
