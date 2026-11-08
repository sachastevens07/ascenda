# Progress

Handoff for a new agent. Read `AGENTS.md` first, then `DESIGN.md` sections 6, 8 and 9. Current work is the **Roadmap to completion** below. Do not start gym-buddy, AI or food. Build **one** roadmap item at a time; stop so Sacha can test on her phone. SQL is pasted by hand (this repo cannot see the remote database). Never delete sessions or sets. Ask before adding fonts or a notifications library (`expo-notifications`, Fraunces and Manrope are already in the project).

**Briefs replaced 5 Nov 2026** from `AGENTS_2.md` and `DESIGN_2.md`. MuscleWiki mentions were switched to exercise media (WorkoutX). The safety disclaimer stays the international v2 already in the app (no GP, 999 or solicitor). Hard paywall, product vision, Group 7 (X1 to X7), G1/G2, v2.3 to v2.5 and DESIGN section 9 are now in the project files.

Git: `main`, ahead of origin. User is Sacha.

---

### Done

**v2.0**
- **R1** Cycle notes removed. `supabase/remove_cycle_notes.sql` not confirmed run.
- **R2 / S2 / N6** Tabs: Home, Programmes (Routines / Stretches / Exercises), Planner, Activity, Learn. Profile opens from the header avatar.
- **R3** Routines as data (cover, tags, weeks/days/exercises, enrolments). Six launch plans plus S10 extras.
- **R4** Home featured row, next-session card, routine detail. Session detail screen **removed in N3**; `/routines/session` only launches the logger.
- **R5** Custom workout builder. The free cap of 4 was removed in **P1**.
- **R6** Planner agenda + month view. Rest-week banner is in (H1). **D5** restyle later.
- **R7** Gym unlocked from logged sets. Level gating / Quiet Mode off the UI. `zone` and `confidence_history` stay in the database.
- **R8** Activity header (sessions, lifts, time), this-week X of Y, Progress / Awards. Photos moved in **H7**.
- **R9** Onboarding overhaul. **N1** safety and **N4** goals layered on. Notifications are asked after the first session (H3), not here.
- **R10** Replaced by **P1** (hard paywall). The paywall screen restyle is **C3**.
- **R11** Pexels covers and 14 exercise photos. Stretch covers were gym shots until **D2**.

**M1 exercise media (WorkoutX): plumbing built 6 Nov 2026, WorkoutX account deferred.** `getExerciseMedia()` and the Edge Function are in the repo. Play buttons stay hidden until there are matches. Sign-up, API key, matching, SQL and deploy wait for Sacha. MuscleWiki columns stay.

