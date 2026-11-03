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
- **Learn and daily quote (v2.2):** most Learn articles are free (they build trust and help acquisition); a few in-depth guides can be Pro. The daily quote is free for everyone.
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

### Phase v2.1 — programmes and polish
Build in this order, one task at a time. If any v2.0 task (R1–R11) or the MuscleWiki video task is unfinished, tell me before starting v2.1.

**Superseded by v2.2 (read v2.2 before building these):** S5 streak rules are replaced by H1. S6 achievements are replaced by H6 and D7. The progress photo prompts in S9 are removed (see H7). S9 challenges must use rolling starts (H8). The session detail screen from R4 is removed and merged into the logger (N3).

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
- Logger improvements at the same time (DESIGN.md 6.3): last-time weight shown as placeholder in each kg cell, a suggested-weight chip when the progression rule says go up, bigger tick buttons in `brand` that fill `success` when done, rest timer bar after each ticked set, real exercise thumbnails (MuscleWiki) instead of letters.

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
- Launch with about 15 articles (2 per category, 3 for Getting started), 2 to 5 minutes each, plain English, sources listed, coach-reviewed. Most free, a few in-depth guides Pro.
- Content rules: no weight-loss promises, no calorie or macro targets, no body-shape language, no medical advice; any health claim needs a reputable source (NHS, peer-reviewed study, professional body).

**N7. Daily motivational quote**
- A small card on Home with one quote a day, the same for everyone that day (pick by date from the list).
- Store in a `quotes` table (id, text, attribution, is_active). Write original quotes in the Ascenda voice (attribution "Ascenda"); only use quotes from other people if they are public domain or I approve them. No song lyrics.
- Tone: calm, encouraging, strength and consistency focused. No guilt, no body or weight references.
- Launch with at least 90 quotes so none repeat within three months. Profile setting to hide the quote.

**Group 6: compliance and launch**

**C1. Subscription compliance (UK DMCC Act, expected from January 2027; Apple guidelines)**
- Paywall shows clearly: price, billing period, trial length, when she'll be charged, how to cancel.
- Trial-ending reminder 2 days before conversion (push if allowed, plus an in-app banner).
- Renewal reminders before annual renewal; easy "Manage subscription" route (opens Apple's subscription settings).
- No countdown timers, fake urgency or back-to-back paywalls. The free path ("Continue with the free plan") is always clearly visible on the paywall.
- I'll take legal advice on how the DMCC rules apply to App Store billing.

**C2. Paywall timing test**
- Keep the paywall after the plan reveal, but make "Start with the free plan" equally visible. Track (H5) whether users who start free and finish session 1 convert later. We'll decide on moving the paywall after TestFlight data.

**S12 (email verification) stays last.**

### Later phases (do not build yet)
**Gym buddy (after launch):** invite one friend; see each other's weekly progress (sessions, not weights); send a high five. Later small private groups. No public leaderboards, ever.
**AI (after v2.0 is live and stable)**
- A1. AI workout builder (Pro): picks only from our exercise library, filtered to her equipment and tags; structured JSON; server-side validation; weights from our progression rule; output opens as a custom workout.
- A2. Scoped AI help (Pro): "Ask about this exercise" on each exercise detail, using its stored cues. Never medical, injury, pregnancy or diet advice; pain → stop and see a professional; labelled as AI-generated. An open-ended chatbot is NOT planned.
- A3. Shared rules: Edge Functions only, rate limits (30 questions, 5 builds per day), `ai_usage` logging, prompt caching, coach review before launch, privacy policy update.

**Food (after everything else is built)**
- Deferred. Planned categories (reworded later): strong and nourished, prep-ahead lunch, high-protein dinner, top 10 breakfasts, most-loved smoothies, one pot, busy mums, dinner in 30, prep-ahead breakfast, dinner, snack smarter, family friendly, high protein, lunch, holiday favourites. Recipes in multiple categories; prep time and servings on cards; ingredients, method and macros (calculated from a nutrition database, not guessed) inside; "not health or nutritional advice" disclaimer. Pro perk.

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
Video classes, open-ended AI chatbot, food/recipes (until the food phase), social feed or leaderboards (a private gym buddy is planned for later), wearable sync, gym-photo scanning, cycle tracking, BMI or body-fat estimates, XP points or arbitrary user levels, calorie or macro targets, countdown timers on offers.

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
- Remove the session detail screen's separate state; today's changes (swaps, removed or added sets and exercises) live on the in-progress session

## Design direction
- Lively and visual: photos on routines and Home, generous cards, but still calm and uncluttered.
- Clear hierarchy: one main action per screen (e.g. the next-session card on Home).
- Encouraging copy, never shaming. Celebrate wins and firsts. No weight-loss pressure.
- Always make progress visible: what's planned, what she's done, what she's unlocked.
- Everything in the logger usable one-handed mid-workout.
- Units: kg by default, lbs option in settings. UK spelling.
- Never use em dashes (—) in any user-facing text. Use commas, full stops, colons or "to" instead.
- Pro features always carry the same Pro badge, so it's obvious what's paid.
- Navigation (from v2.2): Home, Programmes (Routines / Stretches / Exercises), Planner, Activity, Learn. Profile opens from an avatar in the tab headers.
- Light theme by default; dark theme is opt-in in settings.
- One primary button colour (plum `brand`) across the app. Coral is for small highlights only.
- DESIGN.md is the source of truth for tokens, components and screen layouts.

## Working rules for the AI
- Current phase: v2.2. First reconcile v2.0, v2.1 and v2.2 against the code and PROGRESS.md, then build v2.2 in its listed order. Unfinished v2.1 tasks that aren't superseded go after Group 2 unless I say otherwise. Do not start later phases.
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
- Disclaimer: use the full "Safety disclaimer" text above (N1); required acceptance in onboarding, stored with version and timestamp.
- Streaks, reminders and achievements must never shame or pressure (see Group 3 rules).
- Conservative progressions; coach review of all routines before launch.
- 18+ only.
- No BMI, body-fat estimates, health scores or weight-loss promises.
- Progress photos: opt-in, private bucket, signed URLs, never sent to AI, easy to delete.
- Only use images and exercise media licensed for commercial use.
- Privacy policy must reflect current data use (no cycle data; progress photos if used).
