# Progress

Handoff notes for the next agent. Read `AGENTS.md` first (project brief + working rules), then this file.

## Done

1. **App shell**: Expo Router root `Stack` (`src/app/_layout.tsx`) + swipeable bottom tabs Today / Progress / Library / Profile (`src/app/(tabs)/_layout.tsx`, `expo-router/js-top-tabs` with a custom floating pill bar `src/components/PillTabBar.tsx`).
2. **Auth**: Supabase email + password (`src/lib/supabase.ts`, `src/lib/auth.tsx`); `Stack.Protected` shows only `src/app/sign-in.tsx` when signed out; session persists in AsyncStorage.
3. **Exercise library**: 175 exercises in `exercises` (seed `supabase/exercises.sql`); Library tab (`src/app/(tabs)/library.tsx`) loads once and filters on device (search + Muscle/Equipment bottom sheets, `src/components/FilterSheet.tsx`); detail screen `src/app/exercise/[id].tsx`; types/queries `src/lib/exercises.ts`.
4. **Onboarding quiz**: `profiles` table (`supabase/profiles.sql`, auto-created on sign-up); `src/lib/profile.tsx` (`ProfileProvider` / `useProfile()`, types, labels); quiz `src/app/onboarding.tsx` (one question per screen + review); root layout routes users without completed answers to it; Profile tab shows answers + "Change answers".
5. **Programmes**: 9 templates as data (`supabase/programmes.sql`: `programmes` / `programme_days` / `programme_exercises`, each slot has a full-gym, dumbbells and home exercise); a DB trigger assigns `profiles.programme_id` from the answers; `src/lib/programmes.ts` loads them for the user's equipment; Profile → "View programme" (`src/app/programme.tsx`).
6. **Today screen**: `src/app/(tabs)/index.tsx` shows the next day's session card (exercises in order, sets × rep range, weight suggestion), a starting-weight tip, and a "Do a different day" picker; reloads on focus.
7. **Logger**: `sessions` + `sets` tables (`supabase/sessions.sql`); Start / Continue session on Today; logger `src/app/session/[id].tsx` (kg + reps boxes pre-filled from last time, 56px tick saves the set to Supabase immediately, Finish / Discard); rest timer `src/lib/restTimer.ts` (90 s, ±15 s, Skip, vibrates); queries `src/lib/sessions.ts`.

8. **Progression rule** (double progression, per-exercise steps): `getWeightSuggestion(item, previousSets)` in `src/lib/programmes.ts`; shown on the Today card (`describeWeightSuggestion`) and as a goal line in the logger (`describeProgressionGoal`); the logger pre-fills the increased weight with reps at `rep_min`.

9. **Swap button**: swap icon on each exercise on the Today card (hidden while that session is in progress) and in the logger; bottom sheet `src/components/SwapSheet.tsx`; data + alternatives `src/lib/swaps.ts`; "Every time" swaps also show on the programme screen. SQL at the end of `supabase/sessions.sql`.

10. **Progress screen**: `src/app/(tabs)/progress.tsx` (stat tiles, sessions-per-week bars, weight-over-time line chart with a lift picker, personal bests); calculations and paged loading in `src/lib/progress.ts`; line chart `src/components/LineChart.tsx` (react-native-svg). Reloads on focus. No SQL needed.

Features 4–10 are code complete but **not yet confirmed by the user on the phone**.

## In progress

Nothing half-built.

## Next step

Wait for the user to test Features 8–10 on the phone, then build **Feature 11: Export** (full workout history as CSV, free for everyone). Ask before adding any library (sharing a file likely needs `expo-file-system` + `expo-sharing`).

## Known bugs / issues