**v2.1**
- **S1** Duplicate loophole closed, then removed in **P1** (no custom workout limit).
- **S2** Programmes tab (see R2).
- **S3** Shared `ProBadge` and locked week 1 previews, then removed in **P1**.
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
- **D1** Tester tools behind `showDevTools` (long-press Profile version once). Primary buttons plum `brand` only. Secondary buttons `brandSoft` (outline for paired choices). Tags sentence case, max 2, one line. Short goal eyebrows. Unique routine ids.
- **N5** Default theme light. Profile → Appearance: Light / Dark / Match phone from microcopy. Device + `profiles.theme_preference`. Instant. Cloud waits for local hydrate.
- **N3** Next-session / Start session opens the logger. Swap, remove, add/remove set, different day live there. Timer starts on open. End session discards. No add-exercise on routine sessions. Weighted sets need a weight.
- **N1** (6 Nov 2026) Full safety text in `src/lib/disclaimer.ts` (v2, international). Surrounding strings from `content/microcopy` safety. Onboarding checkbox, re-prompt on version change, Profile About, first-session sheet, footer on routine pages and Learn articles only. SQL: `supabase/disclaimer.sql` (not run).
- **N4** (6 Nov 2026) Up to 3 goals from `content/onboarding/onboarding.json`; first is Main. Profile → Your answers can edit them. `profiles.main_goals text[]`. SQL: `supabase/main_goals.sql` (not run).
- **P1** (6 Nov 2026) Hard paywall. One `ascenda_pro` check in `useSubscription`. Badges, locked previews, workout cap and Unlock with Pro gone. `subscriptions` + RevenueCat webhook. SQL: `supabase/subscriptions_p1.sql` (not run). Paywall restyle and locked home are **C3** (done).
- **X5** (6 Nov 2026) Onboarding v2 from `content/onboarding/onboarding.json`. Age first with the inline under-18 block (Continue disabled, nothing stored). Varied inputs, progress bar, Reanimated 250 ms transitions. Haptics are a no-op until `expo-haptics` is confirmed. Answers go in `profiles.onboarding_answers`. Recommendation and why-lines follow the JSON rules. Strength estimate is `load_increment_kg × floor(exposures / 3)` from the routine file, never hard-coded. Ends: building plan, plan reveal, safety, paywall, first session. SQL: `supabase/onboarding_x5.sql` (not run). Logger, progression and swaps were not touched. Did not add `expo-haptics`. Added `react-native-reanimated` as named in the task.
- **C3** (6 Nov 2026) DESIGN 9.2 paywall, locked home on every tab, trial/grace banners, expired Welcome back with read-only history and export. Prices from RevenueCat. Close never opens a second paywall. No new SQL.
- **C1** (6 Nov 2026) How to cancel from microcopy on the paywall and Profile. Manage subscription is one tap to Apple settings. Trial-ending push (2 days) and annual renewal push/banner (7 days) use notification copy from `/content`. Pushes only fire if permission is already granted. No countdowns. No new SQL.
- **H1** Streak: one session counts the week; Y is onboarding days-per-week (W7); gold week when she hits Y; rest weeks removed (Sacha, 6 Nov 2026); repair with an extra session; weeks trained never resets; Profile can hide it. Copy from `content/microcopy` streak.
- **H2** Welcome-back card after a missed week. Lighter session / restart week / Welcome Back: 4-week restart after 3+ weeks. Back on track badge. Copy from microcopy.
- **H3** Planner-linked reminders after first session. Primer and pushes from microcopy. Four session messages rotate by date. Sunday plan-your-week optional. Offers opt-in only, never a push. Reused `expo-notifications`.
- **H4** What's next in the last two weeks from path, then `next_routine_suggestions` in `/content`, then goals. Completion review with checkpoint start vs now, badge, share card, one-tap Start next on Monday. Never leaves Home empty after a finish.
- **H5** PostHog EU, named events (including trial_converted, subscription_started and AI names). Identify by user id + plan. No health/photos/free text. Dashboards are built in the PostHog EU UI (steps in Roadmap item 24).
- **H6** Awards from `content/achievements/achievements.json` (47 badges, 5 cardio ones hidden until W2). History plus mapped `milestones` so earned awards stay. Hide awards in Profile. Tier rings and the badge sheet are **D7**. SQL: `supabase/achievements_h6.sql` (not run).
- **H7** Photos off by default; Profile → Privacy; consent screen from microcopy on first use; card on Activity Progress only if on; Show photos before signed URLs; never in shares or notifications.
- **H8** Challenges from `content/challenges/challenges.json`. Join on next Monday or the 1st; weekly missions; catch-up up to twice; one at a time; no countdowns or participant counts. SQL: `supabase/challenges_h8.sql` (not run).
- **D2** Unique Pexels cover per strength routine and per stretch. Stretch photos are stretching, not gym lifts. Group studio / midriff covers replaced. Home featured row skips the active routine so it does not repeat the next-session card. Bundled files show without SQL for legacy ids; **X1** prefers `/content` slugs and placeholders until new photos are uploaded.
- **D3** (3 Nov 2026) Home restyle: initials avatar (opens Profile), display greeting, 16:10 featured and stretch cards at 78% width, QuoteCard after the week card, WelcomeBackCard uses `accentSoft` + title2. 90 original quotes bundled; hide from the card ⋯ or Profile → Appearance. SQL: `supabase/quotes_d3.sql` (`profiles.hide_quote`). Learn article cards left for N6.
- **D4** (3 Nov 2026) Routine and stretch detail share `DetailLayout`: hero, badge row, 2-line description + More, compact 4-stat strip, sticky plum button, safety line. Current routine shows a Week X of Y bar. Week rows list day names and ticks; checkpoint chip; phase headers. Stretch holds list with thumbnails. Stretch player: countdown ring, Pause primary, Skip as text, next-hold preview, End stretch in ⋯.
- **D5** (3 Nov 2026) Planner: 32 px eyebrow day headers (“WED 4 NOV”), today stays a dark bar, empty days are header + only (no “Tap to add”). Rest-week banner removed with rest weeks. Session rows and reminder chips unchanged.
- **D7** (3 Nov 2026) Awards: group cards, 72 px family icons, locked greyed, earned plum with bronze/silver/gold/platinum rings, progress only on the next badge in each group, tap opens a sheet. Duplicate Awards preview removed from Progress. Developer copy was already gone.
- **D6** (3 Nov 2026) Activity Progress: Highlights kept. Streak card shows current run, weeks trained, gold weeks and 8 week dots. Your routine shows this week’s sessions plus “See full plan”. Sessions-per-week chart waits until 2+ weeks with sessions; weight chart waits until 2 logged points.
- **D8** (3 Nov 2026) Profile: onboarding name (or “You”, never the email prefix), email, plan badge. Sections match DESIGN 6.10. My workouts shows “N saved”. Units kg/lbs, rest timer default 60/90/120 s, delete account. About: Safety, Terms, Privacy policy, Contact us, App version. Sign out then version (dev long-press). SQL: `supabase/profile_d8.sql`.
- **D9** (4 Nov 2026) Exercises list: photo when we have one, otherwise a distinct equipment icon and colour (barbell, dumbbell, machine, cable, kettlebell, band, bodyweight). Shared `ExerciseThumb` on Programmes → Exercises, the add-exercise picker, the logger, and the exercise-detail fallback. Exercise media (WorkoutX) stills wait for M1 (revised). No SQL.
- **N2** (6 Nov 2026) Routine standard from `/content`. 15 launch routines, the strength catalogue and exercise-guides are bundled. Detail shows purpose, who it's for, by the end, why this split, how the weeks work, weekly structure, phases with goals. Logger shows role, plain-English RIR, tempo and the day's coach note. Swap engine uses guide `if_its_taken` lists first. Overlay fills empty database fields; a pasted `n2_routines.sql` value wins. Old 14 ids keep their enrolments and history. Stretches and custom workouts are unchanged. SQL: `supabase/n2_routines.sql` (not run).
- **N6** (completed 6 Nov 2026, roadmap 28). Learn tab from `content/learn/articles.json`: 34 articles, 8 categories. Featured hero, category tiles, recommended-for-you from `recommended_for_goals`, continue reading, mark as read, sources, safety line. Related cards on routine and exercise pages from content links. Home “Picked for you”. Profile is a pushed screen from the header avatar. SQL: `supabase/learn_n6.sql` (not confirmed run). Bodies stay in the app until a database body is set.
- **N7** (completed 6 Nov 2026, roadmap 28). Daily quote on Home from `content/quotes/quotes.json` (100 original Ascenda quotes). Same one worldwide: UTC days since 1 Jan 2026 modulo the list. Hide from the card ⋯ or Profile → Appearance. SQL: `supabase/quotes_n7.sql` (not confirmed run; an older 90-row seed is ignored until a live sync).
- **X6** (7 Nov 2026). Refer a friend. Personal codes, deep link, Apple Offer Code `FRIEND14`, referrer reward via the RevenueCat webhook. SQL: `supabase/referrals_x6.sql` (not run). App Store Connect offer code and iPhone redeem testing deferred until Sacha has an iPhone.
- **Typography** (4 Nov 2026) Fraunces (display) and Manrope (UI) app-wide. Tokens in `src/constants/theme.ts`, family names in `src/constants/fonts.ts`, applied through `AppText`. `FontGate` in the root layout keeps the splash up until fonts load. No SQL.

---

### In progress

**SQL pastes (blocked on Sacha).** To load today's sessions from the new `/content` plans, paste **`content_routines_1.sql`**, then **`content_routines_2.sql`**, then **`content_routines_3.sql`** (one file at a time; does not touch the old 14 ids, sessions, sets or enrolments). Still waiting on `d2_covers.sql`, `photos_h7.sql`, `challenges_h8.sql`, `quotes_d3.sql`, `profile_d8.sql`, `n2_routines.sql`, `learn_n6.sql`, **`quotes_n7.sql`**, `theme_preference.sql`, **`images_manifest.sql`** (this replaces `images_x1.sql` and `heroes_batch1.sql`), **`gym_experience_g1.sql`**, **`routines_is_active.sql`**, **`session_blocks_w1.sql`**, **`exercise_notes_x4.sql`**, **`workoutx_m1.sql`** (M1; do not paste until you confirm), **`subscriptions_p1.sql`**, **`onboarding_x5.sql`**, **`achievements_h6.sql`**, and **`referrals_x6.sql`**. After you review the match CSV, paste **`workoutx_ids.sql`**. Units, rest timer, hide-quote, N2 coaching copy, Learn articles, the daily quote, cover placeholders, the gym-experience question and the Refer screen (local code) work on-device without SQL. Notes and per-exercise rest in the logger also work on-device; they only sync across phones after `exercise_notes_x4.sql`. The gym-experience answer only persists after `gym_experience_g1.sql`. Referral tracking and rewards need `referrals_x6.sql` plus the webhook secret. `quotes_n7.sql` also adds `hide_quote`, so `quotes_d3.sql` is optional if you paste N7. Content sync will not mark old routines inactive until `routines_is_active.sql` is pasted, and a live sync is not run until you confirm. `session_blocks_w1.sql` adds day/session types and blocks without changing the logger list.

---

### Next step

**Step C walks items 1 to 47 in listed order.** Do not skip to the first unchecked box. Content loader (item 5) was Step B and is already in.

Current: **29. X6** done this pass. Wait for Sacha to say "next". The next unchecked item is **30. TestFlight**. Do not start the next unchecked box until she says so.

The hard-paywall decision supersedes C2, S1 and S3 as future work (P1). Do not redo S1 or S3.

---

## Roadmap to completion

