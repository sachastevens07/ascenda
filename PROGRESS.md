# Progress

Handoff for a new agent. Read `AGENTS.md` first, then `DESIGN.md` section 6. Current phase is **v2.2**. Do not start gym-buddy, AI or food. Build **one** v2.2 task at a time, in listed order; stop so Sacha can test on her phone. SQL is pasted by hand (this repo cannot see the remote database). Never delete sessions or sets. Ask before adding fonts or a notifications library (`expo-notifications` is already in the project).

Git: `main`, ahead of origin. HEAD before this handoff: `be1ad05` H8. User is Sacha.

---

### Done

**v2.0**
- **R1** Cycle notes removed. `supabase/remove_cycle_notes.sql` not confirmed run.
- **R2 / S2 / N6** Tabs: Home, Programmes (Routines / Stretches / Exercises), Planner, Activity, Learn. Profile opens from the header avatar.
- **R3** Routines as data (cover, tags, weeks/days/exercises, enrolments). Six launch plans plus S10 extras.
- **R4** Home featured row, next-session card, routine detail. Session detail screen **removed in N3**; `/routines/session` only launches the logger.
- **R5** Custom workout builder. Free cap 4 owned workouts (S1).
- **R6** Planner agenda + month view. Rest-week banner is in (H1). **D5** restyle later.
- **R7** Gym unlocked from logged sets. Level gating / Quiet Mode off the UI. `zone` and `confidence_history` stay in the database.
- **R8** Activity header (sessions, lifts, time), this-week X of Y, Progress / Awards. Photos moved in **H7**.
- **R9** Onboarding overhaul. **N1** safety and **N4** goals layered on. Notifications are asked after the first session (H3), not here.
- **R10** Free vs Pro split, contextual `openPaywall(reason)`. Visual paywall restyle is **C1 / C2**, not started.
- **R11** Pexels covers and 14 exercise photos. Stretch covers were gym shots until **D2**.

**M1 MuscleWiki videos: partly done.** Match SQL/scripts and 55 approved ids exist. Missing: Supabase CLI, Edge Functions `mw-exercise` / `mw-media-token`, in-app tap-to-play. App never reads `musclewiki_id`.

**v2.1**
- **S1** Duplicate loophole closed (create / duplicate / save-from-routine all count; Pro routines cannot be copied on Free).
- **S2** Programmes tab (see R2).
- **S3** Shared `ProBadge`; Pro routines show week 1 only for free users.
- **S4** Switch routine / End routine on detail and Home ⋯.
- **S5** Superseded by **H1**.
- **S6** Skipped; superseded by **H6** / **D7**.
- **S7** Planner sticky day headers; anchored dropdown menus.
- **S8** Stretch routines (timed holds, 7 plans). Layout **D4** later.
- **S9** Paths, checkpoints, completion card, challenges, progress rings. Photo prompts removed in **H7**. Challenges rolling starts in **H8**.
- **S10** 14 strength + 7 stretch routines.
- **S11** Em dashes removed from user-facing copy (en dashes in ranges stay).
- **S12** Email verification UI + deep link. Dashboard Confirm email still **off**. v2.2 says S12 stays last; it is already built, do not redo it.

