# Project brief: Women's Strength App (working name: Ascenda, not final)

## What we're building
A strength-training app for women that feels lively, clear and encouraging. She picks (or is recommended) a routine with a clear finish line, sees exactly what's planned each day, logs sessions in seconds, and watches her progress and achievements build up.

**Positioning: the gym, made less intimidating.** Many target users feel anxious in the gym. Instead of abstract "confidence levels", the app makes gym confidence concrete and measurable:
- routines tagged "one spot", "minimal equipment", "beginner-friendly", "busy gym friendly";
- "first time" guides for each exercise (where to find it, how to set it up, what to do if it's taken, quick swap);
- "Gym unlocked" progress: how many pieces of equipment and exercises she's tried, with first-time badges;
- a flagship routine, "Gym Confidence: 6 weeks", that starts with one-spot dumbbell sessions and gradually adds machines and free weights.

Target user: women aged 18–40 who lift or want to start, training 2–4 times a week. Tone is calm, warm and empowering. Never shaming, never weight-loss pressure, no "bikini body" language.

## Product vision (decided November 2026)
**Ascenda is the all-in-one gym companion for women, especially those new to the gym or coming back to it.**
One-line pitch: "Ascenda helps women feel at home in the gym: a complete weekly plan of strength, cardio and stretching, guidance for every machine, and food that fuels your training."

**Gym-first.** Every feature is designed for women who train in a gym. Home training exists only as a backup ("Days you can't get to the gym": a few dumbbell or band sessions, plus stretches). No home-specific features. All copy, App Store keywords and Learn content say "gym".

**Four pillars**, each with the gym-confidence angle that sets Ascenda apart from Sweat, EvolveYou and Alive:

| Pillar | What it includes | The Ascenda angle |
|---|---|---|
| Strength (core) | Routines, logger, progression, checkpoints | First-time guides, "if it's taken" swaps, Gym unlocked |
| Cardio | Gym cardio sessions inside routines, cardio logging | Machine guides (how to start, set up and stop each machine), beginner-friendly progressions |
| Stretch and recovery | Warm-ups and cool-downs inside every strength session, recovery days, stretch library | Short, quiet, doable in a corner of the gym |
| Nutrition | Recipes, fuelling guidance linked to training days | "Fuel your training", never "eat less". No calorie targets, no food logging, no weight-loss meal plans |

**A routine is a complete week**, not just lifting days: strength days (with warm-up and cool-down blocks), cardio days or finishers, and recovery days, all shown in the Planner and counted towards the weekly target and streak.

## Pricing and access (decided 4 November 2026: hard paywall)
Ascenda is a **subscription app**. She can download it and complete onboarding for free; using the app's content needs a subscription (free trial included). This replaces the earlier free/Pro split. **Anywhere else in this file that mentions free vs Pro content, Pro badges, locked previews, free limits or "Pro only", read it as: included in the subscription. Where this section and an older task disagree, this section wins.**

**Plans (UK launch prices, set in App Store Connect and RevenueCat):**
| Plan | Price | Trial | Notes |
|---|---|---|---|
| Annual | £59.99/year (shown as "about £5 a month") | 7 days free | Pre-selected; "Most popular" or "Best value" label only if true |
| Monthly | £9.99/month | None | Shown alongside so the annual saving is clear |
- No weekly plans. No lifetime plan at launch.
- Prices can rise as cardio, Food and AI ship (e.g. annual to £79.99). Existing subscribers keep their price (RevenueCat price-change handling); never surprise anyone.
- Later: RevenueCat price experiments (e.g. £49.99 vs £59.99 vs £69.99 a year) once there's enough traffic.

**Without a subscription she can:**
- download, complete onboarding and see her personalised plan reveal (routine, why it suits her, milestone timeline);
- read the safety disclaimer, terms and privacy policy;
- manage her account: sign in and out, restore purchases, delete her account;
- **always see her own data:** if a subscription lapses, her history, PBs and awards stay visible read-only and she can export everything (CSV). Never delete or hide her data because she stopped paying;
- use Refer a friend (share her link and code).

**Everything else needs an active subscription or trial:** Home, routines, stretches, exercises and guides, the logger, Planner, Activity, Learn, cardio, Food, Ascenda AI, reminders and challenges.

**Entitlement:** a single RevenueCat entitlement `ascenda_pro`. Check it in one place (a `useSubscription` hook or similar). No per-feature locks, no Pro badges inside the app, no free limits.

**Referral offer:** an invited friend gets a 14-day free trial instead of 7 (where Apple's offer types allow it); the referrer gets one free month when the friend's paid subscription starts (X6).

**Paywall flow** (C1, C3): onboarding → plan reveal → safety disclaimer → paywall. If she closes the paywall she lands on the "locked home" screen (C3), never on a second pop-up.

## Tech stack (do not change without asking)
- Expo (React Native) with TypeScript and Expo Router
- Supabase: Postgres, auth (email + Sign in with Apple), storage (including a PRIVATE bucket for progress photos), Edge Functions. UK or EU region.
- RevenueCat: subscriptions, free trial, paywall
- PostHog: analytics (onboarding completion → paywall view → trial start → first session → D1/D7/D30)
- AI (phase v2.5): Claude API called ONLY from Supabase Edge Functions. Default model Claude Haiku 5.5 (Claude Sonnet 5.5 where quality needs it). API key is an Edge Function secret.
- Target iOS first; keep code Android-compatible

## Build status

### ALREADY BUILT
**v1.0:** app shell (Today, Progress, Library, Profile tabs), email auth, exercise library, onboarding quiz, three programme templates, Today screen, logger with pre-filled weights and rest timer, double-progression rule, swap button, progress screen, CSV export, cycle notes, RevenueCat paywall (old split).
**v1.1:** zone tags (1–4) on exercises, onboarding 18+ check / no height / optional bodyweight, level-filtered programmes and Quiet Mode toggle, zone-aware swaps with "Try something new", level-up moments and `confidence_history`, confidence section on progress screen, paywall tweak for Level 1.

Several of these are now being REMOVED or REPLACED (see phase v2.0). Read the existing code before changing anything. Keep the logger, rest timer, pre-filled weights, progression rule, swap engine, export, auth and exercise library — they are the core and must keep working.

NOT built (from old plans, now folded into v2.0): custom workout builder, 8-week blocks, roadmap, milestones, block review.

### Phase v2.0 — redesign (mostly built; confirm status in PROGRESS.md)
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
- (Superseded by P1 and C3: hard paywall, see "Pricing and access".)
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

**M1 (revised): WorkoutX exercise media**
- Exercise demo videos and images come from the WorkoutX API, female models where available.
- The API key is a Supabase Edge Function secret (`WORKOUTX_API_KEY`), never in the app or `.env`. The app never calls WorkoutX directly: an authenticated, rate-limited Edge Function returns the media for an exercise.
- All media goes through one provider-agnostic function in the app, `getExerciseMedia(exerciseId)`, so we can change provider later without touching screens.
- Match our exercises (`content/exercises/strength-catalogue.json`) to WorkoutX exercises with a one-off match script. Store the WorkoutX id on each exercise. Show me the unmatched and doubtful matches to review.
- Tap-to-play thumbnail, no autoplay, front and side views if WorkoutX provides them, and a fallback to the text cues in the exercise guide on any error, including rate limits.
- Don't use WorkoutX's AI workout generator: Ascenda's own AI3 builds sessions from our library.
- Never log media URLs or keys. Track media usage so we can see how close we are to the plan's limit.
- WorkoutX terms: [PASTE WHAT WORKOUTX CONFIRMED: caching allowed or not and for how long, attribution required, licence covers commercial app use, monthly media views on my plan]
- This needs the Supabase CLI and a `supabase/functions` folder, which don't exist yet; set them up when starting this task.

Milestone: TestFlight with 15–20 testers after R10, before any later phase.

### Phase v2.1 — programmes and polish
Build in this order, one task at a time. If any v2.0 task (R1–R11) or the exercise media (WorkoutX) task is unfinished, tell me before starting v2.1.

**Superseded by v2.2 (read v2.2 before building these):** S5 streak rules are replaced by H1. S6 achievements are replaced by H6 and D7. The progress photo prompts in S9 are removed (see H7). S9 challenges must use rolling starts (H8). The session detail screen from R4 is removed and merged into the logger (N3).

**S1. Fix the duplicate loophole** (SUPERSEDED by the hard paywall: there are no free limits. Remove any custom workout limit code instead; see P1.)

**S2. Navigation: new Programmes tab**
- Tabs become: **Home, Programmes, Planner, Activity, Profile**.
- Programmes has three sections (segmented control at the top): **Routines**, **Stretches**, **Exercises** (the exercise library moves here; remove the library button from Home).
- Remove the current plan banner from the top of Home. The next-session card already shows her active routine.

**S3. Pro badge and locked previews** (SUPERSEDED by the hard paywall. Remove Pro badges, locked previews and free/Pro routine flags from the UI; see P1. Keep server-side protection of content per P1.)

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
- Timed holds rather than sets and reps: each step has duration_seconds and a demo (exercise media (WorkoutX) where available; check coverage first and list any gaps).
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
- Each needs: cover photo, description, tags, week-by-week plan, exercise media (WorkoutX) matches, and a coach review before launch.
- Target after launch: add 2–4 routines a month, working towards 30.

**S11. Remove em dashes**
- Replace every em dash (—) in user-facing text across the app with commas, full stops, colons or "to" as appropriate. Check routine and achievement content too.

**S12. Email verification (do last)**
- Turn on Supabase email confirmation for new sign-ups.
- Verification email links open the app (deep link) and complete sign-in.
- Show a friendly "Check your inbox" screen with a resend option. Existing test accounts are unaffected.

Milestone: TestFlight round 2 after S10, then App Store submission (target mid-December).

### Phase v2.2 — design pass 2, retention and new features (CURRENT)
Sources: DESIGN.md section 6 (design pass 2), my retention research (summarised in the rules below) and my own change requests.
Before starting: compare PROGRESS.md and the code against v2.0, v2.1 and this list. Mark what's done, what's partly done and what this phase supersedes, then update PROGRESS.md and commit. Then build in the order below, one task per step, stopping after each so I can test on my phone. Ask before adding any library (fonts, notifications).

**Group 1: quick wins**

**D1. Global design fixes** (details in DESIGN.md 6.1)
- Dev gear button: replace the `__DEV__` check with a separate setting `showDevTools`, off by default, toggled by a hidden gesture (e.g. long-press the app version in Profile 5 times). Screenshots from dev builds must look like production.
- One primary button colour everywhere: `brand` (plum). Coral (`accent`) is only for small highlights (streak flame, eyebrows, key numbers).
- Tags in sentence case ("Beginner friendly", not "Beginner-Friendly"); max 2 tags per card, on one line.
- Remove duplicate routines in the list (e.g. "One spot 2 days" appears twice) and any leftover old-programme entries.
- Find and remove all em dashes in UI and content.

**N5. Light theme default, dark theme in settings**
- Default theme is light for everyone, regardless of the phone's setting.
- Profile → Settings → Appearance: Light (default), Dark, Match phone.
- Store the choice on the device (and in `profiles.theme_preference` so it follows her to a new phone). Apply instantly without restart.

**Group 2: the workout flow**

**N3. Merge the pre-workout screen into the logger**
- Remove the session detail screen (the one with sets/reps steppers, swap and remove before starting).
- Tapping the next-session card or "Start session" opens the logger directly.
- Everything that screen did now happens inside the logger, per exercise:
  - swap (existing swap engine), remove, add a set, remove a set, change the rep target via a small "⋯" menu on the exercise card;
  - "Add exercise" button at the end of the list;
  - "Do a different day" in the logger header "⋯" menu (and in the Home card "⋯" menu);
  - changes apply to today only, never to the routine.
- The session timer starts when she ticks her first set (or taps "Start timer"), not when the screen opens, so browsing the session first doesn't distort time trained.
- If she leaves without ticking any set, nothing is saved and no "discard" prompt is needed.
- Logger improvements at the same time (DESIGN.md 6.3): last-time weight shown as placeholder in each kg cell, a suggested-weight chip when the progression rule says go up, bigger tick buttons in `brand` that fill `success` when done, rest timer bar after each ticked set, real exercise thumbnails (exercise media (WorkoutX)) instead of letters.

**N1. Clear safety disclaimer**
- Replace the one-line disclaimer with the full text in the "Safety disclaimer" section below.
- Onboarding: a dedicated screen showing the full text, with a required checkbox "I've read this and I'm 18 or over" before continuing. Store `profiles.disclaimer_version` and `disclaimer_accepted_at`.
- If the disclaimer text changes (new version), show it again once on next open and ask her to accept.
- Profile → About → "Safety and disclaimer": full text.
- Before her first ever session: a one-time sheet with the short version ("Train within your limits" summary, 4 bullets) and a link to the full text.
- Routine detail pages and Learn articles: one small line at the bottom, "Train within your limits. Read the safety guidance", linking to the full text. No disclaimer on other screens.
- I will have the wording checked legally; keep the text in one file so it's easy to update. Write for any country: no GP, 999, solicitor, or other UK-only terms.

**N4. More main goals, choose up to three**
- Onboarding goal screen becomes multi-select chips, up to 3. The first one she picks is her main goal (show a small "Main" label on it; she can change which is main).
- Goal list: Build strength; Build muscle; Glutes and legs; Upper body strength; Feel toned and defined; Gym confidence; Get fitter and improve stamina; Mobility and flexibility; Better posture; More energy; Stress relief and mental wellbeing; Strong for life (bones and joints); Get back into training after a break; Lose body fat.
- "Lose body fat": allowed as a goal, but the app only responds with strength routines and general Learn articles. No calorie targets, no weight-loss promises, no before/after framing.
- Recommendation and "Featured for you" use all chosen goals, weighted towards the main one.
- Profile → Your answers lets her edit goals.
- Migration: `profiles.main_goal` becomes `main_goals text[]` (max 3, order matters); copy existing values across.

**Group 3: habit and retention (from my research)**

Rules for every task in this group:
- Reward showing up and coming back, not volume or perfection.
- Never send or show "you broke your streak" or any guilt copy. Use forward-looking copy ("New week, fresh start").
- Training reminders and promotional messages are separate, separately toggled channels. Promotional pushes need their own opt-in.

**H1. Streak rework** (replaces S5)
- A week counts towards the streak if she does at least one session (strength or a 10+ minute stretch). A week where she hits her full weekly target is shown as a "gold week".
- Planned rest weeks: she earns one rest week for every 4 counted weeks, banking up to 2. She can schedule one in advance in the Planner, or apply one after a missed week (prompted gently on the next Monday). A rest week keeps the streak alive.
- Streak repair: if a week is missed and she has no rest week banked, doing one extra session the following week repairs it.
- Always show "Weeks trained: 23" (lifetime total, never resets) alongside "Current run: 5 weeks", so progress never drops to zero.
- Streak goal (set in onboarding, editable in Profile) is a milestone, not a test. Celebrate reaching it, then offer the next goal.
- Profile setting to hide the streak entirely.
- Data: `profiles.rest_weeks_banked`, a `streak_weeks` table or computed view (week_start, status: 'counted' | 'gold' | 'rest' | 'repaired' | 'missed').
- Note: this replaces my earlier decision to remove rest-week passes, based on the research. Confirm with me before building.

**H2. Welcome-back flow**
- Trigger: she opens the app or finishes a session after missing at least one planned week.
- Home shows a warm "Welcome back" card instead of the usual hero: "Good to see you. Here's a lighter session to ease back in."
- Offer: a shorter version of her next session (fewer sets, suggested weights about 10% lower), or restart the current routine week, or switch to a lighter routine if she's been away 3+ weeks.
- Finishing it earns a "Back on track" badge (repeatable, counts once per return).
- Time re-engagement for fresh starts: Monday, the 1st of the month, start of term.

**H3. Planner-linked reminders**
- Ask for notification permission after her first completed session (already planned), with a short explanation.
- Reminders are tied to sessions she has planned: she picks a time for each planned day (default: same time as her last session, or 6pm).
- At most one reminder per planned day, plus an optional Sunday "Plan your week" summary. Nothing on rest days.
- Copy is autonomy-supportive: "Full body A is ready when you are", never "Don't lose your streak".
- Profile → Notifications: toggles for session reminders, weekly summary, and (separately) offers and news.
- Ask before adding a notifications library (expo-notifications is the likely choice).

**H4. Week-6 hand-off**
- Two weeks before a routine ends, show "What's next" on Home and the routine page: the recommended next routine from her path and goals, with a preview.
- On completion: checkpoint review (start vs end lifts), completion badge and card, then a one-tap "Start [next routine] on Monday".
- Habits take months to form, so this transition must be smooth and never leave her with nothing planned.

**H5. Retention analytics (PostHog)**
- Events: onboarding_completed, disclaimer_accepted, paywall_viewed, trial_started, session_started, session_completed, set_ticked, planned_week_missed, rest_week_used, streak_repaired, welcome_back_shown, welcome_back_completed, reminder_sent, reminder_opened, routine_completed, next_routine_started, learn_article_opened.
- Dashboards: activation (2+ sessions in first 7 days; 3+ in first 14), D1/D7/D30 retention, return rate after first missed week, routine completion rate, trial to paid.
- Never send health data, body photos or free-text to PostHog.

**H6. Achievements rework** (replaces S6)
- Keep easy "first time" badges and Gym unlocked prominent.
- Sessions: 1, 5, 10, 25, 50, 100, 250. Weeks trained (lifetime): 4, 12, 26, 52. Personal bests: 1, 10, 50. Programmes completed: 1, 3, 10.
- Weight lifted: keep only 1,000 kg, 10,000 kg and 50,000 kg as fun milestones. Remove the 100k to 1M tiers (they reward volume).
- Add: "Back on track" (welcome-back session completed), "Gold week" (first full-target week), "Consistent" (8 counted weeks in a run, rest weeks allowed), "Stretch habit" (10 stretch sessions).
- Profile setting to hide achievements.
- Visual design is D7.

**H7. Progress photos locked down**
- Move photos out of their own Activity tab into a card inside Progress.
- Off by default; she switches them on in Profile → Privacy. No reminders or prompts to take photos (remove the start/end prompts from S9).
- Never shown in summaries, completion cards, share images or notifications.
- Keep: private bucket, signed URLs, explicit consent screen on first use, delete one or all.

**H8. Challenges with rolling starts**
- Challenges start on any Monday or the 1st of the month, not one fixed date. No countdown timers.
- Never tie a challenge to a Pro discount or deadline.

**Group 4: design pass on the remaining screens** (details in DESIGN.md section 6)

**D2. Photo pass:** one distinct photo per routine and per stretch; stretch photos for stretches; no image repeated on one screen; follow the photo direction (no midriff-focused shots).
**D3. Home:** shorter featured cards (two sections visible on screen), no repeated image, daily quote card (N7), welcome-back card slot (H2), profile avatar in the header (see N6 navigation).
**D4. Routine and stretch detail pages share one layout:** hero, compact stats row, phase/stage headers, day previews, sticky primary button. Stretch player redesign (countdown ring, Pause primary, Skip as text, next-hold preview).
**D5. Planner:** smaller grey day headers, thin empty-day rows with a small "+", rest weeks shown (H1).
**D6. Activity Progress tab:** show this week only with "See full plan"; hide empty charts; streak card with weeks trained, current run and gold weeks (H1).
**D7. Awards:** badge grid with icons, locked greyed, earned in colour with tier rings, next-tier progress only on the next badge in each group; remove developer copy ("Badge tiers come next") and duplicated highlight tiles.
**D8. Profile:** use her onboarding name (not the email prefix); rows for Appearance, Notifications, Units, Privacy, Safety and disclaimer, Terms, Privacy policy, Contact, App version; tidy "My workouts" subtitle ("4 saved").
**D9. Exercises list:** thumbnails (or at least equipment icons that differ) instead of the same placeholder on every row.

**Group 5: content and new features**

**N2. More sophisticated routines**
- Every routine must meet the "Routine standard" below. Update existing routines first, then new ones.
- Data changes (migrations): `routine_weeks` add phase_name, phase_goal, is_lighter_week; `routine_days` add focus, warmup (list of steps with duration or reps), coach_note, finisher (optional); `routine_day_exercises` add role ('main' | 'secondary' | 'accessory' | 'core' | 'finisher'), target_rir (reps in reserve), tempo (optional), progression_rule ('load' | 'reps' | 'time'), load_increment_kg, notes, alternative_exercise_ids, superset_group (optional).
- Logger shows: warm-up checklist at the top, each exercise's role, target RIR as plain English ("stop with 2 reps left in the tank"), tempo if set, coach note for the day.
- Routine detail shows: why this split works, who it's for, what she'll be able to do by the end, phases with goals, and the weekly structure.
- All content reviewed by a qualified coach before launch; write it conservatively; keep it as data.

**N6. Learn section**
- New tab: **Learn**. Navigation becomes Home, Programmes, Planner, Activity, Learn. Profile moves to an avatar button in the top-left of Home (and the header of each tab), like the reference apps.
- Content stored as data: `learn_articles` (id, slug, title, summary, category, read_minutes, cover_image_id, body_markdown, is_pro, sources (list of links), reviewed_by, reviewed_at, published_at, sort_order) and `learn_links` (article_id, routine_id or exercise_id) to show related articles on routine and exercise pages.
- Categories: Getting started, Gym confidence, Technique, How programmes work, Recovery and sleep, Fuelling your training (general, no calorie targets or diets), Mindset and motivation, Myths busted.
- Layout: featured article hero, category tiles, "Recommended for you" based on her goals, related articles at the bottom of routine and exercise pages, reading progress and "Mark as read".
- Launch with about 15 articles (2 per category, 3 for Getting started), 2 to 5 minutes each, plain English, sources listed, coach-reviewed. All included in the subscription.
- Content rules: no weight-loss promises, no calorie or macro targets, no body-shape language, no medical advice; any health claim needs a reputable source (NHS, peer-reviewed study, professional body).

**N7. Daily motivational quote**
- A small card on Home with one quote a day, the same for everyone that day (pick by date from the list).
- Store in a `quotes` table (id, text, attribution, is_active). Write original quotes in the Ascenda voice (attribution "Ascenda"); only use quotes from other people if they are public domain or I approve them. No song lyrics.
- Tone: calm, encouraging, strength and consistency focused. No guilt, no body or weight references.
- Launch with at least 90 quotes so none repeat within three months. Profile setting to hide the quote.

**Group 7: reference-led redesign** (specs in DESIGN.md section 8; references: WEGLOW home, programmes and nutrition; a women's fitness app onboarding; Hevy logger)

**X1. Photo overhaul**
- Replace every photo with the new direction (DESIGN.md 8.1): bright, warm, airy gyms and studios; women smiling, many looking towards the camera; diverse ages, sizes and ethnicities; no men in frame; no dark or moody shots; no midriff-focused crops.
- One consistent licensed source and colour grade (e.g. a single paid stock library collection, or Pexels/Unsplash with the licence recorded in `images.licence_source`). No AI-generated people.
- Every routine, stretch, challenge, Learn article, category tile and hero gets its own image; no image repeats on a screen.

**X2. Home with more depth** (DESIGN.md 8.2)
- Sections in order: welcome hero with a smiling woman and a state-based call to action; week strip with today's planned session or an empty state; daily quote; Featured for you; current challenge; Refer a friend banner (X6); Your week so far (4 stat tiles with Share); Awards preview; Stretch today; Personalised for you (mixed Learn and, later, recipes).
- Every section hides itself if it has nothing useful to show.

**X3. Programmes as a discovery page** (DESIGN.md 8.3)
- Routines section becomes a WEGLOW-style browse page: Recommended for you hero card, "Build my plan" button (re-runs the plan questions from onboarding and recommends a routine; becomes AI3 later), Training style tiles, carousels (Start here, Popular once we have real data, New, Single sessions).
- Add **single sessions**: standalone one-off workouts (strength, cardio, stretch) built from existing routine days and stored as data, so she can do one workout without starting a programme.
- No invented trainers or coach personas. Show "Coach reviewed" on content once a qualified coach has reviewed it.

**X4. Logger, Hevy-inspired but Ascenda's own** (DESIGN.md 8.4; extends N3)
- Header: minimise (chevron down), session name, live timer, "Finish" button top right. Stats row: duration, volume (kg), sets done.
- Per exercise: thumbnail, name (tap opens guide), "⋯" menu; chips row with **Rest timer** (tap to change for this exercise; remembered next time) and **Note** (a note for this exercise that she sees again next time).
- Set table columns: Set, Previous (last time's "8 kg × 10"), kg, Reps, tick. Warm-up sets marked "W". "+ Add set" under each exercise.
- **Long-press and drag to reorder exercises** (ask before adding a drag-and-drop library; `react-native-draggable-flatlist` is the likely choice).
- Minimised session: a floating bar on every tab ("Full body A · 12:34 · Resume"), like the existing stretch mini bar.
- Ascenda touches that stay: suggested-weight chip, role and RIR line, first-time guide link, warm-up and cool-down blocks, rest timer bar, gentle PB celebration (small animation and haptic), plum and warm palette rather than Hevy's dark blue.

**X5. Onboarding v2: engaging, varied and honest** (DESIGN.md 8.5)
- About 22 screens with varied input types (icon cards, wheel picker, sliders, agree/disagree statements, photo cards, day pills, time picker), a progress bar, smooth animations between screens (Reanimated) and light haptics (`expo-haptics`, ask before adding).
- Statement questions about motivation and confidence (e.g. "I'm not sure what to do when I get to the gym"), each followed where useful by a short encouraging insight screen. Answers personalise routine choice, tags, reminders and Learn recommendations; store them in `profiles.onboarding_answers` (jsonb).
- **Milestone timeline instead of a weight prediction.** Show an early "Your plan" estimate (e.g. "First milestone: week 6") and then, after she has answered the plan questions, a recalculated estimate. The recalculation must come from a real calculation based on her answers (days per week, experience, session length, the routine's structure and the progression rule). It can move earlier or later; never hard-code it to always improve.
- Projected milestones are about confidence and strength (e.g. "Week 2: comfortable in your one-spot session", "Week 4: first machine", "Week 8: about 20% more on your goblet squat"), labelled as estimates.
- Do not copy from the reference: height, body-type pickers, body-fat sliders, BMI, weight-loss predictions or target weights. Bodyweight stays optional and is never used for predictions.
- Social proof must be real: no invented user counts or testimonials (fake reviews are unlawful in the UK under the DMCC Act). Before launch, use honest lines such as "Built with a qualified coach" or a real survey statistic with its source. After launch, show real App Store reviews with permission.
- Ends with: building-your-plan animation (real steps), plan reveal, safety disclaimer acceptance (N1), paywall (C1 rules), first session.

**X6. Refer a friend**
- Each user gets a personal invite link and code (Profile → Refer a friend, Home banner, post-session wins and completion cards).
- Offer: her friend gets a 14-day free trial (instead of 7); she gets a free month when the friend's paid subscription starts. Implement with App Store subscription offers through RevenueCat (offer codes or promotional offers); investigate the options and tell me before building, as Apple's rules decide what's possible.
- Track referrals in Supabase (`referrals`: referrer_id, code, invitee_id, status, rewarded_at). No cash rewards; clear terms on a referral info screen; limit rewards to a sensible number per year.

**X7. Recipe list pages** (with v2.4 F3)
- Meal-type pages (e.g. Breakfast): search, filter chips (High protein, High fibre, Vegetarian, Vegan, Dairy free, Quick), list rows with photo, title, tag and prep time, favourite heart.
- No calorie-based collections or filters ("Low calorie", "Under 500 kcal"); macros stay on the recipe page only. Favourite counts only if real.

**Group 6: compliance, pricing and launch**

**P1. Switch to the hard paywall** (do before C3)
- Replace the free/Pro split with a single `ascenda_pro` entitlement check for everything except the "without a subscription" list in "Pricing and access".
- Remove: Pro badges and FreeBadges inside the app, locked previews (blurred weeks), the 4 custom workout limit and duplicate counting, free AI quotas, free/Pro routine flags in the UI, and every contextual "Unlock with Pro" paywall. Keep `is_pro` columns in the database but stop using them (they may be useful for a future tier).
- Server-side protection: routine weeks, exercise prescriptions, recipes, Learn article bodies and AI Edge Functions only return content to users with an active entitlement. Use a Supabase table synced from RevenueCat webhooks (`subscriptions`: user_id, entitlement, status, expires_at, updated_at) and check it in RLS policies and Edge Functions. Plan-reveal data for her own recommended routine (name, description, cover, why it suits her, week 1 overview) stays readable without a subscription.
- Update Profile → Plan and subscription: status (trial ends on, renews on, expired), Manage subscription, Restore purchases.
- Update RevenueCat: products `ascenda_annual` (£59.99, 7-day introductory free trial) and `ascenda_monthly` (£9.99, no trial), one offering with both, the `ascenda_pro` entitlement attached to both. Tell me exactly what to set up in App Store Connect and RevenueCat.

**C1. Subscription compliance (UK DMCC Act, expected from January 2027; Apple guidelines)**
- Paywall shows clearly: price, billing period, trial length, when she'll be charged, how to cancel.
- Trial-ending reminder 2 days before conversion (push if allowed, plus an in-app banner).
- Renewal reminders before annual renewal; easy "Manage subscription" route (opens Apple's subscription settings).
- No countdown timers, fake urgency or back-to-back paywalls. A clear close button is always visible on the paywall; closing it goes to the locked home screen (C3).
- Cancellation must be as easy as subscribing: Profile → Manage subscription explains how, in one tap to Apple's settings.
- I'll take legal advice on how the DMCC rules apply to App Store billing.

**C2. Paywall timing test** (SUPERSEDED by the hard paywall. Instead track, via H5, paywall view → trial start, trial → paid, and how many trial users complete session 1 in their first 2 days.)

**C3. Hard paywall and subscription access** (build with P1)
- Paywall screen (DESIGN.md 9.2): hero photo, headline about her plan, 3 to 4 benefits, plan options per "Pricing and access", clear trial and billing copy ("7 days free, then £59.99 a year. Cancel anytime in Settings."), "Restore purchases", terms and privacy links, close button.
- Locked home screen (DESIGN.md 9.3) when there's no active subscription or trial: her plan preview card, "Start your 7-day free trial" PrimaryButton (reopens the paywall), Refer a friend, links to her history (read-only) and Profile. No other tabs are usable; tapping them shows the same screen.
- Lapsed subscriber: same locked home, with "Welcome back" copy, her stats, her history read-only and export available; resubscribe button. Never delete her data.
- Trial users get everything. Trial-ending reminder 2 days before (C1) and an in-app banner on Home on the last 2 days.
- Handle states: no subscription, trial, active, in billing grace period (keep access, gentle banner), expired. RevenueCat customer info listener updates access instantly after purchase or restore.
- Sandbox and TestFlight testing: document in PROGRESS.md how to test each state.

**S12 (email verification) stays last.**

**G1. Gym-first positioning** (do early in v2.2, after Group 1)
- Onboarding: replace "Where do you train? Gym / Home / Both" with "How long have you been going to the gym?" (Not yet / Just started / On and off / Regularly). Use it, with gym comfort and goals, for recommendations. Migrate existing `training_location` answers sensibly and stop using that field.
- Rename "Home strength" (and any home routines) to "Days you can't get to the gym"; never feature them on Home unless she asks for them.
- Update all copy, Learn categories and the App Store keyword notes in PROGRESS.md to be gym-focused.

**G2. Warm-up and cool-down blocks in every strength session** (do with N2)
- Every strength day has a dynamic warm-up block (5 min, movements relevant to the day) and a static cool-down block (5 min, muscles worked that day), stored as data on the routine day.
- In the logger they appear as collapsible blocks at the top and bottom, with timed holds (reuse the stretch player components). She can skip either with one tap; skipping never affects the streak.

### Phase v2.3 — the complete week: cardio and recovery
Build after v2.2, one task at a time, same rules as before.

**W1. Session types and blocks (data)**
- Sessions and routine days have a type: 'strength' | 'cardio' | 'recovery'.
- A routine day is an ordered list of blocks: 'warmup' | 'strength' | 'cardio' | 'cooldown' | 'stretch'. Strength days can include a cardio finisher block.
- Migrate existing routine days into this structure without changing what users see (strength block plus the G2 warm-up and cool-down).

**W2. Cardio sessions**
- Machines: treadmill, bike, cross-trainer, rower, stair climber (stored as equipment so Gym unlocked counts them).
- Session styles: steady ("you can still chat"), simple intervals (e.g. 1 minute faster, 2 minutes easy), finisher (8 to 12 minutes after lifting). Beginners get steady sessions only in their first 4 weeks.
- Each cardio block defines: machine, duration, intensity guidance as "how hard it should feel" (1 to 10) plus suggested settings ranges (e.g. treadmill speed 4.5 to 5.5 km/h, incline 6 to 10%), and intervals if any.
- Progression rule: add minutes first (up to the session's maximum), then intensity. Visible in plain English.
- Seed a standalone cardio library of 12 to 15 sessions, each with a cover photo of that machine in a gym.

**W3. Cardio logging**
- Cardio player: big timer (elapsed or countdown), current interval and what's next, machine settings to aim for, "Pause", "Skip interval", "End". Reuse DESIGN.md components.
- At the end, a short log: minutes done (pre-filled), settings used (optional, quick steppers), effort 1 to 10. Optional distance or calories only if she types them; never estimated by the app.
- Cardio counts towards the weekly target and streak; it doesn't count towards strength PBs.
- Progress: minutes of cardio per week, longest session, effort trend (Pro).

**W4. Machine guides**
- A guide for each cardio machine and each common strength machine: where it usually is, how to set it up (seat height, pins, safety key), how to start and stop safely, common settings for beginners, gym etiquette (wiping down, time limits when busy).
- Shown as "First time on the [machine]?" inside the cardio player and exercise info, and in Learn (Gym confidence category).
- Gym unlocked badges for first time on each cardio machine.

**W5. Recovery days**
- Routines can include recovery days that link to a stretch session (10 to 20 min).
- Planner shows recovery days with their own category colour and label ("RECOVERY").
- Recovery sessions count towards the weekly target (10+ minutes), as stretches already do.

**W6. Update routines to complete weeks**
- Every routine gets a weekly structure following the Routine standard, plus: cardio days or finishers suited to her level and goals, and recovery days.
- Example (beginner, 3 strength days): Mon Strength Lower A; Tue Cardio incline walk 20 to 30 min; Wed Strength Upper A; Thu Recovery hips and back; Fri Strength Full body with 10 min bike finisher; weekend optional cardio or rest.
- Onboarding: add "How do you feel about cardio?" (Love it / Fine / Avoid it if I can). Use it to set how much cardio routines include (finishers only, 1 day, or 2 days).
- Add at least 2 routines that balance strength and cardio (e.g. "Strong and fit: 8 weeks").

**W7. Weekly target counts all session types**
- The weekly target from onboarding counts strength, cardio and recovery sessions. Home and Activity show a ring with three small segments or icons (strength, cardio, recovery), like the reference apps, but the main number is total sessions.
- Decided: the weekly target Y is her onboarding days-per-week number, not the number of planned sessions. Any session type counts towards it (strength, cardio, or a stretch or recovery session of 10+ minutes). Hitting Y is a gold week. This overrides "Y comes from the planner" in R8.

### Phase v2.4 — Fuel: nutrition and recipes
Build after v2.3, one task at a time, same rules as before.

Rules for every task in this phase:
- Frame food as fuel for training, energy and recovery. Never "eat less", "clean eating", "guilt-free", "cheat meal", "detox" or body-shape language.
- No personal calorie targets, no food logging, no weight tracking, no weight-loss meal plans.
- Macros (calories, protein, carbs, fat, fibre per serving) are shown on each recipe, calculated from a nutrition database (e.g. UK CoFID or USDA FoodData Central), never guessed by AI. Macros can be hidden in Profile settings.
- All recipes and nutrition articles are reviewed by a Registered Dietitian (HCPC) or Registered Nutritionist (AfN) before launch; store `reviewed_by` and `reviewed_at`.
- Allergens listed on every recipe (the 14 UK major allergens), plus dietary tags (vegetarian, vegan, gluten free, dairy free).
- Recipe disclaimer at the bottom: general information, not personal nutritional or medical advice; check with a doctor or dietitian if you have a medical condition, allergy, are pregnant or have a history of disordered eating.

**F1. Food tab and navigation**
- Navigation becomes: **Home, Train, Food, Planner, Activity**. "Programmes" is renamed "Train" (Routines / Cardio / Stretches / Exercises). Learn moves out of the tab bar: a "Learn" section on Home with "See all" opening the Learn hub, and related articles inside Train and Food. Profile stays as the header avatar.
- Food tab: search, meal-type tiles (Breakfast, Lunch, Dinner, Snacks, Smoothies), then collections as horizontal carousels with "See all".

**F2. Recipes (data and content)**
- Tables: `recipes` (id, slug, title, summary, cover_image_id, meal_type, prep_minutes, cook_minutes, servings, ingredients (structured: name, quantity, unit, food_id), method_steps, nutrition_per_serving, allergens, dietary_tags, is_pro, reviewed_by, reviewed_at, published_at), `recipe_collections` (id, name, slug, sort_order, is_pro), `recipe_collection_items` (collection_id, recipe_id), `recipe_favourites` (user_id, recipe_id).
- A recipe can be in several collections.
- Collections (reworded in Ascenda's voice): Strong and nourished; Prep-ahead lunches; High-protein dinners; Top 10 breakfasts; Most-loved smoothies; One pot; Busy days; Dinner in 30; Prep-ahead breakfasts; Dinners; Snack smarter; Family friendly; High protein; Lunches; Seasonal favourites. Plus training-linked ones: Before an evening session; After leg day; Gym bag snacks.
- At least 5 recipes per collection; launch with about 60 recipes in total (reused across collections). Each has a real, matching food photo (licensed), never a mismatched one.

**F3. Recipe pages**
- Card: photo, meal-type eyebrow, title, "Prep 15 min · Serves 2", favourite heart.
- Detail: hero photo, title, time and servings, servings stepper that scales ingredients, ingredients list with tick boxes, numbered method steps, nutrition per serving (collapsible), allergens and dietary tags, disclaimer at the bottom, "Add to shopping list".

**F4. Recipes linked to training**
- Routine days can suggest a recipe ("Fuel for today: high-protein dinner"), based on session type and time. Shown on the Home hero after a session and in the post-session wins screen. Never as a requirement or a reward for training.

**F5. Favourites and shopping list**
- Favourite recipes, a Favourites collection, and a shopping list that combines ingredients from chosen recipes (grouped by aisle, tick off items, clear list).

**F6. Fuelling basics in Learn**
- Articles: protein for training, eating enough to train, pre- and post-workout food, hydration, caffeine and training, supplements basics (what has evidence, what doesn't), eating around periods of low appetite. Reviewed by the dietitian or nutritionist; sources listed; no calorie targets.

### Phase v2.5 — Ascenda AI
Build after v2.4 (or earlier if I say so), one task at a time. AI1 and AI5 can be built before Food exists; AI6 needs v2.4.

**Why:** AI gives women another reason to subscribe and creates shareable moments (scans, recaps). Research shows AI features boost revenue per payer but can increase churn if they're novelty only, so every AI feature must support her training habit.

**AI rules (apply to every task in this phase)**
- **Architecture:** all AI calls go through Supabase Edge Functions; the Claude API key is an Edge Function secret, never in the app. Default model Claude Haiku 5.5; use Claude Sonnet 5.5 only where quality testing shows Haiku isn't good enough (likely AI1 image recognition and AI4 answers). Use prompt caching for fixed system prompts and library lists.
- **Grounding:** the AI only chooses from or talks about our own data: exercises, machines, routines, Learn articles, recipes and her own logged history. It never invents exercises, machines, recipes, weights or stats.
- **Structured output and validation:** every response that drives the app (scan results, session changes, built sessions, recipe matches) is structured JSON, validated on the server against our database. If validation fails, retry once, then fall back to a non-AI option.
- **Weights:** suggested weights always come from our progression rule and her history, never from the AI.
- **Safety:** no diagnosis, injury treatment, pregnancy or postnatal advice, or medication advice; if pain, injury, pregnancy or a medical condition comes up, the reply says to stop and speak to a doctor or physiotherapist. No calorie targets, weight-loss plans, comments on bodies or appearance. Label every AI answer "AI-generated, not medical advice". Link to the Safety disclaimer.
- **Never build:** calorie counting from food photos, body scans or physique ratings, "future body" or any AI-generated images of her, AI form checking from video.
- **Privacy:** photos are processed and immediately discarded, never stored, logged or used for training. The scan screen tells her to photograph the machine, not people. Never send progress photos, health data or bodyweight to the AI. Don't send her name or email. Update the privacy policy to name the AI provider and what's sent.
- **Limits and cost:** per-user daily limits (see each task), friendly message when reached, `ai_usage` logging (user_id, feature, model, input_tokens, output_tokens, created_at) with RLS, a monthly budget alert in the provider console. Timeouts with a friendly error and a non-AI fallback.
- **Quality:** before launch, a qualified coach reviews a sample of 50 Ask Ascenda answers, 20 built sessions and 20 busy-gym fixes; fix the prompts until they pass.
- **Analytics (PostHog):** ai_feature_used, ai_result_accepted, ai_result_rejected, ai_limit_reached, ai_fallback_used; never send prompt or answer text.

**AI1. Scan a machine** (subscribers: up to 20 a day)
- Entry points: a camera button on the Train tab header, in the exercise library, and "What's this machine?" inside the logger.
- Flow: she takes or picks a photo of a machine → Edge Function sends the image plus our list of machines and their key features → model returns `{ machine_id, confidence, alternatives: [machine_id] }`.
- Confidence high: open our machine guide (W4) for that machine, with "Exercises you can do on this" (from our library, with exercise media (WorkoutX) demos) and "Add to today's session".
- Confidence low or no match: "Is it one of these?" with the top 3 options, plus "None of these" which logs the miss (no photo kept) so we can add machines later.
- Counts towards Gym unlocked when she then does an exercise on it.
- Share option: a card "I just unlocked the [machine] with Ascenda" (no photo of her, no gym name).

**AI2. Busy gym fix** (up to 10 a day)
- In the logger header "⋯" and on each exercise card: "Something's taken".
- She chooses: what's unavailable (equipment chips), time left (15 / 30 / 45 min), energy (low / normal / high).
- Model receives today's remaining exercises, her available equipment, our swap rules and eligible alternatives; returns a revised list of `{ exercise_id, sets, rep_min, rep_max, order }` that keeps the day's movement patterns.
- Validate against the library and swap rules; show a before/after preview; "Use this" applies it to today only.

**AI3. Build me a session** (up to 5 a day)
- On Home and in Train: time (20 / 30 / 45 / 60 min), focus (full body, upper, lower, glutes and legs, cardio, recovery), equipment available or "busy gym", energy level.
- Model chooses only from a pre-filtered list of eligible exercises, cardio blocks and stretch moves; returns structured blocks (warm-up, main, optional finisher, cool-down) matching the W1 block format.
- Opens in the logger as a custom session; she can save it to My workouts (counts towards the free custom workout limit if she later downgrades).

**AI4. Ask Ascenda** (up to 30 questions a day)
- A coach chat scoped to her training, not an open-ended assistant.
- Context sent: her current routine and week, last 5 sessions (exercise names, sets, reps, weights), the relevant exercise cues and machine guides, and matching Learn article summaries. Nothing else about her.
- It can answer: why an exercise or split is in her plan, technique questions, how to adjust her week ("Can I move leg day?" and it can offer to move it in the Planner with her confirmation), gym etiquette, general fuelling (linked to Learn), how to use the app.
- It must refuse or redirect: medical and injury questions (stop and see a professional), pregnancy and postnatal training, calorie targets or weight-loss plans, comments on her body, anything unrelated to training.
- UI: suggested question chips on open and on exercise and routine pages ("Why this exercise?", "What can I swap?", "How should this feel?"); answers short (under about 120 words) with links to the relevant guide or article; thumbs up/down feedback.
- Conversations are stored for 30 days for her own history only, deletable from Profile → Privacy; never used for training models.

**AI5. Monthly recap** (free for everyone, shareable; Hevy-style month report)
- Visibility: Home card only in the last 3 days of a month or the first 7 days of the next, if she trained at least twice in that month. Not a permanent archive; dismiss hides it for that month. Dev preview can force the window for testing.
- Report screen (shipped): year bar chart with Workouts / Duration / Volume / Sets chips, 2×2 summary with month-over-month deltas, exercises done that month with counts, an encouraging congrats tile (emoji + warm copy), then in-app share cards (summary + personal records) plus native Share. Numbers only on share cards: no photos, faces or body data.
- The app calculates every number. No AI-written story swipe in the shipped UI. Optional Edge Function `monthly-recap` and `monthly_recaps` (`supabase/ai5.sql`) may remain for a future story layer; they are not required for the report.
- Copy rules: celebratory, never comparing her to others, never mentioning missed sessions.

**AI6. What can I cook?** (up to 10 a day; needs v2.4)
- In the Food tab: type or pick ingredients she has, or take a photo of her fridge or cupboard.
- Model returns `{ recipe_ids, missing_ingredients }` chosen only from our reviewed recipes; never generates new recipes.
- Results show the best 3 to 5 matches with "You have 6 of 8 ingredients" and "Add missing to shopping list".
- Photo is processed and discarded.

**AI7. AI access and messaging**
- All AI features are included in the subscription (and the trial), with the daily limits above as fair-use protection. When a daily limit is reached: a friendly "You've hit today's limit, it resets tomorrow" message.
- Showcase AI on the paywall benefits and in onboarding ("Scan any machine and we'll show you how to use it").
- Marketing line for the paywall and App Store: "The app that knows every machine in your gym."

### Later phases (do not build yet)
**Gym buddy (after launch):** invite one friend; see each other's weekly progress (sessions, not weights); send a high five. Later small private groups. No public leaderboards, ever.
**AI:** now specified in phase v2.5 (replaces the old A1 to A3).

**Food:** now specified in phase v2.4.

## Routine standard (every routine must meet this)
1. **A clear purpose:** who it's for, what she'll be able to do by the end, and why this split suits that goal (one short paragraph).
2. **Phases:** 2 to 3 phases with names and goals (e.g. "Weeks 1 to 2: learn the movements", "Weeks 3 to 5: build", "Week 6: test"). 8-week routines include one lighter week (about 60 to 70% of normal sets) before the final checkpoint.
3. **Sensible splits:** full body 2 or 3 days, upper/lower 4 days, glute-focused lower plus upper, push/pull/legs only for experienced users. Each day has a stated focus.
4. **Session structure:** 5 to 10 minute warm-up (general plus movement-specific ramp-up sets for the first main lift), 1 to 2 main lifts, 2 to 3 secondary or accessory lifts, optional core or finisher. Realistic duration estimate.
5. **Prescriptions:** sets, rep range, target RIR (beginners 2 to 3, intermediates 1 to 2), rest time by role (main 2 to 3 min, accessories 60 to 90 s), tempo only where it helps (e.g. 3-second lowering for learning).
6. **Progression:** main lifts use double progression with a set load increment (dumbbells 1 to 2 kg, barbell 2.5 kg, machines one plate); accessories progress reps first; holds progress time. Rules are visible to the user in plain English.
7. **Balance:** each week covers squat, hinge, push, pull, single-leg and core patterns (unless the routine is deliberately focused, which it must say).
8. **Alternatives:** at least 2 swaps per exercise that keep the same pattern, including a one-spot or machine-free option where possible.
9. **Checkpoints:** re-test 2 to 3 key lifts at the midpoint and the end, shown as start vs now.
10. **Coaching notes:** one short note per day (what to focus on, how it should feel).
11. **Safety:** conservative starting loads ("find a weight you could lift 3 more times"), no maximal testing for beginners, coach review before launch.

## Safety disclaimer (full text, v2; to be checked legally)

Write for any country. Do not use GP, 999, solicitor, or other UK-only terms.

> **Train safely with Ascenda**
>
> Ascenda gives general fitness information and workout plans for healthy adults aged 18 and over. It is not medical advice and does not replace advice from a doctor or other qualified health professional.
>
> **Check with a doctor or other qualified professional before you start if you:**
>
> - Are pregnant, have given birth in the last year, or are trying to conceive
> - Have a heart condition, high blood pressure, diabetes, asthma or another long-term health condition
> - Have an injury, joint or back problem, or have had recent surgery
> - Take medication that affects your heart rate, blood pressure or balance
> - Have been told by a professional to limit exercise, or are unsure whether exercise is safe for you
>
> **Stop straight away and get medical help.** Stop if you feel chest pain or tightness, severe breathlessness, dizziness or faintness, sudden or sharp pain, or anything that feels wrong. In an emergency, call your local emergency number.
>
> **Train within your limits.** Warm up, use weights you can lift with good form, and never train through pain. Suggested weights are estimates based on what you log, not personal prescriptions. Exercise demos and tips are for guidance only; if you're unsure how to do a movement, ask a qualified instructor at your gym.
>
> You choose how and when you train, and you're responsible for doing so safely.

Short version (first-session sheet, 4 bullets): This is general fitness information, not medical advice. Check with a doctor first if you are pregnant, injured or have a health condition. Stop and get help if you feel chest pain, dizziness or sharp pain. Use weights you can lift with good form, and never train through pain.

## Out of scope (do not build unless I ask)
Video classes, open-ended AI chatbot, home-specific features, food logging or meal-plan diets, social feed or leaderboards (a private gym buddy is planned for later), wearable sync, any AI analysis of bodies or food photos for calories (machine scanning and fridge-to-recipe matching in v2.5 are allowed), AI form checking from video, cycle tracking, BMI or body-fat estimates, XP points or arbitrary user levels, calorie or macro targets, countdown timers on offers.

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

New or changed in v2.2:
- `profiles`: `main_goal` → `main_goals text[]` (max 3, first = main); add theme_preference ('light' | 'dark' | 'system', default 'light'), disclaimer_version, disclaimer_accepted_at, rest_weeks_banked (0 to 2), hide_streak, hide_achievements, hide_quote, photos_enabled (default false), reminder settings (session_reminders, weekly_summary, marketing_opt_in, default_reminder_time)
- `streak_weeks` (or a computed view): user_id, week_start, status ('counted' | 'gold' | 'rest' | 'repaired' | 'missed')
- `planned_sessions` addition: reminder_time
- Routine detail fields per N2 (`routine_weeks`, `routine_days`, `routine_day_exercises`)
- `learn_articles`, `learn_links`, `article_reads` (user_id, article_id, read_at)
- `quotes`: id, text, attribution, is_active
- `profiles.onboarding_answers` (jsonb: statement answers, machines used before, preferred days, reminder time); `profiles.referral_code`
- `referrals`: id, referrer_id, code, invitee_id, status ('invited' | 'trial' | 'subscribed' | 'rewarded'), rewarded_at
- `single_sessions` (or a `type = 'single'` routine with one day): standalone workouts for the Programmes browse page
- `exercise_notes`: user_id, exercise_id, note, updated_at; `exercise_rest_prefs`: user_id, exercise_id, rest_seconds
- Remove the session detail screen's separate state; today's changes (swaps, removed or added sets and exercises) live on the in-progress session
- `profiles`: add gym_experience ('not_yet' | 'just_started' | 'on_and_off' | 'regularly'); stop using training_location

New or changed in v2.3:
- `routine_days.type` and `sessions.type`: 'strength' | 'cardio' | 'recovery'
- `routine_day_blocks`: id, routine_day_id, order, block_type ('warmup' | 'strength' | 'cardio' | 'cooldown' | 'stretch'), plus block details (exercises for strength; steps with duration for warm-up, cool-down and stretch; cardio fields below)
- Cardio block fields: machine_id, style ('steady' | 'intervals' | 'finisher'), duration_minutes, max_minutes, effort_target (1 to 10), settings_guidance (jsonb), intervals (jsonb)
- `cardio_logs`: id, session_id, machine_id, minutes, settings_used (jsonb), effort (1 to 10), distance_km (nullable, user-entered)
- `machines` (or extend `exercises`/equipment): id, name, type ('cardio' | 'strength'), guide (structured), image_id
- `profiles`: add cardio_preference ('love' | 'fine' | 'avoid')

New in v2.4:
- `recipes`, `recipe_collections`, `recipe_collection_items`, `recipe_favourites`, `shopping_list_items` (user_id, recipe_id, ingredient, quantity, unit, aisle, ticked)
- `routine_day_recipe_suggestions` (routine_day_id, collection_id or recipe_id)
- `profiles`: add hide_macros (default false)

Pricing (P1, C3):
- `subscriptions`: user_id, entitlement, status ('trial' | 'active' | 'grace' | 'expired'), product_id, expires_at, updated_at; written only by the RevenueCat webhook Edge Function; read by RLS policies and Edge Functions
- RevenueCat webhook secret stored as an Edge Function secret

New in v2.5:
- `ai_usage`: id, user_id, feature, model, input_tokens, output_tokens, created_at
- `ai_quota`: user_id, feature, period_start, count (for daily fair-use limits)
- `ai_conversations` and `ai_messages` (Ask Ascenda): id, user_id, created_at; message role, content, created_at; auto-delete after 30 days; deletable by her
- `machine_scan_misses`: id, model_guess, created_at (no image, no user content)
- `monthly_recaps`: user_id, month, stats (jsonb), story_text, created_at

## Design direction
- Lively and visual: photos on routines and Home, generous cards, but still calm and uncluttered.
- Clear hierarchy: one main action per screen (e.g. the next-session card on Home).
- Encouraging copy, never shaming. Celebrate wins and firsts. No weight-loss pressure.
- Always make progress visible: what's planned, what she's done, what she's unlocked.
- Everything in the logger usable one-handed mid-workout.
- Units: kg by default, lbs option in settings. UK spelling.
- Never use em dashes (—) in any user-facing text. Use commas, full stops, colons or "to" instead.
- Hard paywall: no Pro badges or locks inside the app; the subscription unlocks everything (see "Pricing and access").
- Navigation (from v2.2): Home, Programmes (Routines / Stretches / Exercises), Planner, Activity, Learn. Profile opens from an avatar in the tab headers.
- Navigation (from v2.4): Home, Train (Routines / Cardio / Stretches / Exercises), Food, Planner, Activity. Learn is reached from Home and from related-article links.
- Gym-first: imagery, copy and examples are set in a gym.
- Light theme by default; dark theme is opt-in in settings.
- One primary button colour (plum `brand`) across the app. Coral is for small highlights only.
- DESIGN.md is the source of truth for tokens, components and screen layouts.

## Working rules for the AI
- Current work is the Roadmap to completion in PROGRESS.md. v2.0, v2.1 and v2.2 below are the spec history. Do not rebuild a roadmap item marked done. Do not start gym buddy or price experiments. Phases after the current roadmap item stay in order: remaining v2.2, then v2.3, then v2.4, then v2.5 (unless I ask for an AI task earlier). Build the data structures for later phases (W1 blocks) in a way that doesn't need redoing.
- Read the existing code before changing anything; change only what the current task needs.
- Build ONE task at a time, in order. Stop and tell me how to test it before moving on.
- For any database change, write a migration, explain it, and wait for my confirmation. Never delete users' workout history (sessions and sets).
- Keep it simple. Prefer fewer files and well-known libraries. Ask before adding any new library.
- Never hard-code secrets; use `.env` or Edge Function secrets.
- After each task, list what changed and any manual steps, and re-test the logger, progression rule and swaps if you touched anything near them.
- If something is ambiguous, ask rather than guess.
- Write clear TypeScript types for all data.
- Keep PROGRESS.md up to date after each task, then commit.
- Content as data: app content (routines, exercises, guides, stretches, cardio, challenges, Learn, quotes, recipes, achievements, onboarding copy, microcopy, AI prompts) lives in /content as JSON and is the source of truth. Never hard-code content in components or edit it directly in Supabase. To change content, edit /content (or ask me), then run npm run content:sync.

## Safety and compliance
- Disclaimer: use the full "Safety disclaimer" text above (N1); required acceptance in onboarding, stored with version and timestamp.
- Streaks, reminders and achievements must never shame or pressure (see Group 3 rules).
- Conservative progressions; coach review of all routines before launch.
- 18+ only.
- No BMI, body-fat estimates, health scores or weight-loss promises.
- Progress photos: opt-in, private bucket, signed URLs, never sent to AI, easy to delete.
- Only use images and exercise media licensed for commercial use.
- Privacy policy must reflect current data use (no cycle data; progress photos if used).
