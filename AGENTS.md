# Project brief: Women's Strength App (working name)

## What we're building
A simple strength-training app for women. It plans today's gym session, logs it in seconds, and tells the user when to lift heavier. It is a tool, not a video-class library.

Core promise: "Walk in with a plan. Leave stronger. Keep your data."

Target user: women aged roughly 18â€“40 who lift or want to start, training in a gym 2â€“4 times a week. Many feel unsure what to do and self-conscious in the weights room, so the app must feel calm, clear and encouraging.

## Tech stack (do not change without asking)
- Expo (React Native) with TypeScript and Expo Router
- Supabase: Postgres database, auth (email + Sign in with Apple), storage
- RevenueCat: subscriptions, free trial, paywall
- PostHog: analytics (install â†’ first session â†’ trial â†’ paid)
- Target iOS first; keep code Android-compatible

## v1 features (build in this order)
1. **App shell**: bottom tabs â€” Today, Progress, Library, Profile.
2. **Auth**: email sign-in via Supabase (Apple sign-in later).
3. **Exercise library**: import a licensed exercise dataset into Supabase. Each exercise has name, target muscles, equipment, demo GIF/image, 3 short form cues, and a beginner-friendly "where to find it in the gym" line. Searchable and filterable by muscle and equipment.
4. **Onboarding quiz**: goal (strength / glutes & legs / general fitness), experience (new / some / confident), days per week (2â€“4), equipment (full gym / dumbbells only / home), gym confidence (1â€“5). Save to the user's profile.
5. **Programmes**: three templates stored as data, not hard-coded UI:
   - Beginner full body (3 days)
   - Upper/lower (4 days)
   - Lower-body focus (3â€“4 days)
   Assign one from the quiz answers.
6. **Today screen**: the session card â€” exercises in order, sets, target rep range, suggested weight.
7. **Logger**: big tap targets, previous weight pre-filled, one tap to complete a set, editable weight/reps, rest timer with notification.
8. **Progression rule** (double progression): if every set of an exercise hit the top of its rep range last session, suggest a small weight increase next time (e.g. +2.5 kg barbell, +1â€“2 kg dumbbell); otherwise keep the weight and aim for more reps.
9. **Swap button**: on any exercise, show 2â€“3 alternatives that train the same primary muscle with the user's available equipment.
10. **Progress screen**: personal bests, weight over time per lift (simple line chart), sessions per week. Make it look good enough to screenshot.
11. **Export**: download full workout history as CSV (free for everyone).
12. **Optional cycle notes**: user can tag a session with cycle phase and see her own patterns. No training prescriptions, no medical claims. Off by default, explicit consent, deletable.
13. **Paywall (RevenueCat)**: Free = logging, history, library, export. Pro (Â£7.99/mo or Â£59.99/yr, 7-day trial) = programmes, Today card, progression suggestions, swaps, progress charts. Add a trial-ending reminder 2 days before.

## Out of scope for v1 (do not build)
Video classes, AI chat coach, nutrition/calorie tracking, social feed or leaderboards, wearable sync.

## Data model (starting point)
- `profiles`: user_id, goal, experience, days_per_week, equipment, confidence, programme_id, cycle_tracking_enabled
- `exercises`: id, name, primary_muscle, secondary_muscles, equipment, media_url, cues, location_hint
- `programmes` / `programme_days` / `programme_exercises`: template structure with sets and rep ranges
- `sessions`: id, user_id, date, programme_day_id, cycle_phase (nullable)
- `sets`: id, session_id, exercise_id, set_number, weight_kg, reps, completed
- Use Supabase Row Level Security so users only see their own data.

## Design direction
- Calm, confident, uncluttered. Soft neutral background, one strong accent colour, large readable type.
- Encouraging copy, never shaming. No streak guilt.
- Everything usable one-handed mid-workout.
- Units: kg by default, lbs option in settings. UK spelling.

## Working rules for the AI
- Build ONE feature at a time, in the order above. Stop and tell me how to test it before moving on.
- Keep it simple. Prefer fewer files and well-known libraries. Ask before adding any new library.
- Never hard-code secrets; use environment variables (`.env`) and tell me which keys to add.
- After each feature, list what you changed and anything I need to do manually (e.g. Supabase setup, SQL to run).
- If something is ambiguous, ask rather than guess.
- Write clear TypeScript types for all data.
- Don't refactor working code unless I ask.

## Safety and compliance
- Show a short disclaimer: general fitness guidance, not medical advice; stop if anything hurts.
- Keep progressions conservative.
- Cycle data is health data: optional, explicit consent, never shared, easy to delete.
- Only use exercise media licensed for commercial use.

---

# Expo technical notes (from the Expo template)

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed â€” do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt â€” an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add â€” resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` â€” every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) â€” no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand â€” configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
