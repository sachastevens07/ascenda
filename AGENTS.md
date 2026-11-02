# Project brief: Women's Strength App (working name: Ascenda, not final)

## What we're building
A strength-training app for women that feels lively, clear and encouraging. She picks (or is recommended) a routine with a clear finish line, sees exactly what's planned each day, logs sessions in seconds, and watches her progress and achievements build up.

**Positioning: the gym, made less intimidating.** Many target users feel anxious in the gym. Instead of abstract "confidence levels", the app makes gym confidence concrete and measurable:
- routines tagged "one spot", "minimal equipment", "beginner-friendly", "busy gym friendly";
- "first time" guides for each exercise (where to find it, how to set it up, what to do if it's taken, quick swap);
- "Gym unlocked" progress: how many pieces of equipment and exercises she's tried, with first-time badges;
- a flagship routine, "Gym Confidence: 6 weeks", that starts with one-spot dumbbell sessions and gradually adds machines and free weights.

Target user: women aged 18–40 who lift or want to start, training 2–4 times a week. Tone is calm, warm and empowering. Never shaming, never weight-loss pressure, no "bikini body" language.

## Free vs Pro (target business model)
- **Free:** logging, full history, export, exercise library, up to 4 custom workouts (duplicates count towards the 4), 2 starter routines (including "Gym Confidence: 6 weeks") fully viewable, a few free stretch routines, the planner, activity stats header, weekly sessions count, weekly streak, basic achievements and post-session wins.
- **Pro (£7.99/mo or £59.99/yr, 7-day trial, annual pre-selected):** all routines and stretch routines, programme paths, checkpoint weeks, completion rewards, challenges, the personalised routine recommendation, unlimited custom workouts, full progress charts, routine roadmap and end-of-routine review, progress photos, all achievements. Later: scoped AI features, then recipes.
- **Pro routines on the free plan:** she can open them and see the cover, description, tags, plan details and week 1. Weeks 2 onwards are blurred with an "Unlock with Pro" button. She cannot start, duplicate or copy a Pro routine.
- Every Pro feature shows the same clear Pro badge (see Design direction).
- The paywall appears straight after onboarding, when her recommended routine is revealed. Logging stays free forever.

## Tech stack (do not change without asking)
- Expo (React Native) with TypeScript and Expo Router
- Supabase: Postgres, auth (email + Sign in with Apple), storage (including a PRIVATE bucket for progress photos), Edge Functions. UK or EU region.
- RevenueCat: subscriptions, free trial, paywall
- PostHog: analytics (onboarding completion → paywall view → trial start → first session → D1/D7/D30)
- AI (later phase only): Claude API called ONLY from a Supabase Edge Function. Default model Claude Haiku 5.5. API key is an Edge Function secret.
- Target iOS first; keep code Android-compatible

## Build status

### ALREADY BUILT
**v1.0:** app shell (Today, Progress, Library, Profile tabs), email auth, exercise library, onboarding quiz, three programme templates, Today screen, logger with pre-filled weights and rest timer, double-progression rule, swap button, progress screen, CSV export, cycle notes, RevenueCat paywall (old split).
**v1.1:** zone tags (1–4) on exercises, onboarding 18+ check / no height / optional bodyweight, level-filtered programmes and Quiet Mode toggle, zone-aware swaps with "Try something new", level-up moments and `confidence_history`, confidence section on progress screen, paywall tweak for Level 1.

Several of these are now being REMOVED or REPLACED (see phase v2.0). Read the existing code before changing anything. Keep the logger, rest timer, pre-filled weights, progression rule, swap engine, export, auth and exercise library — they are the core and must keep working.

NOT built (from old plans, now folded into v2.0): custom workout builder, 8-week blocks, roadmap, milestones, block review.

### Phase v2.0 — redesign (CURRENT)
Build in this order, one task at a time. Each task modifies existing code where possible.

**R1. Remove cycle notes**
- Remove all cycle-notes UI, consent screens and code paths.
- Write a migration that deletes existing cycle-note data and drops the related columns/tables. Show it to me before running.
- Remove cycle-notes wording from any privacy text in the app.

**R2. New navigation**
- Tabs become: **Home, Planner, Activity, Profile**.
- The Library tab is removed; the library is opened from a small "Exercise library" button on Home (and from inside the custom workout builder).
- The old Today tab is replaced by Home (R4).

**R3. Routines (data and content)**
- A routine = a named plan with: cover image, short description, tags, goal, length in weeks, days per week, difficulty, equipment needed, and a week → day → exercises structure (sets, rep range, rest).
- Tags examples: "beginner-friendly", "one spot", "minimal equipment", "busy gym friendly", "build muscle", "glutes & legs", "full body", "joint friendly", "lose fat". Keep tags honest; nothing medical.
- Convert the three existing programme templates into routines (keep their data and any users' history linked).
- Add new routines so there are 6 in total at launch, including the flagship "Gym Confidence: 6 weeks" (weeks 1–2 one-spot dumbbell sessions, weeks 3–4 add machines, weeks 5–6 add free-weight basics). Store routines as data so I can add more later without code changes.
- Each routine is marked free or Pro. Free: "Gym Confidence: 6 weeks" plus one other beginner routine.
- When a user starts a routine, create an enrolment (reuse or replace the planned `blocks` concept): start date, current week, sessions completed, status.
- Use the existing double-progression rule for suggested weights in every routine.
- All routine content will be reviewed by a qualified coach before launch; write it conservatively.

**R4. Home screen, routine detail and session detail**
- **Top of Home:** "Featured for you" — a horizontal row of 3–5 routine cards with photos, tailored to her onboarding answers (goal, experience, equipment, days per week, gym comfort). "View all" opens the full routine list with filters by tag.
- **Routine detail page:** large cover photo at top; quick description; tags as chips; plan details (length, days/week, session length, equipment, difficulty); then a week-by-week plan where each week expands to show its days, and each day expands to show its exercises. "Start routine" button (or paywall if Pro and she's free).
- **Next session card on Home:** shows the next planned session's name, day and estimated time. Tapping it opens the **session detail screen**, which lists all exercises; from there she can swap or remove exercises, change sets/reps for today, choose "Do a different day" (pick another day from the current week), then tap "Start session" to open the existing logger.
- Small "Exercise library" button on Home.
- If she has no active routine, Home shows the featured routines and a "Create a workout" option instead of a next-session card.

**R5. Custom workout builder**
- "Create workout": name it, add exercises from the library (search and filter by muscle, equipment and tags like "one spot"), set sets and rep range per exercise, reorder, save.
- "My workouts" list: start, edit, duplicate, delete, and add to the planner.
- Free users can create up to 4 custom workouts. Trying to create a 5th shows the paywall. Pro is unlimited. Existing workouts are never deleted if a subscription lapses; they just can't create more beyond 4.
- Logging uses the existing logger, rest timer, pre-filled weights and swap button.

**R6. Planner tab**
- A weekly view (Mon–Sun) showing which workout is planned for each day, generated from her active routine's days-per-week, with custom workouts addable to any day.
- She can drag or tap to move a planned session to another day, mark a rest day, or add a custom workout.
- Completed sessions show a tick; today is highlighted.
- Planned sessions feed the weekly "X of Y" count in Activity.

**R7. Replace confidence levels with "Gym unlocked"**
- Remove level gating, the Quiet Mode toggle, level-up prompts and the confidence section. Don't drop `confidence_history` data or the `zone` column; just stop using levels in the UI. Zones can still power the "one spot" style tags and swap suggestions.
- Add "first time" guides to each exercise detail: where to find it (existing location hint), setup steps, form cues, "if it's taken" swap suggestions.
- Track "Gym unlocked" stats from logged sets: number of distinct exercises tried and distinct equipment types used. Show these in Activity → Achievements with first-time badges (first machine, first barbell lift, first cable exercise, etc.).

**R8. Activity tab (replaces Progress)**
- **Header (always visible):** total sessions completed, total lifts tracked (total logged sets of weighted exercises — confirm definition with me), total time spent working out.
  - Time format: under 10 hours → 2 decimal places (e.g. 3.25 h); 10 to under 100 hours → 1 decimal place (e.g. 42.7 h); 100 hours and over → nearest whole hour (e.g. 128 h).
  - Below that: "This week: X of Y workouts", where Y comes from the planner. Hide if nothing is planned.
  - **Weekly streak:** consecutive weeks where she hit her weekly target, shown as a progress bar towards the streak goal she set in onboarding (e.g. "5 of 8 weeks"). Give one "rest week" pass per calendar month that keeps the streak alive. Gentle copy only; no guilt when a streak resets.
- **Two sub-tabs: Progress and Achievements.**
  - **Progress:** personal bests, weight over time per lift (Pro), routine progress and roadmap for the active routine (Pro), end-of-routine review when a routine finishes (Pro), progress photos (Pro).
  - **Progress photos:** opt-in; upload from camera or library; stored in a PRIVATE Supabase bucket with signed URLs; never sent to AI; hidden behind a tap ("Show photos"); easy delete (single and all); side-by-side compare of two dates. Ask for photo permission only when she first uses this feature.
  - **Achievements:** milestone badges (first session, first full week, 5/10/25/50 sessions, first personal best, routine completed, streak milestones) and "Gym unlocked" badges from R7. Locked badges shown greyed out.
- Post-session wins: after finishing any session, show 1–3 short wins ("+2.5 kg on hip thrust since week 1", "New personal best", "First time on the leg press!").

**R9. Onboarding overhaul**
- Inspired by the structure of big women's fitness apps (short single-question screens, progress bar, personalisation, plan reveal) but NOT their weight-loss or body-shaming framing.
- Target 15–20 quick screens. Suggested order: welcome → 18+ confirmation → main goal → experience → where she trains (gym/home/both) → equipment available → how she feels in the gym (comfort, used to tailor routines and tags) → days per week → session length → focus areas → weekly streak goal (e.g. 4, 8 or 12 weeks) → optional bodyweight (skippable, no height, no BMI) → name.
- Between some questions, show short encouraging "insight" screens (e.g. "Most women who start with one-spot sessions are using the whole gym within 6 weeks" — only use claims we can support; otherwise keep it general).
- Plan reveal: "Your plan is ready" with the recommended routine (cover photo, name, why it was chosen based on her answers) and a simple chart of projected strength progress for one key lift using the progression rule (label it as an estimate).
- Then the paywall (R10). Whether she subscribes or not, route her straight into her first session or the free starter routine.
- Ask for notification permission after she completes her first session, not during onboarding.
- Replace the old onboarding; migrate existing users' answers where fields match.

**R10. Paywall update**
- Implement the Free vs Pro split above.
- Main paywall right after the onboarding plan reveal: 7-day trial, annual pre-selected, monthly shown alongside, clear cancel info.
- Contextual paywalls: starting a Pro routine, creating a 5th custom workout, opening Pro charts, roadmap or progress photos.
- Existing Pro subscribers keep everything.
- Keep entitlements simple so AI and recipes can be added to Pro later.

**R11. Photos and visual polish**
- Every routine card and routine detail page has a cover photo; Home should feel full and lively.
- Use licensed stock photos (Pexels/Unsplash — confirm the licence allows commercial app use) or AI-generated images for routine covers. Avoid AI-generated images of women's bodies; prefer real stock photography for people.
- NEVER use AI-generated images for exercise demonstrations; keep the licensed exercise media.
- Keep a consistent visual style (lighting, colour grading). Compress images and serve from Supabase storage; use placeholders while loading.
- Add a simple `images` reference so photos can be swapped without code changes.

**M1. MuscleWiki exercise videos (female model)**
- Exercise demos come from the MuscleWiki API (stream-only). Rules: API key only as a Supabase Edge Function secret (`MUSCLEWIKI_API_KEY`), never in the app or `.env`; never download or cache video files; exercise text/metadata may be cached for up to 30 days; use the video URLs the API returns; the app plays `<video_url>?token=<media token>` minted by our Edge Function (one token per session); never log video URLs or tokens.
- Pieces: `exercises.musclewiki_id`, `mw_video_urls`, `mw_cached_at`; a one-off match script (reviewed by me); Edge Functions `mw-exercise` and `mw-media-token` (authenticated, rate-limited); tap-to-play thumbnail with front/side toggle, no autoplay, fallback to text cues on any error including 429.
- This needs the Supabase CLI and a `supabase/functions` folder, which don't exist yet; set them up when starting this task.

Milestone: TestFlight with 15–20 testers after R10, before any later phase.

### Phase v2.1 — programmes and polish (NEXT, after v2.0 is complete)
Build in this order, one task at a time. If any v2.0 task (R1–R11) or the MuscleWiki video task is unfinished, tell me before starting v2.1.

**S1. Fix the duplicate loophole**
- Duplicating a routine or a custom workout creates a custom workout, so it counts towards the free limit of 4.
- A free user attempting a 5th custom workout by any route (create, duplicate, save-from-routine) sees the paywall.
- Free users cannot duplicate Pro routines at all.

**S2. Navigation: new Programmes tab**
- Tabs become: **Home, Programmes, Planner, Activity, Profile**.
- Programmes has three sections (segmented control at the top): **Routines**, **Stretches**, **Exercises** (the exercise library moves here; remove the library button from Home).
- Remove the current plan banner from the top of Home. The next-session card already shows her active routine.

**S3. Pro badge and locked previews**
- Create one reusable Pro badge component (small gold "PRO" pill, plus a lock icon where something is locked) and use it everywhere a Pro feature appears: routine cards, buttons, charts, screens, tabs within screens.
- Free routines: fully viewable, including every week and day.
- Pro routines for free users: show cover, description, tags, plan details and week 1. Weeks 2 onwards are blurred and non-expandable, with an "Unlock with Pro" button that opens the paywall. "Start routine" and "Duplicate" open the paywall.
- Never send the locked weeks' exercise data to a free user's device; fetch it only for Pro users (enforce in Supabase RLS or the query, not just the UI).

**S4. Change or stop a routine**
- On the active routine's page and in the next-session card's menu: "Switch routine" and "End routine".
- Confirmation sheet explaining that her history and progress are kept.
- Ending marks the enrolment as 'abandoned' (or 'complete' if all sessions are done) and clears planned sessions from that routine going forward.
- Switching ends the current enrolment and starts the new one (paywall if the new one is Pro and she's free).

**S5. Streak changes**
- The weekly streak goal is set in onboarding only. Remove any quick "change goal" button from Activity. Add a small "Edit streak goal" option inside Profile settings.
- Remove rest-week passes entirely. A week only counts if she hits her weekly target.
- A stretch session of 10 minutes or more counts as a session towards the weekly target and streak. It does not count towards strength targets or personal bests.

**S6. Tiered achievements**
- Replace current achievements with tiers (bronze, silver, gold, platinum) where it fits:
  - Sessions completed: 10, 50, 100, 250, 500
  - Weekly streak: 4, 12, 26, 52 weeks
  - Total weight lifted: 10,000 kg, 100,000 kg, 500,000 kg, 1,000,000 kg
  - Personal bests: 10, 50, 100
  - Programmes completed: 1, 3, 10
  - Gym unlocked: 10 exercises, 25 exercises, every equipment type
- Keep a small set of easy "first time" badges (first session, first PB, first machine, first full week) so beginners get early wins.
- Show progress towards the next tier on each badge (e.g. "38 / 50 sessions"). Locked badges are greyed out.
- Migrate existing earned milestones so nobody loses a badge.

**S7. Planner sticky dates and dropdown animations**
- Planner: each day's date header sticks to the top while scrolling through that day's items and is pushed up by the next day's header.
- Dropdown menus: open as an animated menu anchored to the button that was tapped (dropping down from it), not a bottom sheet. Use the animation library already in the project; ask before adding a new one.

**S8. Stretches**
- Stretch routines stored as data like routines (same tables or a `type` field: 'strength' | 'stretch').
- 5–20 minute sessions, organised by area and occasion (e.g. full body, hips, lower back, post-leg day, desk stretch, morning mobility).
- Timed holds rather than sets and reps: each step has duration_seconds and a demo (MuscleWiki where available; check coverage first and list any gaps).
- Logged as sessions with source 'stretch' and duration, counting towards the streak per S5.
- 6–8 stretch routines at launch; 2–3 free, the rest Pro.

**S9. Programme paths, checkpoint weeks and completion rewards**
- **Paths:** ordered sequences of routines shown as a visual map, e.g. Gym Confidence → Strength Foundations → Glute Builder → Strong & Lean. Completing one marks it done on the map and recommends the next. Paths are Pro (the first routine of a path can be free).
- **Checkpoint weeks:** routines can mark checkpoint weeks (e.g. weeks 4 and 8) where 2–3 key lifts are re-tested. Show start vs now: "Goblet squat: 10 kg → 16 kg".
- **Completion rewards:** badge, end-of-programme review (start vs end lifts, sessions, PBs, time trained) and a shareable completion card image (no faces, no body data, just numbers and the routine name).
- **Challenges:** time-limited 4-week challenges with fixed start and end dates (e.g. "New Year, Quiet Start" starting in January). Join button, countdown, progress ring. Only show participant counts if they are real.
- **Progress rings:** each routine card shows completion; Home shows this week's progress ring.
- **Progress photo prompts (Pro, opt-in):** gently offer a photo at the start and end of a programme for a side-by-side comparison. Never pushy; easy to dismiss permanently.

**S10. Routine content: grow to 12–15 routines**
- Add routines as data until there are 12–15 strength routines plus the 6–8 stretch routines from S8.
- Cover a range: beginner, gym confidence, glutes & legs, upper body, full body, minimal equipment, 2/3/4 days per week, 4/6/8 weeks.
- Each needs: cover photo, description, tags, week-by-week plan, MuscleWiki video matches, and a coach review before launch.
- Target after launch: add 2–4 routines a month, working towards 30.

**S11. Remove em dashes**
- Replace every em dash (—) in user-facing text across the app with commas, full stops, colons or "to" as appropriate. Check routine and achievement content too.

**S12. Email verification (do last)**
- Turn on Supabase email confirmation for new sign-ups.
- Verification email links open the app (deep link) and complete sign-in.
- Show a friendly "Check your inbox" screen with a resend option. Existing test accounts are unaffected.

Milestone: TestFlight round 2 after S10, then App Store submission (target mid-December).

### Later phases (do not build yet)
**AI (after v2.0 is live and stable)**
- A1. AI workout builder (Pro): picks only from our exercise library, filtered to her equipment and tags; structured JSON; server-side validation; weights from our progression rule; output opens as a custom workout.
- A2. Scoped AI help (Pro): "Ask about this exercise" on each exercise detail, using its stored cues. Never medical, injury, pregnancy or diet advice; pain → stop and see a professional; labelled as AI-generated. An open-ended chatbot is NOT planned.
- A3. Shared rules: Edge Functions only, rate limits (30 questions, 5 builds per day), `ai_usage` logging, prompt caching, coach review before launch, privacy policy update.

**Food (after everything else is built)**
- Deferred. Planned categories (reworded later): strong and nourished, prep-ahead lunch, high-protein dinner, top 10 breakfasts, most-loved smoothies, one pot, busy mums, dinner in 30, prep-ahead breakfast, dinner, snack smarter, family friendly, high protein, lunch, holiday favourites. Recipes in multiple categories; prep time and servings on cards; ingredients, method and macros (calculated from a nutrition database, not guessed) inside; "not health or nutritional advice" disclaimer. Pro perk.

## Out of scope (do not build unless I ask)
Video classes, open-ended AI chatbot, food/recipes (until the food phase), social feed or leaderboards, wearable sync, gym-photo scanning, cycle tracking, BMI or body-fat estimates, deload weeks, XP points or arbitrary user levels, rest-week streak passes.

## Data model
Check the actual schema before changing anything. Existing tables include `profiles`, `exercises` (with `zone`), `programmes` / `programme_days` / `programme_exercises`, `sessions`, `sets`, `confidence_history`, and cycle-notes storage (to be removed in R1).

New or changed in v2.0 (migrations only; never delete user workout history):
- `routines`: id, name, slug, description, cover_image_id, goal, length_weeks, days_per_week, session_minutes, difficulty, equipment, is_pro, is_featured_eligible, sort_order
- `routine_tags`: routine_id, tag
- `routine_weeks`, `routine_days`, `routine_day_exercises` (sets, rep_min, rep_max, rest_seconds, order). Migrate existing programme templates into these.
- `routine_enrolments`: id, user_id, routine_id, start_date, status ('active' | 'complete' | 'abandoned'), completed_at
- `custom_workouts`: id, user_id, name, created_at, updated_at; `custom_workout_exercises`: custom_workout_id, exercise_id, order, sets, rep_min, rep_max
- `planned_sessions`: id, user_id, date, routine_day_id (nullable), custom_workout_id (nullable), status ('planned' | 'done' | 'skipped' | 'rest')
- `sessions` additions: source ('routine' | 'custom'), routine_enrolment_id (nullable), routine_day_id (nullable), custom_workout_id (nullable), duration_seconds. Backfill existing sessions sensibly.
- `milestones`: id, user_id, type, achieved_at, metadata
- `progress_photos`: id, user_id, storage_path, taken_on, created_at (files in a private bucket)
- `images`: id, url/storage_path, alt_text, licence_source
- `profiles` additions: main_goal, training_location, session_minutes, focus_areas, gym_comfort, streak_goal_weeks, rest_passes_used_month (remove in S5)
- Apply Row Level Security to every new table.

New or changed in v2.1:
- `routines` additions: type ('strength' | 'stretch'); `routine_weeks` addition: is_checkpoint (bool); stretch steps use duration_seconds
- `routine_paths`: id, name, description, cover_image_id, is_pro, sort_order; `routine_path_steps`: path_id, routine_id, step_order
- `checkpoint_results`: id, user_id, enrolment_id, exercise_id, week, weight_kg, reps, recorded_at
- `challenges`: id, name, description, cover_image_id, routine_id, start_date, end_date, is_pro; `challenge_participants`: challenge_id, user_id, joined_at, completed_at
- `achievement_definitions`: id, family, tier, threshold, title, description; `user_achievements`: user_id, achievement_id, achieved_at (migrate existing `milestones`)
- `sessions.source` gains 'stretch'

## Design direction
- Lively and visual: photos on routines and Home, generous cards, but still calm and uncluttered.
- Clear hierarchy: one main action per screen (e.g. the next-session card on Home).
- Encouraging copy, never shaming. Celebrate wins and firsts. No weight-loss pressure.
- Always make progress visible: what's planned, what she's done, what she's unlocked.
- Everything in the logger usable one-handed mid-workout.
- Units: kg by default, lbs option in settings. UK spelling.
- Never use em dashes (—) in any user-facing text. Use commas, full stops, colons or "to" instead.
- Pro features always carry the same Pro badge, so it's obvious what's paid.
- Navigation (from v2.1): Home, Programmes (Routines / Stretches / Exercises), Planner, Activity, Profile.

## Working rules for the AI
- Current phase: v2.1 (S1–S12), once v2.0 (R1–R11) and the MuscleWiki video task are confirmed complete. Do not start later phases.
- Read the existing code before changing anything; change only what the current task needs.
- Build ONE task at a time, in order. Stop and tell me how to test it before moving on.
- For any database change, write a migration, explain it, and wait for my confirmation. Never delete users' workout history (sessions and sets).
- Keep it simple. Prefer fewer files and well-known libraries. Ask before adding any new library.
- Never hard-code secrets; use `.env` or Edge Function secrets.
- After each task, list what changed and any manual steps, and re-test the logger, progression rule and swaps if you touched anything near them.
- If something is ambiguous, ask rather than guess.
- Write clear TypeScript types for all data.
- Keep PROGRESS.md up to date after each task, then commit.

## Safety and compliance
- Disclaimer: general fitness guidance, not medical advice; stop if anything hurts.
- Conservative progressions; coach review of all routines before launch.
- 18+ only.
- No BMI, body-fat estimates, health scores or weight-loss promises.
- Progress photos: opt-in, private bucket, signed URLs, never sent to AI, easy to delete.
- Only use images and exercise media licensed for commercial use.
- Privacy policy must reflect current data use (no cycle data; progress photos if used).