**v2.2 Group 1–3 (all 3 Nov 2026)**
- **D1** Tester tools behind `showDevTools` (long-press Profile version once). Primary buttons plum `brand`. Tags sentence case, max 2. Unique routine ids.
- **N5** Default theme light. Profile → Appearance: Light / Dark / Match phone. `profiles.theme_preference`.
- **N3** Next-session / Start session opens the logger. Swap, remove, add/remove set, different day live there. Timer starts on open. End session discards. No add-exercise on routine sessions. Weighted sets need a weight.
- **N1** Full safety text in `src/lib/disclaimer.ts` (v2, international). Onboarding checkbox, re-prompt on version change, Profile About, first-session sheet, one-line on routine/stretch detail.
- **N4** Up to 3 goals; first is Main. `profiles.main_goals text[]`.
- **H1** Streak: one session counts the week; full target is a gold week; rest weeks (earn 1 per 4, bank 2); repair with an extra session; weeks trained never resets; Profile can hide it.
- **H2** Welcome-back card after a full week away. Lighter session / restart week / lighter routine. Back on track badge.
- **H3** Planner-linked reminders after first session. Profile Notifications toggles. Copy is “X is ready when you are”. Reused `expo-notifications`.
- **H4** What’s next in the last two weeks; on completion, Start on Monday.
- **H5** PostHog EU, named events only, identify by user id + plan. No health/photos/free text.
- **H6** Awards groups and hide-awards. Computed from history (no `achievement_definitions` tables). Tier rings and the badge sheet are **D7**.
- **H7** Photos off by default; Profile → Privacy; card on Activity Progress only if on; no programme photo prompts; Show photos before signed URLs.
- **H8** Challenges join with next Monday or next 1st; personal 28-day window; no countdown copy. App code is in. SQL rewrite is still **not confirmed run**.
- **D2** Unique Pexels cover per strength routine and per stretch. Stretch photos are stretching, not gym lifts. Group studio / midriff covers replaced. Home featured row skips the active routine so it does not repeat the next-session card. Bundled files show without SQL; `coverForRoutine` prefers `cover-{routineId}` in `IMAGE_CATALOGUE`.
- **D3** (3 Nov 2026) Home restyle: initials avatar (opens Profile), display greeting, 16:10 featured and stretch cards at 78% width, QuoteCard after the week card, WelcomeBackCard uses `accentSoft` + title2. 90 original quotes bundled; hide from the card ⋯ or Profile → Appearance. SQL: `supabase/quotes_d3.sql` (`profiles.hide_quote`). Learn article cards left for N6.
- **D4** (3 Nov 2026) Routine and stretch detail share `DetailLayout`: hero, badge row, 2-line description + More, compact 4-stat strip, sticky plum button, safety line. Current routine shows a Week X of Y bar. Week rows list day names and ticks; checkpoint chip; phase headers. Stretch holds list with thumbnails. Stretch player: countdown ring, Pause primary, Skip as text, next-hold preview, End stretch in ⋯.
- **D5** (3 Nov 2026) Planner: 32 px eyebrow day headers (“WED 4 NOV”), today stays a dark bar, empty days are header + only (no “Tap to add”), rest week banner full-bleed in the agenda (and at the top in month view). Session rows and reminder chips unchanged.
- **D7** (3 Nov 2026) Awards: group cards, 72 px family icons, locked greyed, earned plum with bronze/silver/gold/platinum rings, progress only on the next badge in each group, tap opens a sheet. Duplicate Awards preview removed from Progress. Developer copy was already gone.
- **D6** (3 Nov 2026) Activity Progress: Highlights kept. Streak card shows current run, weeks trained, gold weeks, 8 week dots and rest weeks banked. Your routine shows this week’s sessions plus “See full plan”. Sessions-per-week chart waits until 2+ weeks with sessions; weight chart waits until 2 logged points.
- **D8** (3 Nov 2026) Profile: onboarding name (or “You”, never the email prefix), email, plan badge. Sections match DESIGN 6.10. My workouts shows “N saved”. Units kg/lbs, rest timer default 60/90/120 s, delete account. About: Safety, Terms, Privacy policy, Contact us, App version. Sign out then version (dev long-press). SQL: `supabase/profile_d8.sql`.
- **D9** (4 Nov 2026) Exercises list: photo when we have one, otherwise a distinct equipment icon and colour (barbell, dumbbell, machine, cable, kettlebell, band, bodyweight). Shared `ExerciseThumb` on Programmes → Exercises, the add-exercise picker, the logger, and the exercise-detail fallback. MuscleWiki stills wait for M1. No SQL.
- **N2** (4 Nov 2026) Routine standard on the 14 strength plans: who it's for, by the end, how it works, phases with goals, lighter-week chips, day focus, warm-up, coach note, role, RIR and tempo. Logger Today card has a warm-up checklist. Overlay fills this if SQL is missing; non-empty database copy wins. SQL: `supabase/n2_routines.sql`. Stretches and custom workouts are unchanged.
- **N6** (4 Nov 2026) Learn tab with 16 bundled articles (3 Getting started, then the other categories; 3 Pro in-depth guides). Featured hero, category tiles, recommended-for-you, continue reading, mark as read, sources, safety line. Related cards on routine and exercise pages. Home “From Learn”. Profile is a pushed screen from the 36 px avatar on every tab. SQL: `supabase/learn_n6.sql` (tables, metadata, links, reads). Bodies stay in the app until a database body is set.

---

### In progress

**SQL pastes (blocked on Sacha).** Still waiting on `d2_covers.sql`, `challenges_h8.sql`, `quotes_d3.sql`, `profile_d8.sql`, `n2_routines.sql`, and **`learn_n6.sql`**. Units, rest timer, hide-quote, N2 coaching copy and Learn articles work on-device without SQL.

---

### Next step

