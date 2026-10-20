# Progress

Handoff notes for the next agent. Read `AGENTS.md` first (project brief + working rules), then this file.

## Done

1. **App shell**: Expo Router with a root `Stack` (`src/app/_layout.tsx`) and swipeable tabs, Today / Progress / Library / Profile (`src/app/(tabs)/_layout.tsx`), built on `expo-router/js-top-tabs` with `tabBarPosition="bottom"` and a custom floating pill tab bar (`src/components/PillTabBar.tsx`) whose highlight follows the swipe position.
2. **Auth**: Email + password via Supabase (`src/lib/supabase.ts`, `src/lib/auth.tsx`). `AuthProvider` tracks the session via `onAuthStateChange`, and the root layout uses `Stack.Protected` so signed-out users only see `src/app/sign-in.tsx` (sign in and create account on one screen). Profile shows the email and a Sign out button. The session persists in AsyncStorage.
3. **Exercise library**: 175 exercises in the Supabase `exercises` table, seeded from `supabase/exercises.sql`. The Library tab (`src/app/(tabs)/library.tsx`) loads all rows once and filters on the device: a search box (name, muscle and equipment words) plus Muscle and Equipment filter sheets (`src/components/FilterSheet.tsx`), with pull-to-refresh. The detail screen is `src/app/exercise/[id].tsx` (photo or placeholder, muscle tags, "Where to find it", 3 form cues, disclaimer). Types, labels and queries are in `src/lib/exercises.ts`.

## In progress

Nothing half-built in code. The library expansion (48 to 175 exercises, plus photo auto-linking) is committed, and the updated SQL has been applied in Supabase (the `exercise-media` bucket exists). **Not yet confirmed by the user on the phone**: Library showing "175 exercises" after pull-to-refresh, and a test photo upload appearing on an exercise.

## Next step

Confirm the library works on the phone (175 exercises, Band and Inner thighs filters, one test photo upload). Then start **Feature 4: Onboarding quiz** (needs a `profiles` table with RLS and an auto-create trigger; none exists yet).

## Known bugs / issues

- Exercise text (cues and location hints) was written by the AI and **still needs the user's review**.
- No exercise photos yet: the media from free-exercise-db and wger was rejected for licensing reasons (free-exercise-db images have unknown provenance; wger is patchy CC BY-SA).
- Email confirmation is **off** in Supabase for testing. There is no deep-link handling, so confirm-email and forgot-password links won't open the app. Both need adding before launch.
- Web (`w` in Expo) shows a blank screen. Web isn't a target; `react-native-web` is not installed.
- The Library loads exercises once per app session; new rows only appear after pull-to-refresh or reopening the app.
- The muscle filter matches `primary_muscle` only (search also matches secondary muscles).
- The user often ends up with two dev servers running (ports 8081 and 8082) and the phone attached to the stale one. Advise one terminal, `Ctrl + C` before restarting, and rescanning the QR code.

## Decisions made (not in AGENTS.md)

- **Expo SDK 57**, not 58: Expo Go on the Play Store only supported SDK 57. Upgrade once Expo Go 58 ships. `react-dom` is pinned to match `react`.
- **Libraries added (approved by the user)**: `@expo/vector-icons` + `expo-font` (Ionicons tab and UI icons), `react-native-pager-view` + `react-native-tab-view` (swipeable tabs via Expo Router's `js-top-tabs`), `@supabase/supabase-js` + `@react-native-async-storage/async-storage`. No polyfill is needed (Expo provides `URL`).
- **Design**: background `#F7F4F0`, accent plum `#7A3E6B`, soft accent `#F2E6EE` (`src/constants/theme.ts`). No screen headers on the tabs; each screen shows its own big title. Large tap targets (at least 48–56px). Filters use bottom-sheet modals rather than horizontal chip rows, to avoid clashing with tab swipes.
- **Auth copy**: friendly error messages; "Nearly there! Check your inbox…" if sign-up returns no session.
- **Exercise data model**: `id` is a text slug (e.g. `goblet-squat`). Muscles: glutes, quads, hamstrings, adductors (labelled "Inner thighs"), calves, chest, back, shoulders, biceps, triceps, core. Equipment: barbell, dumbbell, machine, cable, kettlebell, band, bodyweight. The database enforces these lists and exactly 3 cues; keep the SQL constraints and `src/lib/exercises.ts` in step.
- **Photos**: public Storage bucket `exercise-media`. A trigger on `storage.objects` sets `exercises.media_url` to the file path when a file named `<exercise-id>.<ext>` is uploaded (case, spaces and underscores normalised) and clears it on delete. `media_url` may also be a full https URL. The app resolves it with `getMediaUrl()`. Re-running the SQL never overwrites `media_url`.
- **Disclaimer** ("General fitness guidance, not medical advice. Stop if anything hurts.") is shown on every exercise detail screen.
- In dev builds (`__DEV__`), the Library error state shows the real error message, and the photo placeholder shows the file name to upload.

## Setup notes

- **Env vars** (in `.env`, which git ignores; template in `.env.example`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The app throws "Missing Supabase keys" on launch if either is missing.
- **Supabase**: project created by the user. Email provider on, "Confirm email" off. `supabase/exercises.sql` (latest version) has been run: it creates the `exercises` table (RLS: authenticated read-only), the `exercise-media` bucket, the functions `exercise_id_from_media_path` and `sync_exercise_media`, and the trigger `on_exercise_media_change`. The file is idempotent and safe to re-run (the SQL editor warns about "destructive operations"; that's expected).
- **Windows quirks on this machine**: PowerShell blocks `npx.ps1`/`npm.ps1` (use `npx.cmd`/`npm.cmd`, or the user can run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`). npm needs `NODE_OPTIONS=--use-system-ca` (certificate interception). Git is installed at `C:\Program Files\Git\cmd`. Cursor must be restarted for it to be on PATH, or append it to `$env:Path` in the session. The repo-local git email is the placeholder `sacha@example.com`.
- **Start the app**: `$env:NODE_OPTIONS="--use-system-ca"; npx.cmd expo start --clear`, then scan the QR code with Expo Go (Android, Samsung) on the same Wi-Fi. Use `--tunnel` if the phone can't connect.
- **Checks before finishing a task**: `npx tsc --noEmit`, `npx expo-doctor`, and `npx expo export --platform android --output-dir <temp>` to confirm the bundle builds. No ESLint config has been set up yet (`npx expo lint` would add one).