Checked against the code and this file on 5 Nov 2026. Ticked items are in the app. Notes say what is only partly there. `/content` is the source of truth and is not loaded yet.

### Stage 1: Look and feel
- [x] **1. D1** Global design fixes (final-phase pass 5 Nov 2026). Dev tools are a long-press on the version. Primary buttons are plum only (no coral tone). Secondary buttons are `brandSoft` fill; outline is only for paired choices (Camera / Library, under-18). Tags are sentence case, max 2, one line. Eyebrows use a short goal word ("Intermediate · Strength"). `one-spot-6` and `one-spot-2` stay as two different plans. No user-facing em dashes.
- [x] **2. N5** Light theme by default (final-phase pass 5 Nov 2026). Appearance: Light, Dark, Match phone from `content/microcopy`. Saved on the device and in `profiles.theme_preference`. Applies at once. Cloud fill waits until device storage has been read. Microcopy is bundled, not loaded by content:sync. SQL: `supabase/theme_preference.sql` (not confirmed run).
- [x] **3. X1** Photo system (8 Nov 2026). `content/images/image-manifest.json` is the only photo list (222 slugs). The app resolves every image by slug. A photo shows only when its row is `status = ready` and has `licence_source`, `photographer` and `source_url`. `same_as` reuses the other file. Anything else is a brand-tinted placeholder with an icon for people, equipment or food. No bundled stock photos and no Pexels fallbacks. Home heroes are `hero-home-morning`, `hero-home-evening`, `hero-home-rest-day`, `hero-home-done` and `hero-welcome-back`. `npm run images:report` lists what is still needed. `npm run images:upload` resizes and uploads `assets-src/images/<slug>.jpg` once `sharp` is installed and a service role key is in `.env`. `sharp` is not installed yet. SQL not run: `supabase/images_manifest.sql`. Paste `supabase/routine_covers.sql` too if the `routine-covers` bucket is missing. Old `catalogue.json`, `images_x1.sql` and `heroes_batch1.sql` are not the source of truth. Logger, progression and swaps were not changed. Exercise thumbnails no longer use the old stock photos, so they show the equipment icon until WorkoutX media is connected.
- [x] **4. G1** Gym-first (5 Nov 2026). Onboarding asks "How long have you been going to the gym?" (Not yet / Just started / On and off / Regularly) instead of where she trains. Recommendations use gym_experience with gym comfort and goals. `training_location` is still in the database and is only used to backfill gym_experience. Home strength is shown as "Days you can't get to the gym" and is never in Home featured. Learn categories were already gym-focused. App Store keywords: keep gym, lifting, beginner, glutes; do not add home workout or home gym terms. Draft listing is `content/app-store/listing.md`. SQL: `supabase/gym_experience_g1.sql` (not confirmed run). Logger, progression and swaps were not touched.
- [x] **5. Content loader.** `npm run content:sync -- --dry-run` (5 Nov 2026, rebuilt; N2 6 Nov 2026). Reads `/content` and plans upserts by slug. Does not delete, and does not touch sessions, sets, enrolments or profiles. Live writes are refused until a service role key exists and you confirm. Onboarding, microcopy, achievements, single sessions and `content/ai` are not loaded (bundled). Cardio, food and machine guides stay skipped. Warm-ups, exercise-guides, the catalogue and the 15 routines are reported (guides bundled for first-time copy and swaps). Stretch routines are planned as `routines` with `type = stretch`. Exercise inserts use guide `primary_muscle`, 3 cues and `location_hint`, and match existing rows by slug then name (existing id kept). Routine goals and Learn categories are mapped onto the current checks. Quotes upsert as `q-NNN` from `sort_order`, matching existing rows by text first. Old routines not in `/content` would be set `is_active = false` after `supabase/routines_is_active.sql`; do not live-run that until you confirm. The publishable key cannot see catalogue rows (RLS), so an empty read is not treated as an empty library.

### Stage 2: The workout core
- [x] **6. W1** Session types and blocks (5 Nov 2026). `routine_days.type` and `sessions.type` are `strength` | `cardio` | `recovery`. Each day has ordered `routine_day_blocks` (warmup, strength, cardio, cooldown, stretch). Existing strength days backfill warmup + strength + cooldown; stretch days backfill one stretch block. Exercises stay on `routine_day_exercises` (with optional `block_id`), so the logger, progression and swaps are unchanged. `support_days` and `weekly_schedule` are jsonb on `routines` for the Planner later; extra cardio/recovery days are not added yet. content:sync plans 104 weeks, 300 days and 935 blocks from `/content`. Live writes still need a service role key and your confirm. SQL: `supabase/session_blocks_w1.sql` (not run).
- [x] **7. N3 + X4** Logger (6 Nov 2026). Start session opens the logger. Header: minimise, live timer (starts on first ticked set or Start timer), Finish. Stats: duration, volume, sets. Set table: Set, Previous, kg, Reps, tick; W for warm-up sets (long-press + Add set). Per exercise: thumbnail, name opens the guide, ⋯ (swap, remove, add/remove set, change rep target), Rest and Note chips remembered next time. Reorder is long-press then arrows (no drag library). Minimised bar on every tab. Suggested-weight chip, role, RIR, rest bar and PB glow kept. Changes apply to today only. End session with no ticked set discards with no prompt. Swap engine and double-progression unchanged. Microcopy from `content/microcopy` (bundled). SQL: `supabase/exercise_notes_x4.sql` (not run). Did not add `react-native-draggable-flatlist` or `expo-haptics`.
- [x] **8. G2** Warm-up and cool-down blocks (6 Nov 2026). Every strength session in the logger has a collapsible warm-up at the top and cool-down at the bottom from `content/warmups-cooldowns` (8 templates, bundled). Start opens a timed player (stretch-style ring, Pause, Skip, reps as Done). Skip is one tap and never counts as a session, so the streak is unchanged. First main lift gets two W ramp-up sets: 8 reps at about 50% then 5 at about 75%, skipped for bodyweight and assisted machines, and ignored for volume, PBs and awards. Swap engine and double-progression unchanged. `npm run content:sync -- --dry-run` reports the templates; live writes still need a service role and your confirm. No new SQL (W1 blocks table is enough; the app does not wait on it).
- [x] **9. M1 (revised)** WorkoutX plumbing (6 Nov 2026). Account, key, matching, SQL and deploy **deferred**. App code is in: `getExerciseMedia()`, Edge Function `exercise-media`, match script, `expo-video`. Play buttons are hidden until `content/exercises/workoutx-ids.json` has matches. SQL not run: `supabase/workoutx_m1.sql` then `supabase/workoutx_ids.sql`. MuscleWiki columns kept. Did not use WorkoutX's generator.
- [x] **10. N2** Routine standard (6 Nov 2026). 15 `/content` routines, the strength catalogue and exercise-guides are bundled and reported by content:sync. Detail and logger show the Routine standard fields. Swap engine uses guide swap lists. Old enrolments stay on the old 14 ids. SQL: `supabase/n2_routines.sql` (not run).