**N7. Daily motivational quote** (AGENTS.md Group 5). The Home quote card is already in from D3; N7 is the `quotes` table. Do not start C1.

After N7: C1, C2. S12 already built.

---

### Known bugs or issues

- First `challenges_h8.sql` paste failed. Rewritten file in this commit; not confirmed run.
- Many later SQL files are **not confirmed run** (see Setup). App usually degrades: empty lists or an on-device fallback.
- Expo Go’s grey floating menu cannot be hidden from app code.
- `one-spot-6` and `one-spot-2` are two different plans; both still show.
- Old programme tables still exist; Profile UI hidden; `/programme` redirects to Programmes.
- Dark theme does not restyle sign-in, paywall, workouts, paths, challenges or exercise detail. Stretch detail and player now follow the theme.
- M1 video player not built. Logger and the exercises list use photos or equipment icons, not MuscleWiki stills.
- Swap dropdown spacing still reported uneven (not retested).
- Confirm email off in the Supabase dashboard. Paywall real-store purchases need a development build (Expo Go uses the Test Store key).
- No ESLint config (`npx expo lint` cannot run).
- Terms and privacy pages are in-app drafts until legal review. Contact is `hello@ascenda.app`. Onboarding bodyweight input stays in kg. Export spreadsheet stays Weight (kg).
- D2: Joint friendly still uses a cross-trainer photo; Barbell strength uses a dumbbell photo. Swap later if needed. Three stretch photographers are listed as “Pexels” until names are confirmed.

---

### Decisions made (not in AGENTS.md)

