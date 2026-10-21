# Project brief: Women's Strength App (working name)

## What we're building
A simple strength-training app for women. It plans today's gym session, logs it in seconds, and tells the user when to lift heavier. It is a tool, not a video-class library.

**USP 1: confidence levels.** The app starts women in one quiet spot of the gym ("Quiet Mode") and gradually levels them up to the whole gym, alongside their strength progress. It builds on the "shy girl workout" trend but fixes its flaw: staying in the corner forever stalls progress.

**USP 2: AI built around confidence.** An AI workout builder that only uses the app's own exercise library, filtered to her equipment and confidence level ("Build me a 40-minute corner session with dumbbells"), plus scoped form Q&A for each exercise.

Core promise: "Start in the corner. Own the whole gym."

Target user: women aged 18–40 who lift or want to start, training in a gym 2–4 times a week. Many feel unsure what to do and self-conscious in the weights room, so the app must feel calm, clear and encouraging. Tone is empowering, never timid: the goal is always to take up more space over time.

## Tech stack (do not change without asking)
- Expo (React Native) with TypeScript and Expo Router
- Supabase: Postgres database, auth (email + Sign in with Apple), storage, Edge Functions. UK or EU region.
- RevenueCat: subscriptions, free trial, paywall
- PostHog: analytics (install → first session → trial → paid)
- AI (phase v1.2 only): Claude API called ONLY from a Supabase Edge Function. Default model: Claude Haiku 5.5; use Claude Sonnet 5.5 only if quality testing shows Haiku isn't good enough. API key stored as an Edge Function secret, never in the app.
- Target iOS first; keep code Android-compatible

## Build plan and status

### Phase v1.0 — finish the original build (CURRENT)
Features 1–9 are BUILT. Do not rebuild them.

Built:
1. App shell: bottom tabs — Today, Progress, Library, Profile.
2. Auth: email sign-in via Supabase.
3. Exercise library: licensed dataset in Supabase, searchable/filterable.
4. Onboarding quiz: goal, experience, days per week, equipment, gym confidence (1–5).
5. Programmes: three templates stored as data (beginner full body, upper/lower, lower-body focus).
6. Today screen: session card.
7. Logger: pre-filled weight, one-tap sets, rest timer.
8. Progression rule (double progression).
9. Swap button: 2–3 alternatives for the same primary muscle.

Still to build (in this order):
10. **Progress screen**: personal bests, weight over time per lift (simple line chart), sessions per week. Make it look good enough to screenshot. Leave room for a confidence section to be added in v1.1.
11. **Export**: download full workout history as CSV (free for everyone).
12. **Optional cycle notes**: user can tag a session with cycle phase and see her own patterns. No training prescriptions, no medical claims. Off by default, separate explicit-consent screen, never shared, deletable.
13. **Paywall (RevenueCat)**: Free = logging, history, library, export. Pro (£7.99/mo or £59.99/yr, 7-day trial) = programmes, Today card, progression suggestions, swaps, progress charts. Trial-ending reminder 2 days before. Keep entitlements simple so new Pro features can be added later.

Milestone: TestFlight with 15–20 testers before starting v1.1.

### Phase v1.1 — confidence levels (after v1.0; modify existing code)

**C1. Zone tags (data change)**
- Add a `zone` field to `exercises`, an integer 1–4:
  - 1 = Corner: one spot, a set of dumbbells, maybe a mat or bench
  - 2 = Dumbbell area: bench, cables, more space
  - 3 = Machines
  - 4 = Barbell and squat rack
- Write a Supabase migration that adds the column with a sensible default, plus SQL that assigns zones to existing exercises based on their equipment. Show me the mapping before applying it.
- Don't delete or rename existing columns.

**C2. Onboarding updates (modify feature 4)**
- Add an 18+ age confirmation step at the start. If under 18, show a polite message and don't create a profile.
- Do NOT ask for height. Bodyweight is optional and only used for relative-strength stats; never calculate BMI or any health score.
- Use the existing gym-confidence answer (1–5) to set a starting level: 1–2 → Level 1, 3 → Level 2, 4 → Level 3, 5 → Level 4. Let the user change it.
- Add `confidence_level` (1–4) and `bodyweight_kg` (nullable) to `profiles`. Remove any height field if one exists, via a migration.
- Existing test users without a level: default them from their confidence answer.

