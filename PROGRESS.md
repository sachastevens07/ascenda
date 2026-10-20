# Progress

Handoff notes for the next agent. Read `AGENTS.md` first (project brief + working rules), then this file.

## Done

1. **App shell**: Expo Router with a root `Stack` (`src/app/_layout.tsx`) and swipeable tabs, Today / Progress / Library / Profile (`src/app/(tabs)/_layout.tsx`), built on `expo-router/js-top-tabs` with `tabBarPosition="bottom"` and a custom floating pill tab bar (`src/components/PillTabBar.tsx`) whose highlight follows the swipe position.
2. **Auth**: Email + password via Supabase (`src/lib/supabase.ts`, `src/lib/auth.tsx`). `AuthProvider` tracks the session via `onAuthStateChange`, and the root layout uses `Stack.Protected` so signed-out users only see `src/app/sign-in.tsx` (sign in and create account on one screen). Profile shows the email and a Sign out button. The session persists in AsyncStorage.
3. **Exercise library**: 175 exercises in the Supabase `exercises` table, seeded from `supabase/exercises.sql`. The Library tab (`src/app/(tabs)/library.tsx`) loads all rows once and filters on the device: a search box (name, muscle and equipment words) plus Muscle and Equipment filter sheets (`src/components/FilterSheet.tsx`), with pull-to-refresh. The detail screen is `src/app/exercise/[id].tsx` (photo or placeholder, muscle tags, "Where to find it", 3 form cues, disclaimer). Types, labels and queries are in `src/lib/exercises.ts`.
4. **Onboarding quiz** (code complete, awaiting phone test): `profiles` table from `supabase/profiles.sql` (RLS: each user reads, inserts and updates only her own row; a trigger on `auth.users` creates an empty row on sign-up; existing accounts are backfilled). `src/lib/profile.tsx` holds the types, labels and a `ProfileProvider` / `useProfile()` that loads the signed-in user's profile and saves quiz answers. The quiz is `src/app/onboarding.tsx`: one question per screen (goal, experience, days per week, where you train, gym confidence 1–5), tapping an answer moves on, then a review screen (tap a row to change it, disclaimer, "Let's go"). The root layout sends signed-in users with no completed quiz to `onboarding` and only shows the tabs once it's saved. Profile tab shows "Your answers" with a "Change answers" button that reopens the quiz on its review screen.

## In progress

Nothing half-built in code. Waiting on the user to:
- Run `supabase/profiles.sql` in Supabase and test the quiz on the phone (new account → quiz → tabs; Profile → Change answers; answers survive an app restart).
- Confirm the library on the phone (still unconfirmed from Feature 3): "175 exercises" after pull-to-refresh, and one test photo upload appearing on an exercise.

## Next step

Once the quiz is confirmed on the phone, start **Feature 5: Programmes** (three templates stored as data in `programmes` / `programme_days` / `programme_exercises`, assigned from the quiz answers into `profiles.programme_id`).

## Known bugs / issues

- Exercise text (cues and location hints) was written by the AI and **still needs the user's review**.
- No exercise photos yet: the media from free-exercise-db and wger was rejected for licensing reasons (free-exercise-db images have unknown provenance; wger is patchy CC BY-SA).
- Email confirmation is **off** in Supabase for testing. There is no deep-link handling, so confirm-email and forgot-password links won't open the app. Both need adding before launch.
- Web (`w` in Expo) shows a blank screen. Web isn't a target; `react-native-web` is not installed.
- The Library loads exercises once per app session; new rows only appear after pull-to-refresh or reopening the app.
- The muscle filter matches `primary_muscle` only (search also matches secondary muscles).
- The user often ends up with two dev servers running (ports 8081 and 8082) and the phone attached to the stale one. Advise one terminal, `Ctrl + C` before restarting, and rescanning the QR code. Two servers also write `.expo/types/router.d.ts` at the same time and corrupt it, which makes `tsc` fail inside that file. It's generated and git-ignored: delete it and it is recreated on the next `expo start`.

## Decisions made (not in AGENTS.md)