- App name in copy is Ascenda; `app.json` is still "Women's Strength" / `womens-strength`. Ask before renaming.
- Keep both One spot routines.
- `showDevTools` is on-device AsyncStorage. One long-press of Profile **Version 1.0.0** toggles it (not five). `EXPO_PUBLIC_SHOW_DEV_TOOLS` is unused.
- N3: session row + timer start when the logger opens (phone testing). Back keeps the session (Continue on Home). Header ⋯ End session discards. Rep targets not editable. No add-exercise on routine sessions. Weighted sets cannot be ticked without a weight. Swap is free; suggested-weight chips stay Pro.
- N1 disclaimer is international v2 (doctor, local emergency number). Safety after 18+, before goals. First-session sheet required “I understand”. Learn article line left for N6. No extra font for “Train safely”.
- N4 keeps `goal` / `main_goal` columns; `main_goals` is source of truth. Lose body fat is allowed; no calorie/diet response.
- H1: gold weeks earn rest weeks. Repair = `max(target, 1) + 1` sessions the following week. Only rest rows stored in `streak_weeks`. `accentSoft` added to the theme.
- H2 trigger is a full calendar week with no finished session, not rest-week status. Lighter session: `max(1, sets - 1)` and last weight × 0.9 to 0.5 kg.
- H3 reuses `expo-notifications`. Time picker is hourly chips. Reminders default off. Offers and news never send a push.
- H5: `posthog-react-native`, EU host, `EXPO_PUBLIC_POSTHOG_API_KEY` (`phc_…`) + `EXPO_PUBLIC_POSTHOG_HOST`. No PostHogProvider / autocapture. `set_ticked` has no weight/reps/exercise id.
- H6: badges computed live; no S6 definition tables. Tier rings are D7.
- H7: photos off even if files exist. Consent once per device. Turning off hides the card, does not delete. Free users can enable, then see the Pro card. Delete account is in Profile → Privacy (D8).
- H8: personal window on join (next Monday and next 1st only). 28 days inclusive. Catalogue `challenges.start_date` / `end_date` kept but ignored for status. Both seed challenges stay and are always joinable. Unrestyled challenge page kept. Join dates also saved in AsyncStorage if SQL is missing.
- Primary buttons are plum. Coral is highlights only. Unrestyled screens stay cream until their design pass.
- Export is Excel `.xlsx`, not CSV. UK spelling. No em dashes in user-facing copy.
- Do not use native `Switch` under the pill tab bar; do not use `Modal` + `borderRadius: 999` for tall menus.
- D3: quotes stay bundled until N7 (`quotes` table). Same quote worldwide by UTC date. No display-serif font (system sans, same as the rest of the kit). Challenge card stays on Home after the quote.
- D4: no new SQL. N2 copy blocks (who it's for, by the end, how it works, phase names, roles, lighter-week chips) wait for N2 data. Related Learn cards wait for N6. Skip on the last hold ends that hold; Finish saves. Pause is primary during a hold; Next hold / Finish after the ring completes.
- D5: empty days have no extra row; tap the + (or the header) to add. Rest days still show a thin “Rest day” line. Rest week banner sits in the agenda at the first visible day of that week; month view keeps it under the week strip. No SQL.
- D7: one icon per family (not per badge). First-time and gym “first equipment” badges have no tier ring. Numbered families use bronze → platinum. Locked sheet copy is “This one is still ahead.” No SQL.
- D6: “2+ weeks of data” means two weeks that actually have a session, not two empty calendar weeks. Weight chart needs two logged points on the selected lift. Full roadmap stays on the routine page. Gentle streak copy only when the current run is 0. No SQL.
- D8: missing onboarding name shows “You”, not the email prefix. Avatar initials still use the email if there is no name. Units convert at display only; sets stay in kg. Rest timer default fills in when a set has no prescribed rest (custom workouts); routine rest times stay as written. Terms/privacy are draft in-app copy, not live web pages. Contact mailto is `hello@ascenda.app` until a real address exists. App version is in About and again under Sign out for the hidden tester gesture.
- D9 is DESIGN.md 6.7 (Programmes exercises list), not 6.9 (Activity). Icons use MaterialCommunityIcons from the existing `@expo/vector-icons` package so dumbbell, kettlebell and barbell actually look different. Cable uses the stretch sage teal; band uses the custom ochre. Only ~14 exercises have photos; the rest show the equipment icon. MuscleWiki thumbnails stay with M1.
- N2: overlay fills empty coaching fields from `src/lib/routineStandard.ts`; a pasted `n2_routines.sql` value wins. Lighter weeks are labelled only (sets are not auto-reduced; coach review). Upper body 6 and Glute builder 6 say they are deliberately focused. Alternatives are stored as ids; the in-session swap engine is unchanged. Custom workouts have no Today / warm-up card. Stretch rows stay null.
- N6: 16 articles in `src/lib/learnArticles.ts` so Learn works without SQL. Three Pro guides (double progression, sleep, protein). No calorie or macro targets. No new font. Article covers reuse existing licensed routine/stretch photos. Coach review still needed before launch. Reads sync to `article_reads` when SQL is pasted, and also live on-device. Profile is a stack screen with a back button, not a tab.

---

### Setup notes

**Env vars** (names only; `.env` is gitignored; copy `.env.example`):
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_REVENUECAT_IOS_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`
- `EXPO_PUBLIC_REVENUECAT_TEST_KEY` (Expo Go)
- `EXPO_PUBLIC_POSTHOG_API_KEY`
- `EXPO_PUBLIC_POSTHOG_HOST` (`https://eu.i.posthog.com`)
- `EXPO_PUBLIC_SHOW_DEV_TOOLS` unused; safe to ignore

Restart Expo after `.env` changes.

**Start the app (Windows, one terminal):**
`$env:NODE_OPTIONS="--use-system-ca"; npx.cmd expo start --clear`
Scan the QR with Expo Go. Use `--tunnel` if needed. Checks: `npx.cmd tsc --noEmit`.

**SQL already run (confirmed):** `exercises.sql`, `profiles.sql`, `programmes.sql`, `sessions.sql`. User also reported (24 Oct) `routines.sql` and `planned_sessions.sql` pasted.

**SQL to paste (not confirmed; app usually still opens):**
`zones.sql`, `onboarding_v1_1.sql`, `quiet_mode.sql`, `level_up.sql`, `custom_workouts.sql`, `blocks.sql`, `remove_cycle_notes.sql`, `activity.sql`, `onboarding_v2.sql`, `routine_covers.sql`, `exercise_media.sql`, `remove_rest_passes.sql`, `stretches.sql`, `paths.sql`, `s10_routines.sql`, `s11_copy.sql`, then v2.2: `theme_preference.sql`, `disclaimer.sql`, `main_goals.sql`, `streak_h1.sql`, `reminders.sql`, `achievements_h6.sql`, `photos_h7.sql`, `challenges_h8.sql` (rewritten; paste the whole file), `d2_covers.sql`, `quotes_d3.sql`, `profile_d8.sql`, `n2_routines.sql`, **`learn_n6.sql`**. Do not run `cycle.sql`.

Agents cannot run SQL. Sacha pastes into Supabase > SQL Editor. Files are idempotent; the editor’s “destructive operations” warning is expected.

**Dashboard still needed:** Authentication → Email → Confirm email off until testers. RevenueCat entitlement `ascenda_pro`. PostHog dashboards are created in the PostHog EU UI, not in the app.
