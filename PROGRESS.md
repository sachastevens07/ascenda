# Progress

Handoff notes for the next agent. Read `AGENTS.md` first (brief + working rules), then this file.

## Done

1. **App shell**: root `Stack` (`src/app/_layout.tsx`) + swipeable tabs Today / Progress / Library / Profile (`src/app/(tabs)/_layout.tsx`, `expo-router/js-top-tabs`) with a custom floating pill tab bar (`src/components/PillTabBar.tsx`).
2. **Auth**: Supabase email + password (`src/lib/supabase.ts`, `src/lib/auth.tsx`); `Stack.Protected` shows only `src/app/sign-in.tsx` when signed out; session kept in AsyncStorage.
3. **Exercise library**: 175 exercises seeded by `supabase/exercises.sql`; Library tab loads once and filters on device (search + Muscle/Equipment sheets, `src/components/FilterSheet.tsx`); detail `src/app/exercise/[id].tsx`; types/queries `src/lib/exercises.ts`.
4. **Onboarding quiz**: `profiles` table (`supabase/profiles.sql`, row auto-created on sign-up); `src/lib/profile.tsx` (`ProfileProvider` / `useProfile()`); quiz `src/app/onboarding.tsx`; root layout sends users without complete answers there; Profile tab shows answers + "Change answers".
5. **Programmes**: 9 templates as data (`supabase/programmes.sql`; each slot has a full-gym, dumbbells and home exercise); DB trigger sets `profiles.programme_id` from the answers; `src/lib/programmes.ts`; Profile → "View programme" (`src/app/programme.tsx`).
6. **Today screen**: `src/app/(tabs)/index.tsx`: next day's session card (exercises, sets × reps, weight suggestion), starting-weight tip, "Do a different day" picker, Start / Continue; reloads on focus.
7. **Logger**: `sessions` + `sets` tables (`supabase/sessions.sql`); `src/app/session/[id].tsx`: kg/reps boxes pre-filled, 56 px tick saves each set immediately, Finish / Discard, 90 s rest timer (±15 s, Skip, vibrates); helpers in `src/lib/workoutLog.ts`, queries in `src/lib/sessions.ts`.
8. **Progression rule**: `getWeightSuggestion()` in `src/lib/programmes.ts`: if set 1 last time hit `rep_max`, suggest + the exercise's own step (`exercises.weight_increase_kg`), else same weight / more reps; shown on Today and as a goal line in the logger, which pre-fills the new weight at `rep_min`.
9. **Swap button**: swap icon on Today rows and logger cards → `src/components/SwapSheet.tsx` (up to 3 alternatives) → "Just today" or "Every time"; logic in `src/lib/swaps.ts`; "Every time" swaps also show on the programme screen.
10. **Progress screen**: `src/app/(tabs)/progress.tsx`: stat tiles, sessions-per-week bars, weight-over-time line chart (`src/components/LineChart.tsx`, react-native-svg) with lift picker, personal bests + estimated 1-rep max; data/calcs in `src/lib/progress.ts`.

**Extras the user asked for (not in AGENTS.md):**
- **Workout timer**: elapsed time in the logger header; "You trained for X" in the Session saved message.
- **Workout-in-progress bar** (`src/components/WorkoutBar.tsx`, rendered inside `PillTabBar`): day name, elapsed time, next exercise, set with weight × reps, rest countdown; tap to return to the logger. State in `WorkoutProvider` (`src/lib/workout.tsx`, wraps the app in `src/app/_layout.tsx`), which also owns the rest timer so it keeps running after leaving the logger and restores the active session on app start.
- **PR trophies**: gold trophy by a ticked set that beats her heaviest weight, estimated 1-rep max or single-set volume; tap for details (`getSetRecords()` in `src/lib/workoutLog.ts`, history from `fetchExerciseBests()` in `src/lib/progress.ts`).
- **Floating bars**: tab pill and workout bar float over the tab screens (transparent, absolutely positioned, `pointerEvents="box-none"`); screens pad their scroll content with `useTabBarHeight()` (exported from `PillTabBar.tsx`, provider in `src/app/(tabs)/_layout.tsx`).

## In progress

Nothing half-built. The last task (floating tab bar + smaller floating workout bar) is committed but **not yet confirmed on the phone**. Features 4–10 and all extras are also unconfirmed on the phone.

## Next step

Build **Feature 11: Export** (full workout history as CSV, free for everyone). Ask before adding libraries (likely `expo-file-system` + `expo-sharing`) and agree the CSV columns first.

## Known bugs / issues

- **SQL re-runs pending (unconfirmed)**: `supabase/exercises.sql` (adds `weight_increase_kg`) and then `supabase/sessions.sql` (adds `sessions.exercise_swaps` + `user_exercise_swaps`) must be re-run in the SQL Editor; until then Today and the logger fail to load. Ask the user whether this is done.
- **Rest notifications don't work in the user's Expo Go (Android)**: `expo-notifications` 57 needs a native module this Expo Go lacks, so `src/lib/restTimer.ts` loads it in a `try`; the timer still counts down and vibrates in-app but can't alert when locked. Fix: newer Expo Go or a development build.
- AI-written content **needs the user's review**: exercise cues/location hints, per-exercise weight increases, all programme templates.
- No exercise photos yet (free-exercise-db and wger rejected for licensing).
- Email confirmation is off in Supabase; no deep links, so confirm-email / reset-password links won't open the app. Needed before launch.
- Weights are kg only (no lbs setting yet). Web isn't supported (blank screen).
- "Do a different day" and Today's "Just today" swaps are screen state only (lost on app restart until the session starts).
- The user often has two dev servers running (ports 8081 and 8082): the phone attaches to the stale one and `.expo/types/router.d.ts` gets corrupted, so `tsc` fails inside it. Delete that file (generated) and run one server.
- `src/components/PlaceholderScreen.tsx` is unused (left in place).