- **Rest-timer notifications don't work in the user's Expo Go (Android)**: `expo-notifications` 57.0.x loads `ExpoTopicSubscriptionModule` on import, which this Expo Go lacks (crashed the logger). `src/lib/restTimer.ts` now requires it inside a `try`; the timer still counts down and vibrates in-app but can't alert with the phone locked. Fix: update Expo Go, or a development build (`eas build --profile development`).
- `supabase/exercises.sql` gained `weight_increase_kg` and `supabase/sessions.sql` gained swaps; **the user must re-run both** in the SQL Editor (until then Today and the logger fail to load).
- Exercise text (cues, location hints), weight increases per exercise, and all programme templates (exercises, sets, rep ranges) were written by the AI and **still need the user's review**.
- No exercise photos yet (free-exercise-db and wger media rejected for licensing).
- Email confirmation is **off** in Supabase for testing; no deep-link handling, so confirm-email / forgot-password links won't open the app. Needed before launch.
- Web shows a blank screen (`react-native-web` not installed; web isn't a target).
- Library loads exercises once per app session (pull-to-refresh to reload); muscle filter matches `primary_muscle` only.
- Weights are kg only; the lbs setting doesn't exist yet.
- The "Do a different day" choice on Today is screen state only (resets on app restart).
- The user often has two dev servers running (ports 8081 and 8082); the phone attaches to the stale one, and both corrupt `.expo/types/router.d.ts`, making `tsc` fail inside that file. Delete that file (generated, git-ignored) and run one server.

## Decisions made (not in AGENTS.md)

- **Expo SDK 57** (not 58) because Expo Go on the Play Store only supported 57. `react-dom` pinned to match `react`.
- **Libraries added (user-approved)**: `@expo/vector-icons`, `expo-font`, `react-native-pager-view`, `react-native-tab-view`, `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `expo-notifications` (plugin in `app.json`), `react-native-svg`.
- **Design**: background `#F7F4F0`, accent plum `#7A3E6B`, soft accent `#F2E6EE` (`src/constants/theme.ts`); no tab headers (each screen has a big title); tap targets ≥ 48–56px; bottom-sheet modals instead of chip rows (avoid clashing with tab swipes).
- **Disclaimer** "General fitness guidance, not medical advice. Stop if anything hurts." on exercise detail, quiz review, programme, Today and logger screens.
- `__DEV__` builds show real error messages (Library, profile load) and the photo file name to upload.
- **Exercises**: `id` is a text slug; muscles glutes, quads, hamstrings, adductors ("Inner thighs"), calves, chest, back, shoulders, biceps, triceps, core; equipment barbell, dumbbell, machine, cable, kettlebell, band, bodyweight; exactly 3 cues. DB constraints enforce these; keep SQL and `src/lib/exercises.ts` in step.
- **Photos**: public bucket `exercise-media`; uploading `<exercise-id>.<ext>` auto-sets `exercises.media_url` via a storage trigger (cleared on delete).
- **Quiz values** (DB-enforced; keep `profiles.sql` and `src/lib/profile.tsx` in step): goal `strength` / `glutes_legs` / `general`; experience `new` / `some` / `confident`; days 1–6 (user asked for wider than 2–4; no 7 so there's a rest day); equipment `full_gym` / `dumbbells` / `home`; confidence 1–5. Type `EquipmentAccess` ≠ exercise `Equipment`.
- **"At home"** = bodyweight + bands; "dumbbells only" slots use dumbbell or bodyweight (no bands).
- Onboarding is complete when `profiles.onboarding_completed_at` is set and all five answers exist. If the profile fails to load, show an error screen (Try again / Sign out) rather than the quiz.
- **Programme assignment** (`programme_for_answers()` in SQL is the source of truth; first match wins): 1–2 days → Full body 2; new + 5–6 days → 3-day plan (Lower-body focus 3 for glutes & legs, else Full body 3); glutes & legs → Lower-body focus with chosen days (3–6); new or 3 days → Full body 3; 4 → Upper/lower; 5 → Five-day split; 6 → Push/pull/legs. 5–6 day plans are experienced-only. Confidence doesn't affect it. Programme screen explains when she gets fewer days than chosen.
- Template ids: `full-body-2`, `full-body-3`, `upper-lower-4`, `lower-body-3`…`lower-body-6`, `split-5`, `ppl-6`. "Beginner full body" is displayed as "Full body". Never rename/delete `programme_days.id` (sessions reference it); `programmes.sql` upserts programmes/days and deletes + re-inserts all `programme_exercises`.
- Equipment variants are explicit data per slot (user's choice), not automatic substitution; swaps are Feature 9.
- **Today**: next day = the day after the last finished session's day, wrapping; Day 1 if none. No date logic and never "rest day" (no streak guilt). One session in progress at a time; the day picker is hidden while one is in progress. Weight suggestion: see Progression below; first time it's "Find your starting weight", or "Bodyweight" / "Choose a band that feels challenging".
- **Logger**: rest 90 s default, ±15 s. After an earned increase, every set pre-fills the new weight and `rep_min` reps. Otherwise reps pre-fill = last time's reps for that set number, else the bottom of the rep range (never over-reports), and weight pre-fill = last time's; first time it must be entered before ticking (0 allowed). Ticking carries the weight on to later empty sets. Only ticked sets count; unticking saves `completed = false`. "Previous" = most recent other session containing that exercise. `weight_kg` null for bodyweight/band.
- **Progression** (user's choices): increase when **set 1** last time reached the top of the range (reps ≥ `rep_max`), whatever the other sets did; the new weight = set 1's weight + the exercise's step. "Last time" = the most recent other session containing that exercise, whatever day it was on, judged against the current slot's rep range. Steps are per exercise in `exercises.weight_increase_kg` (set in `exercises.sql`, AI-chosen, **needs the user's review**): null for bodyweight/band (DB-enforced), negative for assisted pull-up/dip (less help, never below 0 kg). Otherwise keep the heaviest weight and aim for more reps. Bodyweight/band at the top: "Try a harder variation / band, or add a slow lowering"; otherwise "aim for more reps". Today excludes the in-progress session from "last time".
- **Swaps** (user's choices): each swap asks "Just today" or "Every time". Just today = `sessions.exercise_swaps` jsonb (`{"<position>": "<exercise id>"}`); on Today it's screen state until Start, then written to the new session. Every time = `user_exercise_swaps` (user_id, programme_day_id, position → exercise_id; own rows only; no FK to `programme_exercises` because `programmes.sql` re-creates them); ignored if its equipment no longer matches her answers. Precedence: session swap > Every time swap > programme. "Back to <original>" clears both. Alternatives (automatic): same `primary_muscle`, equipment she has (full gym = all; dumbbells = dumbbell + bodyweight; home = bodyweight + band), never anything already in the day (sets are unique per session + exercise), ranked by shared secondary muscles then same equipment, max 3 with at most 2 of one equipment. In the logger, a slot with ticked sets can't be swapped until they're unticked. Progression follows the swapped exercise's own history.
- **Progress** (user's choices): charts drawn by hand with `react-native-svg`; everything shown, no date-range toggle. Only ticked sets from finished sessions count; queries page through 1000-row Supabase limits. Personal best per exercise = heaviest weight (more reps breaks ties; earliest date it was first done), least help for assisted machines (negative `weight_increase_kg`), most reps for bodyweight/band; plus estimated 1-rep max (Epley, sets of 1–12 reps, rounded to 0.5 kg, weighted lifts only, "no need to test it"). Weight chart = heaviest weight per training date (least help for assisted), x proportional to time; lift picker lists weighted lifts by most sessions. Sessions per week: Monday-start weeks from her first session to now, horizontally scrollable, empty weeks shown as grey stubs; stats tiles are positive-only (sessions, weeks training, lifts tracked). `PlaceholderScreen` is now unused.
- No generated Supabase TypeScript types: embedded relations are cast through `unknown` to hand-written types; numerics are converted with `Number()`.

## Setup notes

- **Env vars** (`.env`, git-ignored; template `.env.example`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- **Supabase**: Email provider on, "Confirm email" off. All SQL files have been run (tables `exercises`, `profiles`, `programmes`, `programme_days`, `programme_exercises`, `sessions`, `sets` all exist), in this order: `supabase/exercises.sql`, `profiles.sql`, `programmes.sql`, `sessions.sql`. Each is idempotent and safe to re-run (the editor's "destructive operations" warning is expected). RLS: exercises/programme tables are read-only for signed-in users; profiles, sessions and sets are own-rows only.
- **Windows quirks**: use `npx.cmd` / `npm.cmd` (PowerShell blocks the `.ps1` shims); set `NODE_OPTIONS=--use-system-ca` (certificate interception); Git is at `C:\Program Files\Git\cmd`; repo git email is the placeholder `sacha@example.com`.
- **Start the app** (one terminal only): `$env:NODE_OPTIONS="--use-system-ca"; npx.cmd expo start --clear`, then scan the QR code with Expo Go (Android, Samsung) on the same Wi-Fi (`--tunnel` if it can't connect).
- **Checks before finishing a task**: `npx.cmd tsc --noEmit`, `npx.cmd expo-doctor`, `npx.cmd expo export --platform android --output-dir "$env:TEMP\ws-export"`. No ESLint config yet (`npx expo lint` would add one; ask first).