### Stage 3: Onboarding and money
- [x] **11. N4** Up to three goals (6 Nov 2026). Values and labels from `content/onboarding/onboarding.json`. Multi-select chips, Main on the first pick, Profile → Your answers can edit. Featured and Learn weight the main goal. Lose body fat is allowed; the app still recommends strength routines and general articles. SQL: `supabase/main_goals.sql` (not run). Onboarding v2 screens stay for X5.
- [x] **12. N1** Full safety disclaimer (6 Nov 2026). Body in `src/lib/disclaimer.ts`. Surrounding strings from `content/microcopy` `strings.safety`. Onboarding screen with required checkbox, `disclaimer_version` / `disclaimer_accepted_at`, re-ask when the version changes, first-session sheet with 4 bullets, Profile → Safety and disclaimer, footer on routine pages and Learn articles only. SQL: `supabase/disclaimer.sql` (not run).
- [x] **13. P1** Hard paywall (6 Nov 2026). Single `ascenda_pro` check in `useSubscription`. Pro badges, FreeBadges, locked previews, custom workout limits and Unlock with Pro paywalls removed from the app. `is_pro` columns stay unused. `subscriptions` table + RevenueCat webhook Edge Function. RLS hides week 2+ and exercise prescriptions without trial/active/grace. Plan-reveal summaries stay readable. Profile → Plan and subscription uses microcopy status chips, Manage, Restore. Paywall screen and locked home stay for **C3**. SQL: `supabase/subscriptions_p1.sql` (not run).
- [x] **14. X5** Onboarding v2 from `content/onboarding/onboarding.json` (6 Nov 2026). Screens, why_lines, recommendation rules and `strength_estimate` are bundled from that file. Age is first, with the inline under-18 block and Continue disabled; nothing is stored and no analytics fire for that choice. Varied inputs, progress bar, Reanimated transitions. `expo-haptics` was not added (ask first); selection feedback is a no-op. `profiles.onboarding_answers` jsonb plus `age_band` and `cardio_preference`. The milestone estimate uses the file formula on the recommended routine's first checkpoint lift (first estimate uses the default routine for her experience). Ends: building plan, plan reveal, N1 safety, existing paywall, first session. SQL: `supabase/onboarding_x5.sql` (not run). Logger, progression and swaps were not touched.
- [x] **15. C3** Paywall, locked home and subscription states (6 Nov 2026). Paywall is a full-screen sheet (close × top-left always visible) using `content/microcopy` paywall strings. Prices, trial length and “about £X a month” come from RevenueCat, never hard-coded. Annual is pre-selected; “Best value” only if annual is cheaper than 12× monthly. Closing the paywall lands on locked home, never a second paywall. Locked home covers every tab when status is `none` or `expired` (new plan card, or Welcome back + stats + See your history + Export if she has sessions). Profile, history, export, terms and privacy stay reachable. Trial-ending banner (last 2 days, dismissible) and grace banner on Home. Profile chips already from P1. Listener still updates instantly. Dev override cycle: Real / No subscription / Subscribed / Trial ending / Grace / Expired. No new SQL. Logger, progression and swaps were not changed. Did not add a library.
- [x] **16. C1** Subscription compliance (6 Nov 2026). Paywall already showed RevenueCat price, period, trial length and charge date (C3); it now also has How to cancel from microcopy, with Manage opening Apple settings. Trial-ending: Home banner (C3) plus a push 2 days before, using `notifications.trial_ending`, only if notification permission is already on (H3). Annual renewal: Home banner and a push 7 days before, using `notifications.renewal_reminder`. No countdown timers or urgency. Profile → Manage subscription is one tap to Apple settings (trial, active, grace and expired). How to cancel shows the microcopy body and the same Manage action. Dev override **Annual renews in 6 days**. No new SQL. Logger, progression and swaps were not touched. Did not add a library.
- [x] **17. S4** Switch routine and End routine (6 Nov 2026). On the current plan page ⋯ and the Home next-session ⋯: Switch (opens Programmes) and End. Ending uses `routine_actions` copy (history, PBs and awards stay safe) and marks the enrolment abandoned, or complete if every session is already logged, then clears future planned sessions from that routine. Starting a different plan while one is active uses the Switch confirmation, then `startRoutine` ends the old enrolment and starts the new one. Hard paywall still applies (no per-routine Pro gate). No new SQL. Logger, progression and swaps were not touched. Did not add a library.