## Decisions made (not in AGENTS.md)

- **Expo SDK 57** (Play Store Expo Go only supports 57). `react-dom` pinned to `react`.
- **Libraries (user-approved)**: `@expo/vector-icons`, `expo-font`, `react-native-pager-view`, `react-native-tab-view`, `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `expo-notifications` (plugin in `app.json`), `react-native-svg`.
- **Design**: background `#F7F4F0`, accent plum `#7A3E6B`, soft accent `#F2E6EE`, trophy `#C8901A` (`src/constants/theme.ts`); no tab headers (big screen titles); tap targets ≥ 48–56 px; bottom sheets instead of chip rows; positive-only stats, no streaks.
- **Disclaimer** "General fitness guidance, not medical advice. Stop if anything hurts." on exercise detail, quiz review, programme, Today, logger and Progress.
- **Exercises**: text slug ids; muscles glutes, quads, hamstrings, adductors ("Inner thighs"), calves, chest, back, shoulders, biceps, triceps, core; equipment barbell, dumbbell, machine, cable, kettlebell, band, bodyweight; exactly 3 cues; DB constraints enforce these (keep SQL and `src/lib/exercises.ts` in step). Photos: upload `<exercise-id>.<ext>` to public bucket `exercise-media` and a trigger sets `media_url`.
- **Quiz values** (DB-enforced): goal `strength`/`glutes_legs`/`general`; experience `new`/`some`/`confident`; days 1–6 (user widened from 2–4); equipment `full_gym`/`dumbbells`/`home`; confidence 1–5. "At home" = bodyweight + bands; "dumbbells only" = dumbbell + bodyweight.
- **Programme assignment** (`programme_for_answers()` in SQL; first match wins): 1–2 days → Full body 2; new + 5–6 days → 3-day plan; glutes & legs → Lower-body focus 3–6; new or 3 days → Full body 3; 4 → Upper/lower; 5 → Five-day split; 6 → Push/pull/legs. Ids: `full-body-2`, `full-body-3`, `upper-lower-4`, `lower-body-3`…`6`, `split-5`, `ppl-6`. Never rename/delete `programme_days.id`; `programmes.sql` re-inserts all `programme_exercises`.
- **Today**: next day = day after the last finished session's day (wraps); no dates, never "rest day"; one session in progress at a time.
- **Logger**: only ticked sets count; pre-fill = this session's saved values, else earned increase (new weight, `rep_min`), else last time's set, else bottom of range; weight required before ticking for weighted exercises; ticking carries the weight to later empty sets; `weight_kg` null for bodyweight/band.
- **Progression**: trigger = set 1 last time reached `rep_max`; new weight = set 1's weight + `weight_increase_kg` (AI-chosen per exercise: e.g. barbell 2.5, small dumbbell lifts 1, cable isolation 1.25, big machines 5, kettlebell 2; null for bodyweight/band; −5 for assisted pull-up/dip = less help, floor 0). Bodyweight/band at the top → "Try a harder variation/band, or add a slow lowering".
- **Swaps**: "Just today" = `sessions.exercise_swaps` jsonb `{"<position>": "<exercise id>"}` (screen state on Today until Start); "Every time" = `user_exercise_swaps` (own rows; no FK to `programme_exercises`). Precedence session > every time > programme; "Back to …" clears both. Alternatives: same primary muscle, her equipment, not already in the day, ranked by shared secondary muscles then same equipment, max 3 (≤ 2 per equipment). Can't swap a slot with ticked sets.
- **Progress**: only ticked sets from finished sessions; queries page past Supabase's 1000-row limit; PB = heaviest (least help for assisted, most reps for bodyweight/band); estimated 1RM = Epley on 1–12-rep sets, rounded to 0.5 kg, "no need to test it"; chart = heaviest weight per date, x by time, everything shown (no range toggle); weeks start Monday.
- **Workout bar / timer**: bar on the four tabs only; elapsed = now − `started_at` (no pause); next set = first unticked set in programme order.
- **Trophies**: heaviest weight, best estimated 1RM, most single-set volume; must beat finished-session history and earlier sets today; none on an exercise's first session, assisted machines or bodyweight/band.
- No generated Supabase types: embedded relations cast through `unknown`; numerics converted with `Number()`.

## Setup notes

- **Env vars** (`.env`, git-ignored; template `.env.example`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- **Supabase**: Email provider on, "Confirm email" off. SQL run in order: `supabase/exercises.sql`, `profiles.sql`, `programmes.sql`, `sessions.sql` (tables `exercises`, `profiles`, `programmes`, `programme_days`, `programme_exercises`, `sessions`, `sets`, plus `user_exercise_swaps` once `sessions.sql` is re-run; see Known issues). All files are idempotent; the editor's "destructive operations" warning is expected. RLS: library/programme tables read-only for signed-in users; profiles, sessions, sets, swaps own-rows only.
- **Windows**: use `npx.cmd` / `npm.cmd`; set `NODE_OPTIONS=--use-system-ca`; install packages with `npx.cmd expo install <pkg>`.
- **Start the app** (one terminal only): `$env:NODE_OPTIONS="--use-system-ca"; npx.cmd expo start --clear`, scan the QR with Expo Go (Android) on the same Wi-Fi (`--tunnel` if needed).
- **Checks before finishing**: `npx.cmd tsc --noEmit`, `npx.cmd expo-doctor`, `npx.cmd expo export --platform android --output-dir "$env:TEMP\ws-export"`. No ESLint config yet (ask before adding).
