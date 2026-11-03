import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

export type DailyQuote = {
  text: string;
  attribution: string;
};

const HIDE_KEY = 'hide_quote';

/** Original quotes in the Ascenda voice. N7 can move these into a `quotes` table later. */
export const DAILY_QUOTES: DailyQuote[] = [
  { text: 'Showing up is the work. The rest follows.', attribution: 'Ascenda' },
  { text: 'Strong is a habit, not a mood.', attribution: 'Ascenda' },
  { text: 'One session is enough for today.', attribution: 'Ascenda' },
  { text: 'Quiet progress still counts.', attribution: 'Ascenda' },
  { text: 'You do not have to feel ready. Begin anyway.', attribution: 'Ascenda' },
  { text: 'Small lifts, repeated, become strength.', attribution: 'Ascenda' },
  { text: 'The gym gets quieter once you have a plan.', attribution: 'Ascenda' },
  { text: 'Consistency is kinder than intensity.', attribution: 'Ascenda' },
  { text: 'Today’s session does not have to be perfect.', attribution: 'Ascenda' },
  { text: 'A calmer start still counts as a start.', attribution: 'Ascenda' },
  { text: 'You can go slowly and still go somewhere.', attribution: 'Ascenda' },
  { text: 'Strength is built on ordinary Tuesdays.', attribution: 'Ascenda' },
  { text: 'Leave the session proud you came.', attribution: 'Ascenda' },
  { text: 'Your next set is the only one that matters right now.', attribution: 'Ascenda' },
  { text: 'Rest is part of the plan, not a pause from it.', attribution: 'Ascenda' },
  { text: 'You belong in this space as much as anyone.', attribution: 'Ascenda' },
  { text: 'Form first. Load later. That is how it stays.', attribution: 'Ascenda' },
  { text: 'A lighter day can still move you forward.', attribution: 'Ascenda' },
  { text: 'Keep the promise you made to yourself this week.', attribution: 'Ascenda' },
  { text: 'The first five minutes are the hardest. Then you are in.', attribution: 'Ascenda' },
  { text: 'Stronger is a direction, not a deadline.', attribution: 'Ascenda' },
  { text: 'You can start in one spot and still grow.', attribution: 'Ascenda' },
  { text: 'Trust the plan on the days you do not feel like it.', attribution: 'Ascenda' },
  { text: 'Repeat the basics until they feel like home.', attribution: 'Ascenda' },
  { text: 'Courage can look like walking in and choosing a bench.', attribution: 'Ascenda' },
  { text: 'Progress likes people who come back.', attribution: 'Ascenda' },
  { text: 'If it is heavy, make it neat. If it is neat, you are learning.', attribution: 'Ascenda' },
  { text: 'You do not need a big moment. You need the next one.', attribution: 'Ascenda' },
  { text: 'Train like someone who plans to still be here next year.', attribution: 'Ascenda' },
  { text: 'A finished session is a kind thing to give yourself.', attribution: 'Ascenda' },
  { text: 'The weights do not mind if you are new.', attribution: 'Ascenda' },
  { text: 'Steady beats spectacular, most weeks.', attribution: 'Ascenda' },
  { text: 'Take up the space you need. Then train.', attribution: 'Ascenda' },
  { text: 'You can swap, skip and still finish.', attribution: 'Ascenda' },
  { text: 'Let today be simple: start, lift, leave.', attribution: 'Ascenda' },
  { text: 'The sessions you almost skipped still teach you something.', attribution: 'Ascenda' },
  { text: 'There is no late. There is only next.', attribution: 'Ascenda' },
  { text: 'Warm up kindly. Then do the work.', attribution: 'Ascenda' },
  { text: 'Strength grows in the boring middle.', attribution: 'Ascenda' },
  { text: 'You are allowed to take your time with this.', attribution: 'Ascenda' },
  { text: 'A plan in your pocket makes the gym feel smaller.', attribution: 'Ascenda' },
  { text: 'Do the session you have, not the one you imagined.', attribution: 'Ascenda' },
  { text: 'Coming back is a skill. You are practising it.', attribution: 'Ascenda' },
  { text: 'Lift with curiosity. See what you can do today.', attribution: 'Ascenda' },
  { text: 'The goal is not to impress the room. It is to finish.', attribution: 'Ascenda' },
  { text: 'Soft days still count toward the week.', attribution: 'Ascenda' },
  { text: 'You can be careful and still be strong.', attribution: 'Ascenda' },
  { text: 'Put the phone down. Pick the dumbbells up.', attribution: 'Ascenda' },
  { text: 'One more week of showing up changes the story.', attribution: 'Ascenda' },
  { text: 'If the machine is taken, you still have a plan.', attribution: 'Ascenda' },
  { text: 'Breathe at the bottom. Stand up on purpose.', attribution: 'Ascenda' },
  { text: 'You do not owe anyone a harder session.', attribution: 'Ascenda' },
  { text: 'Keep your rest. Keep your form. Keep going.', attribution: 'Ascenda' },
  { text: 'The first time is supposed to feel new.', attribution: 'Ascenda' },
  { text: 'Build a week you can repeat.', attribution: 'Ascenda' },
  { text: 'Confidence arrives after the reps, not before.', attribution: 'Ascenda' },
  { text: 'You can pause a set. You do not have to pause the habit.', attribution: 'Ascenda' },
  { text: 'Choose the weight you can own.', attribution: 'Ascenda' },
  { text: 'Today can be the easy version. That still counts.', attribution: 'Ascenda' },
  { text: 'Walk in with a list. Walk out with a tick.', attribution: 'Ascenda' },
  { text: 'Nobody is watching as closely as you think.', attribution: 'Ascenda' },
  { text: 'Strong for life starts with this hour.', attribution: 'Ascenda' },
  { text: 'Make it neat. Make it yours. Then go home.', attribution: 'Ascenda' },
  { text: 'A good session is one you can do again tomorrow.', attribution: 'Ascenda' },
  { text: 'You are allowed to take the corner and stay there.', attribution: 'Ascenda' },
  { text: 'The work is quiet. The change is not.', attribution: 'Ascenda' },
  { text: 'Start where you are standing.', attribution: 'Ascenda' },
  { text: 'Leave two reps in the tank and keep the week.', attribution: 'Ascenda' },
  { text: 'You can be new at this and still belong here.', attribution: 'Ascenda' },
  { text: 'The plan is a kindness you wrote in advance.', attribution: 'Ascenda' },
  { text: 'Show up once. Then show up again.', attribution: 'Ascenda' },
  { text: 'Your pace is not a problem.', attribution: 'Ascenda' },
  { text: 'Strength likes people who keep ordinary promises.', attribution: 'Ascenda' },
  { text: 'If you are unsure, choose the simpler option.', attribution: 'Ascenda' },
  { text: 'Train within your limits. That is how you stay.', attribution: 'Ascenda' },
  { text: 'A tick on the first set is a good beginning.', attribution: 'Ascenda' },
  { text: 'You do not need to earn rest. You already planned it.', attribution: 'Ascenda' },
  { text: 'The room gets friendlier when you have somewhere to stand.', attribution: 'Ascenda' },
  { text: 'Do less, well, rather than more, rushed.', attribution: 'Ascenda' },
  { text: 'This week is still open. Begin where you can.', attribution: 'Ascenda' },
  { text: 'Let the session be ordinary. Ordinary builds.', attribution: 'Ascenda' },
  { text: 'You can change the day and still keep the habit.', attribution: 'Ascenda' },
  { text: 'Hold the bar like you mean to put it down safely.', attribution: 'Ascenda' },
  { text: 'A calmer gym day is still a gym day.', attribution: 'Ascenda' },
  { text: 'You are practising being someone who trains.', attribution: 'Ascenda' },
  { text: 'Finish, log it, go and live the rest of your day.', attribution: 'Ascenda' },
  { text: 'The next session will wait. This one is yours.', attribution: 'Ascenda' },
  { text: 'Keep your shoulders down and your week moving.', attribution: 'Ascenda' },
  { text: 'Nothing here requires you to hurry.', attribution: 'Ascenda' },
  { text: 'Come as you are. Leave a little stronger.', attribution: 'Ascenda' },
];

function isMissingHideColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  return /hide_quote/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`);
}

/** Same quote for everyone on the same UTC calendar day. */
export function pickDailyQuote(now = new Date()): DailyQuote {
  const day = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000);
  const index = ((day % DAILY_QUOTES.length) + DAILY_QUOTES.length) % DAILY_QUOTES.length;
  return DAILY_QUOTES[index];
}

export async function fetchHideQuote(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(HIDE_KEY);
    const local = stored === '1';
    const { data, error } = await supabase.from('profiles').select('hide_quote').maybeSingle();
    if (error) return local;
    const value = (data as { hide_quote?: boolean | null } | null)?.hide_quote;
    if (typeof value === 'boolean') {
      if (local && !value) {
        await saveHideQuote(true);
        return true;
      }
      return value;
    }
    return local;
  } catch {
    return false;
  }
}

export async function saveHideQuote(hidden: boolean): Promise<void> {
  await AsyncStorage.setItem(HIDE_KEY, hidden ? '1' : '0');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('profiles').update({ hide_quote: hidden }).eq('user_id', user.id);
  if (error && !isMissingHideColumn(error)) throw new Error(error.message);
}
