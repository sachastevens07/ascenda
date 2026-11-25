-- TEST DATA ONLY: makes a test account look 3 weeks into "Strong Foundations in 6 Weeks".
--
-- What it does, for ONE test account:
--   1. Deletes that account's sessions, sets, enrolments and checkpoint results
--      (so you can run it again for a clean state).
--   2. Starts "Strong Foundations in 6 Weeks" 3 weeks ago (on a Monday), so today is week 4.
--   3. Logs every strength day of weeks 1 to 3 (Mon, Wed, Fri), with weights that go up a little each week.
--   4. Saves the week 3 checkpoint, so "start vs now" has something to show.
--
-- Before running:
--   * Sign up in the app with the test email and finish onboarding.
--   * Change the email on the line marked CHANGE ME.
--   * The script refuses any email without a "+" in it, so it can't touch a real account.
--
-- Paste into Supabase > SQL Editor and click Run.

do $$
declare
  v_email      text := 'yourname+mid@gmail.com';   -- CHANGE ME
  v_weeks_done int  := 3;                           -- weeks already trained (1 to 5)
  v_routine    text := 'strong-foundations-6-weeks';
  v_user       uuid;
  v_enrolment  uuid;
  v_start      date;
  v_session    uuid;
  v_day        record;
  v_ex         record;
  v_date       date;
  v_started    timestamptz;
  v_minutes    int;
  v_weight     numeric;
  v_inc        numeric;
  v_reps       int;
  s            int;
begin
  if position('+' in v_email) = 0 then
    raise exception 'Test accounts only: use an email with a + in it (for example yourname+mid@gmail.com).';
  end if;

  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception 'No account with email %. Sign up in the app first.', v_email;
  end if;

  if not exists (select 1 from public.routines where id = v_routine) then
    raise exception 'Routine % not found. Run the routine content SQL first.', v_routine;
  end if;

  -- 1. Clean slate for this test account only.
  delete from public.checkpoint_results where user_id = v_user;
  delete from public.sessions where user_id = v_user;            -- sets go with them (on delete cascade)
  delete from public.planned_sessions where user_id = v_user;
  delete from public.streak_weeks where user_id = v_user;
  delete from public.routine_enrolments where user_id = v_user;

  -- 2. Enrol, starting on the Monday v_weeks_done weeks ago.
  v_start := date_trunc('week', current_date)::date - (v_weeks_done * 7);
  insert into public.routine_enrolments (user_id, routine_id, start_date, status)
  values (v_user, v_routine, v_start, 'active')
  returning id into v_enrolment;

  -- 3. One session per strength day, on Mon / Wed / Fri of each finished week.
  for v_day in
    select rd.id, rw.week_number,
           row_number() over (partition by rw.week_number order by rd.day_number) as slot
    from public.routine_days rd
    join public.routine_weeks rw on rw.id = rd.routine_week_id
    where rw.routine_id = v_routine
      and rw.week_number <= v_weeks_done
      and coalesce(rd.type, 'strength') = 'strength'
    order by rw.week_number, rd.day_number
  loop
    v_date := v_start + (v_day.week_number - 1) * 7 + least((v_day.slot - 1) * 2, 6)::int;
    v_started := (v_date + time '18:00') at time zone 'Europe/London';
    v_minutes := 42 + (v_day.slot::int * 3);

    insert into public.sessions (
      user_id, date, started_at, completed_at, source, type,
      routine_enrolment_id, routine_day_id, duration_seconds
    )
    values (
      v_user, v_date, v_started, v_started + make_interval(mins => v_minutes), 'routine', 'strength',
      v_enrolment, v_day.id, v_minutes * 60
    )
    returning id into v_session;

    for v_ex in
      select rde.exercise_id, rde.sets, rde.rep_min, rde.rep_max, rde.load_increment_kg, e.equipment
      from public.routine_day_exercises rde
      join public.exercises e on e.id = rde.exercise_id
      where rde.routine_day_id = v_day.id
      order by rde.position
    loop
      -- Starting weight by equipment; bodyweight and band moves have no weight.
      v_weight := case v_ex.equipment
        when 'dumbbell'   then 5
        when 'kettlebell' then 8
        when 'barbell'    then 20
        when 'machine'    then 20
        when 'cable'      then 10
        else null end;
      v_inc := coalesce(v_ex.load_increment_kg, case v_ex.equipment
        when 'dumbbell'   then 1
        when 'kettlebell' then 2
        when 'barbell'    then 2.5
        when 'machine'    then 5
        when 'cable'      then 2.5
        else 0 end);
      if v_weight is not null then
        v_weight := v_weight + v_inc * (v_day.week_number - 1);
      end if;
      -- Reps climb through the range: bottom in week 1, top by week 3.
      v_reps := least(v_ex.rep_max, v_ex.rep_min + (v_day.week_number - 1) * 2);

      for s in 1..v_ex.sets loop
        insert into public.sets (session_id, exercise_id, set_number, weight_kg, reps, completed, completed_at)
        values (
          v_session, v_ex.exercise_id, s, v_weight, v_reps, true,
          v_started + make_interval(mins => s * 3)
        )
        on conflict (session_id, exercise_id, set_number) do nothing;
      end loop;
    end loop;
  end loop;

  -- 4. Week 3 checkpoint (start vs now) for the routine's key lifts.
  if v_weeks_done >= 3 then
    insert into public.checkpoint_results (user_id, enrolment_id, exercise_id, week, weight_kg, reps, recorded_at)
    select v_user, v_enrolment, st.exercise_id, 3, max(st.weight_kg), null, now()
    from public.sets st
    join public.sessions se on se.id = st.session_id
    where se.routine_enrolment_id = v_enrolment
      and st.exercise_id in ('dumbbell-romanian-deadlift', 'dumbbell-bench-press', 'one-arm-dumbbell-row')
      and st.weight_kg is not null
    group by st.exercise_id
    on conflict (enrolment_id, week, exercise_id) do nothing;
  end if;

  raise notice 'Done: % is in week % of %, with % sessions logged.',
    v_email, v_weeks_done + 1, v_routine,
    (select count(*) from public.sessions where routine_enrolment_id = v_enrolment);
end $$;