**C3. Programmes respect levels (modify features 5 and 6)**
- Each programme exercise slot can be filled by exercises at or below the user's confidence level.
- The Today card only shows exercises at or below the user's current level.
- Add a "Quiet Mode" toggle on the Today card: when on, the whole session stays in a single zone (the user's lowest comfortable zone) so she never has to move around the gym.

**C4. Swap engine respects zones (modify feature 9)**
- Swap alternatives must be at or below the user's confidence level by default, plus same primary muscle and available equipment.
- Add a small "Try something new" option that shows one alternative from the next zone up.

**C5. Level-up moments**
- After a user completes 4 sessions at her current level, suggest adding ONE exercise from the next zone in her next session, with a friendly "Where to find it and what to do" card (use the exercise's location hint and form cues).
- If she accepts and completes it twice, offer to move her up a level. She can always decline or go back down. No pressure, no guilt copy.
- Store level history in a `confidence_history` table.

**C6. Confidence on the Progress screen (modify feature 10)**
- Add a confidence section: current level, a simple timeline of level-ups, and zones she has trained in.

**C7. Paywall update (modify feature 13)**
- Free tier also includes Level 1 Quiet Mode sessions. All levels and level-ups are Pro.

### Phase v1.2 — AI features (after v1.1)

**A1. AI workout builder (Pro only)**
- User picks: time available (20/30/45/60 min), focus (full body / upper / lower / glutes & legs), and optionally "Quiet Mode".
- The app sends the Edge Function: the request, the user's equipment, confidence level, Quiet Mode setting, and a pre-filtered list of eligible exercise IDs and names from our own database (at or below her level, matching equipment, single zone if Quiet Mode).
- The model must ONLY choose from the provided exercise IDs and must return structured JSON: list of {exercise_id, sets, rep_range, rest_seconds, order}.
- The Edge Function validates the JSON: every exercise_id must exist in the eligible list, sets 1–5, reps 3–20, sensible total duration. If validation fails, retry once, then fall back to the nearest programme template.
- Suggested weights come from our existing progression rule and her history, never from the AI.
- The generated session appears on the Today card and is logged like any other session. User can save it as a favourite.

**A2. Form Q&A (Pro only)**
- An "Ask about form" button on each exercise's detail screen.
- The Edge Function sends: a fixed system prompt, the exercise's name, cues, target muscles and equipment, and the user's question. Nothing else about the user (never cycle data, never bodyweight).
- System prompt rules: answer only about how to perform this exercise and general technique; short, friendly, plain English; never diagnose injuries or give medical advice; if the user mentions pain, injury, pregnancy, or a medical condition, tell her to stop the exercise and speak to a qualified professional; never contradict the stored form cues.
- Show a small "AI-generated guidance, not medical advice" label under each answer.
- Suggested starter questions per exercise (e.g. "Where should I feel this?", "What's a common mistake?") to reduce typing.

**A3. Shared AI rules**
- All AI calls go through Supabase Edge Functions; the API key is a server-side secret.
- Rate limits per user: 30 form questions/day, 5 workout builds/day. Return a friendly message when hit.
- Log each call's token usage (user_id, feature, input_tokens, output_tokens, date) in an `ai_usage` table for cost tracking. Apply RLS.
- Use prompt caching for the fixed system prompt.
- Set a timeout and show a friendly error if the AI doesn't respond.
- Before launch: the coach reviews a sample of 50 form answers and 20 generated workouts.
- Update the privacy policy: workout requests and form questions are sent to an AI provider.

## Out of scope (do not build unless I ask)
Video classes, open-ended AI chat coach (A2 is scoped to one exercise only), nutrition/calorie tracking, social feed or leaderboards, wearable sync, gym-photo scanning.

## Data model (current target)
- `profiles`: user_id, goal, experience, days_per_week, equipment, confidence (1–5 quiz answer), confidence_level (1–4, v1.1), bodyweight_kg (nullable, v1.1), programme_id, quiet_mode (bool, v1.1), cycle_tracking_enabled
- `exercises`: id, name, primary_muscle, secondary_muscles, equipment, zone (1–4, v1.1), media_url, cues, location_hint
- `programmes` / `programme_days` / `programme_exercises`: template structure with sets and rep ranges
- `sessions`: id, user_id, date, programme_day_id (nullable for AI-built sessions), source ('programme' | 'ai'), cycle_phase (nullable)
- `sets`: id, session_id, exercise_id, set_number, weight_kg, reps, completed
- `confidence_history` (v1.1): id, user_id, date, from_level, to_level
- `saved_workouts` (v1.2): id, user_id, name, exercises JSON, created_at
- `ai_usage` (v1.2): id, user_id, feature, input_tokens, output_tokens, created_at
- Use Supabase Row Level Security so users only see their own data. Apply RLS to every new table.

## Design direction
- Calm, confident, uncluttered. Soft neutral background, one strong accent colour, large readable type.
- Encouraging copy, never shaming. No streak guilt. Level-ups feel like a celebration, not a test.
- In-app label is "Quiet Mode", not "shy girl".
- Everything usable one-handed mid-workout.
- Units: kg by default, lbs option in settings. UK spelling.

## Working rules for the AI
- Finish the current phase before starting the next. Current phase: v1.0 (features 10–13).
- Features 1–9 already work. Read the existing code before changing anything, and change only what the current task needs.
- Build ONE task at a time, in the order above. Stop and tell me how to test it before moving on.
- For any database change, write a migration, explain it, and wait for me to confirm before running it.
- Keep it simple. Prefer fewer files and well-known libraries. Ask before adding any new library.
- Never hard-code secrets; use environment variables (`.env`) or Edge Function secrets and tell me which keys to add.
- After each task, list what you changed and anything I need to do manually.
- If something is ambiguous, ask rather than guess.
- Write clear TypeScript types for all data.
- Don't refactor working code unless I ask.
- Keep PROGRESS.md up to date. After finishing each task, update the Done, In progress and Next step sections, then commit.

## Safety and compliance
- Show a short disclaimer: general fitness guidance, not medical advice; stop if anything hurts.
- Keep progressions conservative.
- 18+ only.
- No BMI, body-fat estimates or health scores.
- Cycle data is health data: optional, explicit consent, never shared, never sent to the AI, easy to delete.
- AI answers are labelled as AI-generated and never give medical or injury advice.
- Only use exercise media licensed for commercial use.