### Stage 4: Habit and retention
- [x] **18. H1** Streak rework (6 Nov 2026). Y is her onboarding days-per-week (W7), not planned sessions. One qualifying session counts the week; hitting Y is a gold week. Strength and cardio always count; stretch and recovery count from 10 minutes. Weeks trained never resets. Current run and gold weeks show on Home and Activity. Rest weeks were built then **removed** (Sacha, 6 Nov 2026): no bank, no Planner rest-week, no Monday rest-week prompt. A missed week can still be repaired with `max(Y, 1) + 1` sessions the following week. Profile can hide the streak. Copy from `content/microcopy` `strings.streak` (no guilt). Planner rest **days** stay. SQL: `supabase/streak_h1.sql` (not confirmed run; `rest_weeks_banked` / `streak_weeks` rest rows are unused). Logger, progression and swaps were not touched. Did not add a library. The three-segment week ring stays for W7.
- [x] **19. H2** Welcome-back flow (6 Nov 2026). Card on Home after a missed week (a full calendar week with no session, not a rest week). Copy from `content/microcopy` `strings.welcome_back` (never how long she's been away). Primary: lighter next session (drop a set only if there are 3 or more, never below 2 working sets; suggested weights × 0.9). Options: restart this week, or Welcome Back: 4-week restart after 3+ weeks (`welcome-back-4-week-restart`, never featured). Finishing that session earns Back on track (repeatable locally; badge stays earned). Monday / 1st / start of term uses the fresh-start body. Preview toggle in Profile developer tools. SQL: already in `supabase/content_routines_1.sql` (and 2/3); not a new migration. Logger, progression and swaps were not changed. Did not add a library.
- [x] **20. H3** Planner-linked reminders (6 Nov 2026). Permission primer after the first finished session (`notifications.primer_*`). One local reminder per planned day at her time (default last session hour, or 6pm); none on rest days. Four session messages rotate by date from microcopy. Optional Sunday plan-your-week (`weekly_summary` / `weekly_summary_with_stats`). Offers and news is a separate opt-in and never sends a push. Profile → Notifications labels from microcopy. Reused `expo-notifications` (already in the project). SQL: `supabase/reminders.sql` (not confirmed run; times also save on-device). Logger, progression and swaps were not touched. Did not add a library.
- [x] **21. H4** Hand-off to the next routine (6 Nov 2026). Last two weeks of a plan: What's next on Home and the current routine page (Preview). Recommendation order: next on her path, then `next_routine_suggestions` in the routine JSON (ranked by her goals), then featured, then Strong Foundations. Welcome Back and gym-backup plans are never offered. On the last session: completion screen with checkpoint start vs now, Routine completed chip, share card, one-tap Start {next} on Monday from `routine_actions` microcopy, Browse other routines. Tapping it enrols from next Monday so the Planner fills. If she leaves without tapping, Home (and Activity Progress) still show the same Start on Monday card so she is never left with nothing planned. Copy from `content/microcopy` `strings.routine_actions`. content:sync reports suggestions (bundled, no database column). Preview toggle in Profile developer tools. No new SQL. Logger, progression and swaps were not changed. Did not add a library.
- [x] **22. H6** Achievements rework (6 Nov 2026). 47 badges from `content/achievements/achievements.json`, bundled. Names, how-to-earn, celebrations and rules come from that file. Families: First times, Sessions, Weeks trained, Consistency, Personal bests, Programmes, Gym unlocked, Stretch and recover, Weight lifted. Session 1 / first PB / gold week sit in First times. Cardio machine badges (`available_from: v2.3`) stay hidden until W2. Repeatable badges (Back on track, Goal reached, Challenge accepted) show a count (x3), not extra tiles. Progress only on the next unearned tiered badge in each family. Old Awards ids and `milestones.type` values map by meaning so nobody loses a badge (including `week-1` and `gold-week` → Full week). Profile → Training uses microcopy "Hide awards". Opening an exercise guide counts toward Read the room. content:sync reports the file and does not write a definitions table. SQL: `supabase/achievements_h6.sql` (`hide_achievements`, `user_achievements`, migrate from `milestones`; not confirmed run). Logger, progression and swaps were not changed. Did not add a library.
- [x] **23. H7 + H8** Progress photos and rolling challenges (6 Nov 2026). **H7:** photos stay off until Profile → Privacy; first turn-on opens the consent screen from `progress_photos` microcopy; Activity shows the card only when on, still hidden behind Show photos (signed URLs only after that); turning off hides the card and does not delete; never used in summaries, completion cards, share images or notifications. SQL: `supabase/photos_h7.sql` (not confirmed run). **H8:** four challenges bundled from `content/challenges/challenges.json` (Four Weeks Strong, The Gym Explorer, 28 Days of Stretch, Quiet Start). Join picks next Monday or the 1st; `challenge_participants.start_date` holds the window; weekly missions and a gentle catch-up (same week repeats, up to 2 times) then a quiet end with no failure copy. One active challenge at a time (switch confirmation). No countdown, no participant counts. Home only pushes a challenge if she has joined one or it is in its featured window (Quiet Start in January and February). Copy from `content/microcopy` `strings.challenges`. Joins also save on-device if SQL is missing. content:sync reports the file. SQL: `supabase/challenges_h8.sql` (nullable catalogue dates, four content slugs, participant start_date; not confirmed run). Logger, progression and swaps were not changed. Did not add a library.
- [x] **24. H5** PostHog analytics (6 Nov 2026). Named events only, EU host, identify by user id + plan (`none` | `trial` | `active` | `grace` | `expired`). H5 list plus paywall `trial_converted` / `subscription_started` (product `annual` | `monthly`) and AI event names (`ai_feature_used`, `ai_result_accepted`, `ai_result_rejected`, `ai_limit_reached`, `ai_fallback_used`) ready for v2.5. `rest_week_used` stays in the allowlist but never fires (rest weeks removed). Learn opens fire once from the article screen (id only). `set_ticked` has no weight, reps or exercise id. Properties are allowlisted; health, photos, names, emails, prompts and free text are dropped. No PostHogProvider, no session replay, no autocapture of screen text. No new SQL. Did not add a library (`posthog-react-native` already in). **Dashboards are not in the app.** Build them in PostHog EU (`https://eu.posthog.com`) as follows. Filter insights with `env` = `prod` for launch (testers can use `dev`).
  1. **Activation.** Dashboard "Activation". Funnel: `onboarding_completed` → `paywall_viewed` → `trial_started` → `session_completed`, 7-day window. Funnel: `onboarding_completed` then two `session_completed` steps, 7-day window (2+ sessions in first 7 days). Same with three `session_completed` steps and a 14-day window (3+ in first 14). Funnel: `trial_started` → `session_completed`, 2-day window (trial session 1 in two days).
  2. **Retention.** Insight type Retention. First event: `onboarding_completed`. Return event: `session_completed`. Interval: Day. Read Day 1, Day 7 and Day 30.
  3. **Comeback.** Funnel: `planned_week_missed` → `welcome_back_shown` → `welcome_back_completed` (or `session_completed`), 30-day window. That is return rate after the first missed week.
  4. **Routines.** Trends of unique users for `routine_completed`. Funnel: `session_started` (filter `source` = `routine`) → `routine_completed`. Optional second step `next_routine_started`.
  5. **Trial to paid.** Funnel: `paywall_viewed` → `trial_started` → `trial_converted`. Breakdown `trial_converted` by `product`. Funnel: `paywall_viewed` → `subscription_started` to catch monthly with no trial.
  6. **AI (empty until v2.5).** Trends of `ai_feature_used` broken down by `feature`. Funnel: `ai_feature_used` → `ai_result_accepted`. Trends of `ai_limit_reached` and `ai_fallback_used`. Never chart prompt or answer text (the app does not send it).

### Stage 5: Depth and discovery
- [x] **25. X2** Home with all sections (6 Nov 2026). Order: header (avatar, search, planner), welcome hero (~45% height, morning, evening, rest, done or welcome-back slug, state-based CTA), H4 What’s next if it has a recommendation, week strip with today’s session or empty, daily quote, Featured for you, challenge (joined or Quiet Start featured window), refer banner (copy-only; dismiss ×), Your week so far (sessions, PBs, minutes, awards + native text Share), Awards preview, Stretch today, Picked for you (Learn with an Article chip). Each section hides if empty. Welcome-back is a hero state (H2), not a second card. Meals segment omitted until Food. Share is numbers only (no photos, no view-shot library). Full X6 (codes, Apple offers) stays for item 29. Copy from `content/microcopy` `strings.home` (bundled). No new SQL. Logger, progression and swaps were not changed. Did not add a library.
- [x] **26. X3** Programmes browse and single sessions (6 Nov 2026). Routines tab is a browse page: current plan, Recommended for you (from onboarding `recommendPlan` rules), Build my plan (re-runs plan questions at `/onboarding?rebuild=1`, saves answers, opens the recommended routine without enrolling), training style tiles, Start here, Single sessions. No Popular (no real data), no New flag, no Coach reviewed until `reviewed_by` is set, no Pro carousel. Stretch tile opens the Stretches tab. Cardio tile only if a `cardio_balanced` routine or cardio single exists. Home-only singles stay in "Days you can't get to the gym". 12 singles bundled from `content/single-sessions` (10 gym, 2 home). Play/start opens the existing logger via a custom session with an on-device plan (no `single_sessions` table). Stretches stay `routines` with `type = stretch` from `content/stretches`. Copy from `content/microcopy` `strings.programmes`. No new SQL. Logger, progression and swaps were not changed for routine sessions. Did not add a library.
- [x] **27. D2 to D9** Design fixes are in. D9 thumbnails are photos or equipment icons, not WorkoutX.
- [x] **28. N6 + N7** Learn and daily quote from `/content` (6 Nov 2026). **N6:** 34 articles in 8 categories from `content/learn/articles.json`, bundled. Featured hero, category tiles, Recommended for you from `recommended_for_goals` (weighted to her main goal), Continue reading, Mark as read (on-device plus `article_reads` when SQL is pasted). Related articles on routine and exercise pages from `related_routines` / `related_exercises`. Safety line on articles. No Pro copy. **N7:** 100 quotes from `content/quotes/quotes.json`. Same quote worldwide: days since 1 Jan 2026 UTC, modulo the active list. Hide from the card ⋯ or Profile → Appearance. If an older `quotes` seed has fewer than 100 rows, the app uses the bundled list. SQL already on disk: `supabase/learn_n6.sql`, `supabase/quotes_n7.sql` (not confirmed run; no new migration). Logger, progression and swaps were not changed. Did not add a library.
- [x] **29. X6** Refer a friend (7 Nov 2026). Personal invite code and `womensstrength://r/{code}` link. Friend: Apple Offer Code `FRIEND14` (14 days free on annual, new subscribers, does not stack with the 7-day intro). Referrer: 30-day Apple renewal extension if she has a paid sub, otherwise a 1-month RevenueCat promotional entitlement; cap 2 a year; queued while she is still in her own trial. Screen from DESIGN 8.7. Home banner, locked home, Profile, post-session dialog and completion card all open `/refer`. Copy from `content/microcopy` `strings.refer` and `content/referrals/offers.json`. SQL: `supabase/referrals_x6.sql` (not run). **Apple Store Connect offer code, iOS redeem-sheet testing, and `REVENUECAT_SECRET_API_KEY` are deferred** until Sacha has an iPhone (7 Nov 2026). The Refer screen, codes and share still work. No clipboard library. Logger progression and swaps were not changed. Did not add a library.

### Launch checkpoint
- [ ] **30. TestFlight** with EAS. Not started.
- [ ] **31. Sandbox** subscription states. Not started.
- [ ] **32. Store readiness.** Not started. Draft listing is `content/app-store/listing.md` (gym-first: name and subtitle already say gym; keywords omit home workout / home gym). In-app terms and privacy are drafts.
- [ ] **33. S12** Email verification UI and deep link are built. Confirm email is still off in the dashboard.
- [ ] **34. App Store submit.** Not started.

### Stage 6: The complete week
- [ ] **35. W2 + W3** Cardio sessions and player. Not started.
- [ ] **36. W4** Machine guides. Not started.
- [ ] **37. AI1** Scan a machine. Not started.
- [ ] **38. W5 to W7** Recovery days, weekly schedules, weekly ring. Not started.
- [ ] **39. AI5** Monthly recap. Not started.

### Stage 7: Food
- [ ] **40. F1** Food tab and new navigation. Not started.
- [ ] **41. F2 + F3 + X7** Recipes. Not started. Nutrition stays hidden until `nutrition_calc.py` fills it.
- [ ] **42. F4 to F6** Suggestions, favourites, shopping list, fuelling articles. Not started.
- [ ] **43. AI6** What can I cook? Not started.

### Stage 8: The rest of Ascenda AI
- [ ] **44. AI2** Busy gym fix. Not started.
- [ ] **45. AI3** Build me a session. Not started. Do not use WorkoutX's generator.
- [ ] **46. AI4** Ask Ascenda. Not started.
- [ ] **47. AI7** AI messaging and fair-use limits. Not started.

After launch, not in this build: price experiments, Gym buddy.

### MuscleWiki to retire (do not drop columns yet)

No Edge Functions and no app reads. These files exist:

- `supabase/musclewiki.sql` adds `exercises.musclewiki_id`, `mw_video_urls`, `mw_cached_at`
- `supabase/musclewiki_ids.sql` sets 55 approved ids
- `scripts/match-musclewiki.mjs`, `scripts/apply-musclewiki-ids.mjs`, `scripts/musclewiki-matches.csv`

M1 added `exercises.workoutx_id` and `media_usage` in `supabase/workoutx_m1.sql` (not run). `getExerciseMedia()` uses that id through the Edge Function. MuscleWiki columns and match files stay until a later drop is confirmed. Do not delete them yet.

### Decisions for this phase

- Hard paywall, one entitlement `ascenda_pro`. S1, S3 and C2 are skipped from here (S1 and S3 already exist and come out in P1).
- Weekly target Y = onboarding days per week. Strength, cardio, and a stretch or recovery session of 10+ minutes all count. One session counts the week. Hitting Y is a gold week.
- Rest weeks stay (H1): one per 4 counted weeks, bank up to 2.
- Exercise media is WorkoutX, only through `getExerciseMedia()`.
- Ask before adding any library.
- `/content` is used as written. Do not rewrite it or hard-code it.

---

### Known bugs or issues

- First `challenges_h8.sql` paste failed. Rewritten file in this commit; not confirmed run.
- Many later SQL files are **not confirmed run** (see Setup). App usually degrades: empty lists or an on-device fallback.
- Expo Go’s grey floating menu cannot be hidden from app code.
- `one-spot-6` and `one-spot-2` are two different plans; both still show.
- Old programme tables still exist; Profile UI hidden; `/programme` redirects to Programmes.
- Dark theme does not restyle sign-in, paywall, workouts, paths, challenges or exercise detail. Stretch detail and player now follow the theme.
- M1 WorkoutX account deferred. Play buttons hidden. Photos and equipment icons until Sacha signs up, runs the match script, pastes SQL and deploys `exercise-media`.
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
- N3/X4: timer starts on first ticked set or Start timer. Chevron-down minimises (bar on every tab). End session with no ticks discards with no prompt. Rep targets editable for today. Add exercise is on routine sessions (today only). Weighted sets still need a weight. Suggested-weight chips follow the progression rule for everyone after P1. Reorder is long-press then arrows; no drag library until asked.
- G2: warm-up/cool-down templates are bundled from `/content`. Skip is local to the session and is not a logged session. Ramp-up uses set numbers 0 and -1 so working set 1 still drives progression. Did not add a library.
- M1: WorkoutX terms followed from their public docs (AGENTS still has the paste placeholder): store ids not URLs; reuse signed links in memory until they expire (~24h); do not download or re-host files; key only in the Edge Function secret (`X-WorkoutX-Key` header). No on-screen attribution in their API docs. Monthly views depend on the plan; `media_usage` stores integer headers only. Added `expo-video` for tap-to-play. Sacha deferred WorkoutX sign-up on 6 Nov 2026; play UI stays off until matches exist. Swap engine and double-progression unchanged.
- N1 disclaimer is international v2 (doctor, local emergency number). Body stays in `src/lib/disclaimer.ts`; bump `DISCLAIMER_VERSION` when it changes. Surrounding strings from microcopy (safety). Safety after 18+, before goals. First-session sheet uses the 4 AGENTS bullets (no GP) and microcopy "Got it". Footer only on routine detail and Learn articles. No extra font for “Train safely”.
- N4 keeps `goal` / `main_goal` columns; `main_goals` is source of truth. Goal ids match `content/onboarding` (`build_strength`, `lose_body_fat`, …). Old saved ids are mapped when read. Lose body fat is allowed; no calorie/diet response.
- H1: Y is onboarding days-per-week. Rest weeks are gone. Repair = `max(Y, 1) + 1` sessions the following week. Copy from microcopy streak. `accentSoft` added to the theme.
- H2 trigger is a full calendar week with no finished session, not rest-week status. Lighter session: drop a set only if there are 3 or more (never go below 2 working sets) and last weight × 0.9 to 0.5 kg.
- H3 reuses `expo-notifications`. Time picker is hourly chips. Reminders default off. Offers and news never send a push.
- H5: `posthog-react-native`, EU host, `EXPO_PUBLIC_POSTHOG_API_KEY` (`phc_…`) + `EXPO_PUBLIC_POSTHOG_HOST`. No PostHogProvider / session replay. `set_ticked` has no weight/reps/exercise id. `trial_converted` only if this account already started a trial. AI helpers are named; call sites wait for v2.5. `rest_week_used` is unused. Dashboards are created in the PostHog EU UI, not in the app (steps on Roadmap item 24).
- H6: definitions bundled from `/content`. Earned state is computed from history, plus mapped `milestones` / `user_achievements` so older ids survive. Gold week follows H1 (hit Y), not "every planned session". Cardio badges wait for W2. Repeatable badges show xN. Tier rings stay D7. SQL `achievements_h6.sql` is not run until Sacha pastes it.
- H7: photos off even if files exist. Consent screen once per device from microcopy. Turning off hides the card, does not delete. After P1 there is no Pro card; photos show if she has switched them on. Delete account is in Profile → Privacy (D8).
- P1: `useSubscription().isPro` means she has the `ascenda_pro` entitlement (trial, paid or billing grace). Status is `none` | `trial` | `active` | `grace` | `expired`. Starting or resuming a session without that entitlement opens the paywall. Onboarding always presents the paywall unless she already has access. Until the webhook writes a `subscriptions` row, RLS treats her as not entitled (week 1 overview still readable; `/content` overlay may still fill later weeks on device). Tester insert is commented at the bottom of `supabase/subscriptions_p1.sql`. Dev override storage key is `dev-access-override` so an old "Subscribed" flag is ignored. Did not add a library.
- C3: Close on the paywall always goes to locked home (tabs stay; overlay on every tab). Refer-a-friend on locked home opens `/refer` (X6). History is a read-only stack screen. Hero photo uses slug `hero-paywall`. It stays a placeholder until that slug is ready. SQL: `supabase/images_manifest.sql` (not run).
- H8: personal window on join (next Monday and next 1st only). Catalogue has no start_date. Weekly missions from `/content`. Catch-up repeats a missed week up to twice, then ends quietly. One at a time. No participant counts. Joins save on-device if SQL is missing.
- X2: Home sections hide when empty. Welcome-back is the hero state. Refer banner opens `/refer` (X6). Week share is native text (numbers only); no view-shot library. Meals strip waits for Food. Home hero slug is `hero-home-morning`, `hero-home-evening`, `hero-home-rest-day`, `hero-home-done` or `hero-welcome-back`. No bundled photo.
- X6: Friend 14-day trial is Apple Offer Code `FRIEND14` on `ascenda_annual` (Free, 2 weeks, new subscribers, do not stack with the 7-day intro). Personal Ascenda codes are 6 characters and live on `profiles.referral_code`. Referrer reward is Apple Extend Renewal Date by 30 days (`extend_reason_code` 1) when she has a paid Apple sub and `original_transaction_id`; otherwise a 1-month RevenueCat promotional entitlement. Cap 2 rewards a year. Queue while her own status is trial. Share uses the native share sheet (no clipboard library). Invite link is `womensstrength://r/{code}`. Did not add a library. **Deferred until Sacha has an iPhone (7 Nov 2026):** App Store Connect Offer Code `FRIEND14`, testing Apple redeem, setting `REVENUECAT_SECRET_API_KEY`, and redeploying the webhook for paid-renewal extensions. Do not block other work on this. The in-app Refer screen does not need an iPhone.
- X3: singles are bundled, not a table. Start as `sessions.source = custom` with no `custom_workout_id`; the logger reads the on-device plan. Build my plan is `/onboarding?rebuild=1` using `recommendPlan` / `RECOMMEND_RULES`. No Popular carousel. Coach reviewed only when `reviewed_by` is set. Home singles only under "Days you can't get to the gym". No new SQL.
- Primary buttons are plum. Coral is highlights only. Unrestyled screens stay cream until their design pass.
- Export is Excel `.xlsx`, not CSV. UK spelling. No em dashes in user-facing copy.
- Do not use native `Switch` under the pill tab bar; do not use `Modal` + `borderRadius: 999` for tall menus.
- D3: quotes stay bundled until N7 (`quotes` table). Same quote worldwide by UTC date. Challenge card stays on Home after the quote. Display serif is now Fraunces (typography pass, 4 Nov 2026).
- Typography: Fraunces 400 (and 400 italic on the quote card) for display / displaySm. Manrope 400–800 for everything else. Each weight is its own `fontFamily`; do not set `fontWeight`. `AppText` is the shared text component. TextInput uses `type` tokens (kg/reps use bodyStrong plus tabular numbers). Native stack headers use `fonts.bold`. Chart axis labels are SVG Text at caption size with Manrope Medium. Screen titles (Programmes, Planner, Activity, Profile) are title1; Home greeting, Learn title, heroes, onboarding, paywall, completion use display. Small week-ring centres stay caption so they fit. Fonts load in `FontGate` before the tree renders. No new SQL.
- N7: 90 original quotes, attribution “Ascenda” only. Database rows win when `quotes` is seeded; otherwise the bundled list. Index is UTC day modulo list length so everyone sees the same quote. No song lyrics, no body or weight-loss copy. `quotes_n7.sql` is idempotent.
- D4: no new SQL. N2 copy blocks (who it's for, by the end, why this split, phases, roles) come from `/content` overlay. Related Learn cards wait for N6. Skip on the last hold ends that hold; Finish saves. Pause is primary during a hold; Next hold / Finish after the ring completes.
- D5: empty days have no extra row; tap the + (or the header) to add. Rest days still show a thin “Rest day” line. Rest week banner sits in the agenda at the first visible day of that week; month view keeps it under the week strip. No SQL.
- D7: one icon per family (not per badge). First-time and gym “first equipment” badges have no tier ring. Numbered families use bronze → platinum. Locked sheet copy is “This one is still ahead.” No SQL.
- D6: “2+ weeks of data” means two weeks that actually have a session, not two empty calendar weeks. Weight chart needs two logged points on the selected lift. Full roadmap stays on the routine page. Gentle streak copy only when the current run is 0. No SQL.
- D8: missing onboarding name shows “You”, not the email prefix. Avatar initials still use the email if there is no name. Units convert at display only; sets stay in kg. Rest timer default fills in when a set has no prescribed rest (custom workouts); routine rest times stay as written. Terms/privacy are draft in-app copy, not live web pages. Contact mailto is `hello@ascenda.app` until a real address exists. App version is in About and again under Sign out for the hidden tester gesture.
- D9 is DESIGN.md 6.7 (Programmes exercises list), not 6.9 (Activity). Icons use MaterialCommunityIcons from the existing `@expo/vector-icons` package so dumbbell, kettlebell and barbell actually look different. Cable uses the stretch sage teal; band uses the custom ochre. Only ~14 exercises have photos; the rest show the equipment icon. Exercise media (WorkoutX) thumbnails stay with M1 (revised).
- N2: overlay fills empty coaching fields from `/content` (15 slugs) then `src/lib/routineStandard.ts` (old 14 ids); a pasted `n2_routines.sql` value wins. Lighter weeks are labelled only (sets are not auto-reduced; coach review). Swap engine prefers `content/exercise-guides` `if_its_taken.swaps`, then slot `alternative_exercise_ids`, then same-muscle ranking. Custom workouts have no Today / warm-up card. Stretch rows stay null. Existing enrolments and session history are not relinked.
- N6: 34 articles bundled from `content/learn/articles.json`. Categories from that file (`how_programmes_work` and `recovery_and_sleep` map to the existing `programmes` / `recovery` checks). Recommended for you uses `recommended_for_goals`. Related links use `related_routines` and `related_exercises`. Mark as read stays on-device if `learn_n6.sql` is missing. Coach and dietitian review still needed before launch (`reviewed_by` is null). No calorie or macro targets. No new SQL.
- N7: 100 original quotes bundled from `content/quotes/quotes.json`, attribution Ascenda only. Index is UTC days since 1 Jan 2026 modulo the active list. Hide quote is Profile → Appearance and the card ⋯. An older 90-row `quotes` seed is ignored until a live sync writes all 100. `quotes_n7.sql` is unchanged; do not re-paste unless you want the old 90 in the table.
- X6: Offer constants from `content/referrals/offers.json`. Microcopy `strings.refer`. Screen `/refer`, deep link `/r/[code]`. `referrals` table is user data, not content:sync. Hero slug `hero-refer`. Placeholder until that slug is ready. Redeploy `revenuecat-webhook` after pasting SQL. Apple offer setup waits until there is an iPhone.

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

**Content sync (dry-run, writes nothing):** `npm.cmd run content:sync -- --dry-run`

**Start the app (Windows, one terminal):**
`$env:NODE_OPTIONS="--use-system-ca"; npx.cmd expo start --clear`
Scan the QR with Expo Go. Use `--tunnel` if needed. After the typography pass, `--clear` is needed so the new fonts load. Checks: `npx.cmd tsc --noEmit`.

**SQL already run (confirmed):** `exercises.sql`, `profiles.sql`, `programmes.sql`, `sessions.sql`. User also reported (24 Oct) `routines.sql` and `planned_sessions.sql` pasted.

**SQL to paste (not confirmed; app usually still opens):**
`zones.sql`, `onboarding_v1_1.sql`, `quiet_mode.sql`, `level_up.sql`, `custom_workouts.sql`, `blocks.sql`, `remove_cycle_notes.sql`, `activity.sql`, `onboarding_v2.sql`, `routine_covers.sql`, `exercise_media.sql`, `remove_rest_passes.sql`, `stretches.sql`, `paths.sql`, `s10_routines.sql`, `s11_copy.sql`, then v2.2: `theme_preference.sql`, `disclaimer.sql`, `main_goals.sql`, `streak_h1.sql`, `reminders.sql`, `achievements_h6.sql`, `photos_h7.sql`, `challenges_h8.sql` (rewritten; paste the whole file), `d2_covers.sql`, `quotes_d3.sql` (optional if you paste `quotes_n7.sql`), `profile_d8.sql`, `n2_routines.sql`, `learn_n6.sql`, **`quotes_n7.sql`**, **`images_manifest.sql`**, **`gym_experience_g1.sql`**, **`routines_is_active.sql`**, **`session_blocks_w1.sql`**, **`content_routines_1.sql`**, then **`content_routines_2.sql`**, then **`content_routines_3.sql`** (needed for today's sessions on the new plans; paste one file at a time), **`subscriptions_p1.sql`**, **`onboarding_x5.sql`**, **`referrals_x6.sql`**. Do not run `cycle.sql`. `routines_is_active.sql` only adds the column (default true). It does not hide any routine. `session_blocks_w1.sql` does not delete sessions or change the exercise list. `content_routines.sql` does not delete the old 14 routine ids or any workout history. `referrals_x6.sql` does not touch sessions or sets.

Agents cannot run SQL. Sacha pastes into Supabase > SQL Editor. Files are idempotent; the editor’s “destructive operations” warning is expected.

**Dashboard still needed:** Authentication → Email → Confirm email off until testers. RevenueCat products `ascenda_annual` and `ascenda_monthly`, entitlement `ascenda_pro`, webhook to `revenuecat-webhook`. PostHog dashboards: follow Roadmap item 24 (Activation, Retention, Comeback, Routines, Trial to paid, AI). Create them at `https://eu.posthog.com` on the Ascenda project. The app only sends events.

**Deferred until Sacha has an iPhone (X6 store side, 7 Nov 2026). Do not do this now:**
- App Store Connect → Subscriptions → `ascenda_annual` → Offer Codes → custom code `FRIEND14` (Free, 2 weeks, new subscribers only, do not stack with the 7-day intro)
- Edge Function secret `REVENUECAT_SECRET_API_KEY` (v1 `sk_...`) and a webhook redeploy, so paid referrers can get a 30-day Apple renewal extension
- Testing Apple’s redeem sheet and the 14-day friend trial on a real iPhone / TestFlight build

**Sandbox subscription testing (C3 and C1).** Expo Go uses `EXPO_PUBLIC_REVENUECAT_TEST_KEY`. A development build uses the iOS/Android store keys. After a purchase or restore, the RevenueCat listener updates Home instantly (no restart). Billing pushes are scheduled only if notification permission is already on (turn on session reminders first, or use the Developer test rows). Expo Go often cannot show scheduled local notifications; use a development build for the push check.

Real Test Store / sandbox:
- **No subscription:** signed-in, onboarded, never purchased. Every tab shows locked home. Close on the paywall returns here, not a second paywall. Profile, Refer, Terms, Privacy and How to cancel still open.
- **Trial:** buy **Annual** (7-day intro). Home, logger and tabs unlock. Profile chip is “Trial · ends …”. A trial-ending push is scheduled for 2 days before conversion.
- **Trial ending:** wait until 2 days before the trial ends, or use the Dev override. Home shows a coral-wash banner with Manage; it can be dismissed. No countdown.
- **Active:** after the trial converts, or buy **Monthly**. Profile chip is “Active · renews …”. Annual plans also get a Home banner and a push 7 days before renewal.
- **Grace:** a billing issue on a still-active entitlement. Home shows the payment-problem banner. Access stays on. Use the Dev override if the Test Store cannot fake this.
- **Expired:** lapse or cancel and let the period end. Locked home again. Profile → Manage subscription still opens Apple settings in one tap. If she has finished sessions it is the Welcome back layout with stats, See your history (read-only) and Export. History is never deleted.

Dev tools (long-press Profile → Version, then Developer → Testing as). Tap to cycle:
1. Real status
2. No subscription (`none`, locked home)
3. Subscribed (`active`)
4. Trial ending in 2 days (`trial`, banner)
5. Billing grace period (`grace`, banner, still unlocked)
6. Expired (lapsed) (`expired`, locked home; Welcome back only if this account has sessions)
7. Annual renews in 6 days (`active`, renewal banner)

Developer also has **Send a test trial-ending reminder** and **Send a test renewal reminder** (about 8 seconds, needs notification permission).