- **Expo SDK 57**, not 58: Expo Go on the Play Store only supported SDK 57. Upgrade once Expo Go 58 ships. `react-dom` is pinned to match `react`.
- **Libraries added (approved by the user)**: `@expo/vector-icons` + `expo-font` (Ionicons tab and UI icons), `react-native-pager-view` + `react-native-tab-view` (swipeable tabs via Expo Router's `js-top-tabs`), `@supabase/supabase-js` + `@react-native-async-storage/async-storage`. No polyfill is needed (Expo provides `URL`).
- **Design**: background `#F7F4F0`, accent plum `#7A3E6B`, soft accent `#F2E6EE` (`src/constants/theme.ts`). No screen headers on the tabs; each screen shows its own big title. Large tap targets (at least 48–56px). Filters use bottom-sheet modals rather than horizontal chip rows, to avoid clashing with tab swipes.
- **Auth copy**: friendly error messages; "Nearly there! Check your inbox…" if sign-up returns no session.
- **Exercise data model**: `id` is a text slug (e.g. `goblet-squat`). Muscles: glutes, quads, hamstrings, adductors (labelled "Inner thighs"), calves, chest, back, shoulders, biceps, triceps, core. Equipment: barbell, dumbbell, machine, cable, kettlebell, band, bodyweight. The database enforces these lists and exactly 3 cues; keep the SQL constraints and `src/lib/exercises.ts` in step.
- **Photos**: public Storage bucket `exercise-media`. A trigger on `storage.objects` sets `exercises.media_url` to the file path when a file named `<exercise-id>.<ext>` is uploaded (case, spaces and underscores normalised) and clears it on delete. `media_url` may also be a full https URL. The app resolves it with `getMediaUrl()`. Re-running the SQL never overwrites `media_url`.
- **Disclaimer** ("General fitness guidance, not medical advice. Stop if anything hurts.") is shown on every exercise detail screen.
- In dev builds (`__DEV__`), the Library error state shows the real error message, and the photo placeholder shows the file name to upload.
- **Quiz values** stored in `profiles` (database constraints enforce them; keep `supabase/profiles.sql` and `src/lib/profile.tsx` in step): goal `strength` / `glutes_legs` / `general`; experience `new` / `some` / `confident`; `days_per_week` 2–4; equipment `full_gym` / `dumbbells` / `home`; confidence 1–5. The quiz's "where you train" type is `EquipmentAccess`, separate from an exercise's `Equipment`.
- **"At home"** is described to the user as "little or no kit: bodyweight and maybe a band". Programmes and swaps should treat it as bodyweight + band exercises (assumption, not yet confirmed by the user).
- **Onboarding is complete** when `profiles.onboarding_completed_at` is set (and all five answers are present). `programme_id` is plain text with no foreign key yet; add one when the `programmes` table exists.
- If the profile fails to load, the app shows a "We couldn't load your profile" screen with Try again and Sign out, rather than sending the user into the quiz. The first quiz question has a "Not you? Sign out" link.

## Setup notes

- **Env vars** (in `.env`, which git ignores; template in `.env.example`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The app throws "Missing Supabase keys" on launch if either is missing.
- **Supabase**: project created by the user. Email provider on, "Confirm email" off. `supabase/exercises.sql` (latest version) has been run: it creates the `exercises` table (RLS: authenticated read-only), the `exercise-media` bucket, the functions `exercise_id_from_media_path` and `sync_exercise_media`, and the trigger `on_exercise_media_change`. The file is idempotent and safe to re-run (the SQL editor warns about "destructive operations"; that's expected). `supabase/profiles.sql` (Feature 4) creates `profiles`, its RLS policies, the `on_auth_user_created` and `on_profile_updated` triggers, and backfills profiles for existing accounts. Also idempotent; never overwrites answers. **Not yet run by the user.**
- **Windows quirks on this machine**: PowerShell blocks `npx.ps1`/`npm.ps1` (use `npx.cmd`/`npm.cmd`, or the user can run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`). npm needs `NODE_OPTIONS=--use-system-ca` (certificate interception). Git is installed at `C:\Program Files\Git\cmd`. Cursor must be restarted for it to be on PATH, or append it to `$env:Path` in the session. The repo-local git email is the placeholder `sacha@example.com`.
- **Start the app**: `$env:NODE_OPTIONS="--use-system-ca"; npx.cmd expo start --clear`, then scan the QR code with Expo Go (Android, Samsung) on the same Wi-Fi. Use `--tunnel` if the phone can't connect.
- **Checks before finishing a task**: `npx tsc --noEmit`, `npx expo-doctor`, and `npx expo export --platform android --output-dir <temp>` to confirm the bundle builds. No ESLint config has been set up yet (`npx expo lint` would add one).
