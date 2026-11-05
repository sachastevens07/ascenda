# Ascenda design direction (v1)

Status: sections 1 to 5 approved and partly built. Section 6 (design pass 2, 3 November 2026) is the current work and overrides anything earlier that it contradicts. Feature and data changes are specified in AGENTS.md phase v2.2.

References analysed: Female Fitness (Leap), Sweat, WEGLOW.
Current screens analysed: Home, Programmes (Routines, Stretches), routine detail, session detail, logger, Planner, Activity (Progress, Achievements), Profile.

---

## 1. What the reference apps share

### Colour
- Warm, light backgrounds rather than pure white or grey: ivory, blush, soft peach (WEGLOW, Leap). Sweat uses white with a cool grey for section backgrounds.
- One saturated accent used sparingly for the main action and key numbers: hot pink (Sweat), red-orange (WEGLOW), pink/coral (Leap).
- A deep, near-black brand colour for contrast moments: Sweat's dark aubergine "Today" bar in the planner, its help banner and its "SAVE 56%" tag.
- Pastel colour blocks or gradients behind featured content (Leap challenge cards, WEGLOW meal-type tiles and "Trending" band).

### Typography
- Big, confident screen titles ("Activity", "Programs", "Grow Your Glutes").
- An editorial serif for display moments in WEGLOW ("Welcome to WEGLOW", "More Like This", "Learn", "Trending"). This is what makes it feel premium rather than generic.
- Small uppercase "eyebrow" labels above titles with letter-spacing: "INTERMEDIATE · STRENGTH", "RESISTANCE", "CARDIO", "DAILY GOAL", "CURRENT STREAK".
- Compact metadata lines under titles: "5 Circuits · 6 Exercises · 45-50 Mins", "Snack | 10 mins".
- Very little body copy. Descriptions are one or two lines with "More" to expand.

### Spacing and density
- Many short sections, each with a header and "See all >" on the right.
- Horizontal carousels where the next card peeks in from the right, so you can see there's more.
- Lists are compact: about 64-72 px per row, with dividers or subtle backgrounds instead of big gaps.
- Screen gutters about 16-20 px; cards close to edge-to-edge.

### Cards
- Image-first. Two styles:
  - Image on top, title and metadata underneath on the background (Sweat programme and workout cards, Sweat food).
  - Text overlaid on the bottom of the image with a dark gradient (WEGLOW "More Like This", Leap "Picks for today", WEGLOW recipes).
- Corner radius about 12-20 px. Images inside cards share the card's radius.
- Shadows are rare and very soft. Separation mostly comes from background contrast.
- Small chips on images: "TODAY", "NEW", "Guide", "28-Day", "Article", a heart for favourites.

### Buttons
- Primary: full-width pill or large rounded rectangle in the accent colour, white bold text ("Start now", "Start Workout", "Continue", "Explore Workouts"). Often pinned to the bottom of the screen.
- Secondary on coloured cards: white pill with dark text (Leap "Start", WEGLOW "Share Your Link").
- Tertiary: accent-coloured text links ("See all", "View all", "Show All", "More", "UPDATE >").
- Pill chips for filters (Leap "Full Body / Abs / Butt"), with the active one filled or outlined in accent.

### Images
- Real women mid-movement, in consistent light within each app: Sweat bright studio or dark gym; WEGLOW warm natural light and neutral tones; Leap cut-out models on pastel gradients.
- Full-bleed hero image with the title overlaid at the top of detail pages (WEGLOW "For When You Need A Stretch").
- Equipment shown as small product images (WEGLOW "Mat", "Straps").
- Food photography is top-down, bright and consistent.

### Navigation
- Five tabs with thin line icons and labels; active tab in accent colour (Sweat, WEGLOW). WEGLOW puts its logo in the middle as the Home tab.
- Segmented tabs at the top of screens with an underline indicator (Sweat "Progress / Achievements", "My Program / On Demand / Favorites"; WEGLOW "Recipes / Meal Plan").

### Planner (Sweat)
- Dark sticky "Today · Monday, 2nd Nov" bar.
- Light grey day headers that stick while scrolling.
- Each row: small uppercase coloured category label ("RESISTANCE", "CARDIO", "RECOVERY"), bold title, grey subtitle (programme name), chevron.
- One floating + button.
- Rest days are shown as a "Rest" row, not empty "add" prompts.

### Plan / programme view (Leap)
- Vertical timeline with circles on the left, stage headers ("Stage 1: Activate Your Body"), day cards with a thumbnail, "Day 1 · 17 Mins" and a chevron.
- The current day expands with a primary "Start now" button.
- A floating "Back to today" pill when scrolled away.

### Progress (Sweat)
- Large central ring ("0 of 8 activities complete") with three small rings underneath by type.
- Two tiles: "Current streak" and "All-time best", each with an icon.
- Programme card: eyebrow, name, trainer and start date, progress bar with "Week 3 of 18 · Block 1 of 2".
- Progress photos section with a soft call to action.

### Achievements (Sweat, WEGLOW)
- Grouped cards ("Total Workouts", "Workouts in a Week") with a two- or three-column grid of large badge icons. Locked badges are greyed silhouettes; earned ones are colourful.
- Tiered milestones (1, 3, 5, 10, 25, 50, 100, 250, 500, 750) and playful names ("Three's A Charm", "High Five", "Lucky Seven").

### Onboarding (WEGLOW)
- One question per screen, segmented progress bar at the top, back arrow.
- Large accent-coloured question, short helper line.
- Answer chips in a wrapped cloud; selected chip filled in accent.
- Reassurance screens between questions: big check icon ("We've got you covered, Sacha!"), personalised headline.
- Full-width primary "Continue" pinned at the bottom.

### Paywall (Sweat)
- Hero photo at the top, close button top left.
- Short headline ("Welcome Back").
- Three benefits with icons in a soft grouped card.
- Yearly plan as a large filled accent button showing the monthly equivalent, with a dark "SAVE 56%" tag; monthly as a lighter grey button.
- "Recurring billing, cancel anytime", "Restore Purchase" link, terms line.

### Empty states (WEGLOW)
- Soft image or illustration, accent headline ("No Workouts Planned Yet"), one short line, one primary button ("Explore Workouts").

### How Pro / locked is shown
- Sweat: persistent "Subscription expired" banner above the tab bar; paywall on tap.
- Note: the reference apps show very few explicit lock icons. Ascenda will be clearer than them (a consistent Pro badge and locked previews), as AGENTS.md requires.
- Leap: "Go Premium" bar in Mine; "Special Discount" countdown banners.
- WEGLOW: small brand badge icons on cards for premium content.
- All three keep locked content visible and attractive, and put the upsell at the moment of intent.

### What NOT to borrow
- Leap's body-part framing and claims ("Flat Stomach", "Round Booty", "Breast Lift"), BMI with "Overweight" labels, ads and countdown discount banners. These clash with Ascenda's calm, non-shaming brand and AGENTS.md safety rules.
- Unverifiable stats ("67% of women ... achieved their goals", "240K+ users joined"). Only show numbers we can back up.
- Heavy midriff-focused photography.

---

## 2. Where Ascenda falls short today

**Every screen**
- Floating grey gear button (and "Tools" label on Home) overlaps content. It's a dev tool showing in normal use.
- The disclaimer repeats at the bottom of every screen.
- Lots of explanatory copy that reads like internal notes ("Two starters are free. Pro plans show week 1 on the free plan.", "Logging still uses your programme on Home until the next step.", "Change today only: swaps, sets and removals don't rewrite the routine.").
- Only one type style family and weight range, so there's little hierarchy. No eyebrow labels, no display font.
- Plum is used for everything (buttons, text, tiles, badges), so nothing stands out. No contrast colour.
- Outline buttons everywhere; several on one screen, all the same weight.
- Photos are inconsistent in style and often midriff-focused; the same photo repeats on one screen; stretch routines use dumbbell and squat photos.
- An em dash remains in copy ("same three days — go up").

**Home**
- Weekly ring card is good but the gear overlaps it.
- Featured cards are cut off with no peek pattern or "See all" style consistency.
- The next-session card repeats a featured photo and has a heavy plum button; the card is very tall.
- Earlier screenshot shows the old "Full body A" from the old programme system.

**Programmes**
- Intro paragraph at the top is unnecessary.
- "Your current routine" card plus an "End routine" text button sits above the list; this belongs on the routine page or in a "⋯" menu.
- "Tag" dropdown is generic; references use horizontal filter chips.
- Routine cards are very tall (image, badges, title, two metadata lines, long description, four tags, outline button). Too little per screen.
- "See more details" button is redundant; the whole card should be tappable.

**Routine detail**
- Hero image doesn't have the title overlaid; title, badges and long description push content down.
- "You're on this plan" box with confusing copy.
- "Plan details" is a long vertical list of label/value pairs; could be a compact 2x3 stat grid with icons.
- "How this plan works" paragraph is long.
- Weeks are plain collapsed rows with no sense of progress or stages.
- Three outline buttons at the bottom (Duplicate, Switch routine, End routine) with no primary action. Should be one sticky primary ("Start next session" or "Start routine") and the rest in "⋯".

**Session detail**
- Each exercise has two big steppers (sets, reps) taking most of the card; it's an edit screen pretending to be a preview.
- "Find your starting weight" repeats on every exercise.
- Three stacked buttons at the bottom.
- No thumbnail of each exercise.

**Logger**
- Good: big tap targets, clear set rows.
- Weight cells show "–" with no hint of the previous weight or suggested weight.
- "First time: tap for the guide" repeats on every exercise.
- No exercise thumbnail or video entry point, no rest timer visible between sets.
- Lots of vertical space per set; no sticky progress at the top while scrolling.
- "Finish session" and "Discard session" at the bottom are fine.

**Planner**
- Good: dark "Today" bar and sticky day headers are already close to Sweat.
- "Add a workout" row on every empty day makes it noisy.
- Floating + button is rendered repeatedly down the list (bug).
- No category colour labels; rows look the same.

**Activity**
- Stat tiles are heavy plum blocks with the gear overlapping.
- "This week: 0 of 3 workouts" repeats information shown on Home.
- Weekly streak card is a bare progress bar.
- Progress tab: routine card wrongly shows a PRO badge on the free "Gym Confidence" routine (bug); the week list is long and plain.
- Achievements: one long greyed list with tiny text; no icons, no grouping, no tiers, nothing aspirational.

**Profile**
- Very long single column of cards.
- Shows dev-only items ("Testing as: Pro", "Restart 8-week block").
- Shows both "Routines: Gym Confidence" and "Your programme: Full body, 2 days a week, week 1 of 8" (old system, bug).
- "Your answers" list is long; could collapse.

---

## 3. Proposed design system

Goal: calm, warm, premium, encouraging. Keep Ascenda's plum identity, add a warm contrast accent and an editorial display font. Not a copy of any one reference.

### 3.1 Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#FBF7F4` | `#141013` | Screen background |
| `surface` | `#FFFFFF` | `#1E171B` | Cards, sheets |
| `surfaceMuted` | `#F4EDE9` | `#29212A` | Section bands, input fields, chips |
| `surfaceInverse` | `#2A1626` | `#F5EEF1` | "Today" bar, dark banners |
| `ink` | `#1E191C` | `#F5EEF1` | Primary text |
| `inkMuted` | `#6F6569` | `#B4A8AD` | Secondary text, metadata |
| `inkSubtle` | `#A2979B` | `#7E7378` | Placeholders, disabled |
| `border` | `#ECE3DE` | `#352B31` | Dividers, outlines |
| `brand` | `#7A3A6A` | `#D79AC4` | Primary buttons, active tab, links |
| `brandPressed` | `#622C55` | `#E6B3D5` | Pressed state |
| `brandSoft` | `#F3E5EF` | `#3A2535` | Selected chips, soft highlights |
| `accent` | `#E8735A` (warm coral) | `#F08C74` | Key numbers, streak flame, small highlights, "Today" chip. Never for large areas. |
| `accentSoft` | `#FCE7E1` | `#40261F` | Accent backgrounds |
| `pro` | `#C99A2E` | `#E2B652` | Pro badge background |
| `onPro` | `#2A1E05` | `#2A1E05` | Pro badge text |
| `success` | `#3D8B68` | `#6FC39A` | Completed ticks, PBs |
| `warning` | `#D9862B` | `#F0A957` | Gentle warnings |
| `danger` | `#C0443B` | `#EE7A70` | End routine, discard |
| `overlayGradient` | `rgba(20,10,18,0)` → `rgba(20,10,18,0.65)` | same | Text over photos |

Category colours (eyebrow labels in Planner and cards): Strength `brand`, Stretch `#4F8A86` (sage teal), Custom `#8A6D3B` (warm ochre).

### 3.2 Typography

- **Display font (serif):** Fraunces (`@expo-google-fonts/fraunces`), weights 400 and 600, plus 400 italic for the daily quote. Used for Home greeting, hero titles, onboarding questions, paywall headline, completion screens, Learn titles and the quote card (`displaySm`, italic). Letter-spacing about -0.3. No faux bold or italics.
- **UI font (sans):** Manrope (`@expo-google-fonts/manrope`), weights 400, 500, 600, 700 and 800. Everything else, including buttons, tab labels, chips, badges, logger set rows and kg/reps inputs.
- Load all weights in the root layout with `useFonts`. Keep the splash screen up until they are ready. Each weight is a separate `fontFamily` (for example `Manrope_600SemiBold`). Never set `fontWeight` to pick a weight: that breaks on Android.
- Apply fonts only through `AppText` (`variant` matches the tokens below) or the matching `type` token on `TextInput`.

| Token | Font | Size / line | Notes |
|---|---|---|---|
| `display` | Fraunces 400 | 34 / 40 | Home greeting, hero titles, onboarding questions, paywall headline, completion screens, Learn titles |
| `displaySm` | Fraunces 400 | 26 / 32 | Section heroes, quote card (italic) |
| `title1` | Manrope 700 | 28 / 34 | Screen titles |
| `title2` | Manrope 700 | 22 / 28 | Section and card titles |
| `title3` | Manrope 600 | 18 / 24 | List titles, exercise names |
| `body` | Manrope 400 | 16 / 24 | Body copy |
| `bodyStrong` | Manrope 600 | 16 / 24 | Buttons, emphasis |
| `bodySm` | Manrope 400 | 14 / 20 | Metadata |
| `caption` | Manrope 500 | 12 / 16 | Captions, tab labels |
| `eyebrow` | Manrope 700 | 11 / 14 | Uppercase, letter-spacing 1.4 |
| `number` | Manrope 700 | 32 / 36 | Stats, timers, ring centres; `fontVariant: ['tabular-nums']` |

Metadata uses `·` as separator: "6 weeks · 3 days a week · 40 min".

### 3.3 Spacing, radius, shadows

- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 56.
- Screen gutter: 20. Gap between sections: 32. Gap inside cards: 12-16.
- Radius: `sm` 8 (chips, small tiles), `md` 12 (inputs, set cells), `lg` 20 (cards, images), `xl` 28 (hero sheet top, paywall plan buttons), `pill` 999 (buttons, badges).
- Shadows: none on standard cards (use `surface` on `bg` for separation).
  - `shadow1` for floating items only (sticky CTA bar, FAB, dropdown menus): y 4, blur 16, `rgba(30,15,25,0.10)`.
- Dark mode: no shadows; use `surface` vs `bg` contrast and `border`.

### 3.4 Core components

- **PrimaryButton:** full-width, height 56, `pill`, `brand` fill, white `bodyStrong`. Pressed `brandPressed`. Loading spinner. One per screen. On detail screens, pinned in a sticky bottom bar with `bg` fade.
- **SecondaryButton:** height 48, `pill`, `brandSoft` fill, `brand` text. Used sparingly.
- **TextButton:** `brand` `bodyStrong`, no background. "See all", "Edit", "More".
- **DestructiveTextButton:** `danger` text. Only inside "⋯" menus or confirmation sheets.
- **IconButton:** 40 x 40 circle, `surfaceMuted`. For "⋯", back, swap, info.
- **OverflowMenu ("⋯"):** anchored dropdown with animation (per S7), rows with icon + label; destructive rows in `danger`.
- **ImageCard (carousel):** width 78% of screen so the next peeks; image 4:5 or 16:10 with `lg` radius; badges top-left; title `title3` and metadata `bodySm inkMuted` below the image. Whole card tappable.
- **HeroImage:** full-bleed top image (about 45% of screen height) with `overlayGradient`, eyebrow and `display` title overlaid bottom-left; back and "⋯" as translucent IconButtons. Content sheet below with `xl` top radius overlapping the image by 24.
- **ListRow:** min height 64; optional 56 x 56 thumbnail (`md` radius) or leading circle; eyebrow (category colour), `title3`, `bodySm` subtitle, trailing chevron or control. Dividers inset 16.
- **SectionHeader:** `title2` left, TextButton "See all" right; 12 below.
- **Chip / Tag:** height 32, `pill`, `surfaceMuted` fill, `bodySm` `ink`. Selected: `brandSoft` fill, `brand` text. Filter chips scroll horizontally.
- **ProBadge:** `pill`, `pro` fill, `onPro` text, `eyebrow` style "PRO", optional lock icon. Two sizes: small (on images, 20 high) and inline (16 high next to titles). Only on things the current user doesn't have. Pro users see no Pro badges, or a subtle "Included in Pro" only on the paywall and Profile.
- **FreeBadge:** same shape, `surface` fill with `brand` text, only where it helps decide (Programmes list for free users).
- **LockedOverlay:** blurred content with a centred lock icon, short line ("Unlock weeks 2 to 6 with Pro") and SecondaryButton "See Pro".
- **ProgressRing:** sizes 56 / 96 / 160; track `surfaceMuted`, fill `brand` (or `accent` for streaks); centre `number` + caption.
- **ProgressBar:** height 8, `pill`, track `surfaceMuted`, fill `brand`; label above, value right.
- **StatTile:** `surface` card, icon in a 32 circle (`accentSoft` / `brandSoft`), `number`, `caption` label. Grid of 2 or 3.
- **Badge (achievement):** 72 circle or shield icon; earned in colour with tier ring (bronze `#B9805A`, silver `#9BA3AB`, gold `pro`, platinum `#7E8FB8`); locked as `surfaceMuted` silhouette; label `caption` under; progress text "38 / 50" for the next tier.
- **EmptyState:** soft image or simple illustration, `title2` headline, one `bodySm` line, PrimaryButton or SecondaryButton.
- **StickyDayHeader (Planner):** today `surfaceInverse` with white text; other days `surfaceMuted` with `inkMuted` text.
- **SetRow (logger):** set number, weight cell (shows last time's weight in `inkSubtle` as placeholder, suggested weight chip if the progression rule says go up), reps cell, tick button. Completed rows get `success` tick and a soft `brandSoft` row background.
- **RestTimerBar:** appears pinned above the bottom after ticking a set: countdown, "+15s", "Skip".

### 3.5 Copy rules
- Cut helper text to one short line or remove it. Explain things in the moment (tooltips, info icon) rather than paragraphs.
- No em dashes. UK spelling. Sentence case for buttons ("Start session", not "Start Session").
- Encouraging, never shaming. No body-part goals like "flat stomach".

### 3.6 Photo direction
- Real women in activewear, mid-movement or calm, natural warm light, neutral backgrounds (studio, bright gym, home). Fewer midriff crops; prefer full-body or upper-body with faces relaxed.
- One consistent grade across all photos (warm, slightly soft contrast).
- Stretch routines: stretching or mobility photos only.
- No duplicate images on the same screen. Routine cover and next-session thumbnail must differ (use the day's lead exercise photo or a crop).

---

## 4. Rollout plan

Step 0. Foundations (no screen changes yet)
- Add tokens (colour, type, spacing, radius, shadow) with light and dark mode.
- Build the core components above in one shared folder.
- Put the floating gear / "Tools" button and dev-only Profile items behind a `__DEV__` / dev flag.
- Remove the per-screen disclaimer; keep it in onboarding and Profile.
- Ask before adding fonts.

Step 1. Home
- Title in `display` ("Good evening, [name]" or "Home").
- This-week card: ProgressRing + "1 of 4 workouts" + streak count with flame in `accent`.
- "Your next session" moves to the top as the hero card: day thumbnail, eyebrow "WEEK 1 · DAY 1", `title2` session name, metadata, one PrimaryButton "Start session". Tap card for session detail.
- "Featured for you" carousel with ImageCards (peek), Pro/Free badges, SectionHeader with "See all".
- Optional: "Stretch today" small carousel.

Step 2. Programmes
- Remove intro paragraph.
- Segmented control Routines / Stretches / Exercises with underline style.
- Horizontal filter chips instead of "Tag" dropdown.
- Compact routine cards: image left (or top, smaller), eyebrow (level · goal), `title3` name, metadata line, two chips max, badge. Whole card tappable; remove "See more details".
- Current routine shown as a small pinned card at the top with a ProgressBar; "End routine" moves into its "⋯" menu.
- Stretches: same pattern with stretch photos and duration-first metadata.

Step 3. Routine detail
- HeroImage with title overlaid.
- Below: badges row, 2-line description with "More".
- Stat grid (2 x 3): weeks, days a week, minutes, level, equipment, goal, with icons.
- Week-by-week as a vertical timeline (stage headers like "Stage 1: One spot", "Stage 2: Machines", "Stage 3: Free weights"), weeks expand to day cards with thumbnail and minutes. Completed days ticked.
- Locked weeks for free users use LockedOverlay.
- Sticky PrimaryButton: "Start routine" (or "Start next session" if current). Duplicate / Switch / End go in "⋯".

Step 4. Session detail (REMOVED in design pass 2: merged into the logger, see 6.3)

Step 5. Logger
- Sticky top: session name, sets progress bar, elapsed time.
- Exercise card: thumbnail / play button, name, target, info icon (guide shown once as a tip banner per session, not on every exercise).
- SetRows with last-time placeholders and suggested-weight chip.
- RestTimerBar after each ticked set.
- Bottom: PrimaryButton "Finish session", TextButton "Discard".

Step 6. Planner
- Keep dark Today bar and sticky day headers (StickyDayHeader).
- Rows with category eyebrow and chevron.
- Empty days: a single subtle "Rest day" or tap-to-add text in `inkSubtle`, not a full row with circle and chevron.
- One FAB (+) only (bug fix).
- Week strip at the top (Mon-Sun circles with dots for planned days), like WEGLOW, to jump between weeks.

Step 7. Activity and achievements
- Header stat tiles become StatTiles on `surface` (not plum blocks).
- Weekly streak card: ring or bar in `accent`, "5 of 8 weeks", all-time best tile alongside.
- Progress tab: current routine card with ProgressBar and "Week 1 of 6" (fix wrong PRO badge), personal bests list, charts (Pro).
- Achievements tab: grouped cards (Sessions, Streaks, Weight lifted, Personal bests, Programmes, Gym unlocked) with badge grids and tier rings; locked silhouettes; progress to next tier. Ready for S6 tiers.
- Progress photos card kept, softer.

Step 8. Profile
- Top: avatar initials, name, email, plan badge.
- Grouped list sections (like Leap's settings lists): Plan & subscription, Training (streak goal, units, rest timer default), Your answers (collapsed), Data (export), About (privacy, terms, disclaimer, feedback), Sign out.
- Remove dev-only items from normal builds; remove the old "Your programme" card (see bug below).

Step 9. Onboarding
- One question per screen, segmented progress bar, `display` question text, chip cloud answers, sticky "Continue".
- 2-3 encouraging interstitials with a check icon or simple illustration; only claims we can support.
- Plan reveal with HeroImage of the recommended routine and "Why this plan" bullets.

Step 10. Paywall
- HeroImage, `display` headline, 3 benefits with icons in a grouped card.
- Yearly plan as a large filled button with monthly equivalent and "Save X%" tag in `surfaceInverse`; monthly as a `surfaceMuted` button.
- "Cancel anytime", "Restore purchase", terms.

---

## 5. Bugs to fix during the redesign

1. **Free "Gym Confidence" shows PRO in Activity.** The ProBadge must read the routine's `is_pro`, not the screen or user plan.
2. **Old programme system still visible.**
   - What it probably is: the original v1.0 programme templates and/or the v1.2 "8-week block" (`profile.programme_id`, `blocks`) that R3 was meant to convert into routines. Home and Profile still read from it, so the user appears to be on two plans ("Gym Confidence" routine and "Full body, 2 days, week 1 of 8").
   - Proposed fix (needs approval before any change): (a) confirm in code which tables and screens still use it; (b) migrate any active old programme or block to an enrolment in the matching converted routine, keeping session history linked; (c) switch Home and Profile to read only from `routine_enrolments`; (d) remove the old UI and the "Restart 8-week block" dev item; (e) drop old columns/tables only after I confirm nothing reads them.
3. **Repeated floating + buttons in the Planner.** Render a single FAB outside the list.
4. **Em dashes in routine descriptions and any other copy.** Replace across all content and add a check (search for "—") before each commit.

---

## 6. Design pass 2 (from screenshots on 3 November 2026)

What's working and should be kept: warm palette, Home hero next-session card, weekly ring with "Start a streak", routine hero with eyebrow, checkpoint labels, sticky bottom buttons, compact routine list rows, planner week strip with dots, single FAB, dark "Today" bar, Profile grouped sections, the floating "continue your stretch" mini bar.

Each item below maps to a task in AGENTS.md (in brackets).

### 6.1 Global (D1, N5)
- **Dev tools:** the grey gear must not appear unless `showDevTools` is on (off by default, hidden gesture to enable). It currently covers "See all", "⋯" menus, tick buttons and filter chips.
- **Primary buttons:** always `brand` plum fill with white text. Currently Home and routine detail use coral; logger and stretches use plum. Coral `accent` is only for eyebrows, streak flame, key numbers and small chips.
- **Secondary buttons:** `brandSoft` fill or TextButton. Avoid outline buttons except for paired choices (e.g. Camera / Library).
- **Tags and chips:** sentence case ("Beginner friendly", "Busy gym friendly"), max 2 per card, single line, truncate the rest. Filter chips keep "All" first.
- **Eyebrows:** keep to 2 short words or shorten the goal label (e.g. "INTERMEDIATE · STRENGTH", not "BUILD STRENGTH" truncated).
- **Theme:** light is the default whatever the phone's setting; dark only when chosen in Profile → Appearance (Light / Dark / Match phone).
- **Typography:** Fraunces for display moments (Home greeting, hero titles, onboarding questions, paywall headline, completion screens, Learn titles, quote card). Manrope for everything else. Tokens and loading rules are in 3.2.
- **Navigation:** five tabs: Home, Programmes, Planner, Activity, Learn. Profile is a 36 px avatar (initials) at the top-left of each tab's header; tapping opens Profile as a pushed screen.

### 6.2 Photos (D2)
- One distinct photo per routine and per stretch routine. No image repeated on the same screen (Home hero vs featured cards, list rows).
- Stretch routines use stretching or mobility photos only (currently dumbbell photos).
- Replace the midriff-focused group studio photo used on Home and "One spot 2 days".
- Direction (unchanged from 3.6): real women, calm or mid-movement, natural warm light, faces relaxed, full or upper body, consistent warm grade.
- Store every image's licence in `images.licence_source`.

### 6.3 Logger (N3, replaces the session detail screen)
- Entry: "Start session" or tapping the next-session card opens the logger directly. There is no separate pre-workout screen.
- **Header:** back, session name (`title1`), eyebrow "WEEK 1 · DAY 1", sets progress bar, timer chip (shows "Not started" until the first tick or "Start timer"), header "⋯" menu: Do a different day, Save as workout, End session.
- **Day card at the top (collapsible):** coach note for the day (N2) and warm-up checklist with ticks.
- **Tip banner** shown once per session (keep the current one).
- **Exercise card:**
  - thumbnail (exercise media (WorkoutX) still or video play button; never a letter placeholder), name (`title3`), role eyebrow ("MAIN LIFT", "ACCESSORY"), target line "3 × 10 to 12 · 2 reps in reserve · rest 90 s";
  - icon buttons: info (guide), swap; "⋯" menu: Remove exercise, Add set, Remove set, Change rep target, Notes;
  - SetRow: set number, kg cell with last time's weight as placeholder (`inkSubtle`), a "+2 kg" suggested chip when the progression rule says go up, reps cell, tick button 48 px in `brand` outline that fills `success` with a white tick when done; completed row gets `brandSoft` background.
- **Rest timer bar:** slides up above the bottom bar after each tick: countdown, "+15 s", "Skip".
- **End of list:** "Add exercise" SecondaryButton.
- **Bottom bar:** PrimaryButton "Finish session" (disabled until at least one set is ticked) and TextButton "Discard" (only if something was ticked).

### 6.4 Home (D3, H2, N7)
- Order: header (avatar, greeting in display serif) → hero card (next session, or Welcome back card) → this-week card (ring, streak or "Start a streak", weeks trained) → daily quote → Featured for you → Stretch today → From Learn (2 article cards).
- **Featured cards:** 16:10 image (not 4:5) so two sections fit on one screen; width 78% with peek.
- **Hero image** must differ from every featured card image.
- **QuoteCard:** `surface` card, small coral quote mark, quote in display serif 20/28, attribution `caption inkMuted`, "⋯" menu with "Hide daily quote". No share button at launch.
- **WelcomeBackCard (H2):** replaces the hero when triggered. Soft `accentSoft` background, headline "Welcome back", one line, PrimaryButton "Start a lighter session", TextButton "See other options".

### 6.5 Routine and stretch detail share one layout (D4, N2)
- HeroImage with eyebrow and title (already done for routines; apply to stretches).
- Below the hero: badge row, 2-line description with "More", then a **progress bar** "Week 1 of 8" if current (instead of the floating label).
- **Stats row:** one horizontal row of 4 compact items (icon + value + label): weeks, days a week, minutes, level. Equipment and goal move into chips or the "Who it's for" block. Replaces the 2 x 3 tile grid.
- **New blocks (N2):** "Who it's for" (2 to 3 bullets), "By the end you'll" (2 to 3 bullets), "How it works" (split, progression rule in one sentence each).
- **Week by week:** grouped by phase headers ("Phase 1 · Learn the movements"), each week row shows day names ("Lower A · Upper A") and a tick per completed day; lighter week and checkpoint weeks get small chips. Expanding a day shows exercises with role and target.
- Stretch pages: same, with "Holds" as the list (thumbnail, name, duration).
- Sticky PrimaryButton (plum). Small line at the bottom: "Train within your limits. Read the safety guidance" (link).
- Related Learn articles carousel at the bottom (N6).

### 6.6 Stretch player (D4)
- Large ProgressRing (160 to 200 px) counting down, time in `number` style in the centre.
- Eyebrow "HOLD 1 OF 8", name `title1`, demo thumbnail or video above the ring.
- Cues as 2 to 3 short lines.
- PrimaryButton "Pause" / "Resume"; TextButton "Skip"; "Next: Child's pose · 45 s" preview row; "End stretch" inside "⋯".

### 6.7 Programmes (D1, D9)
- Routine rows: max 2 chips, single line, consistent row height; eyebrow not truncated.
- Current routine card: make sure "⋯" is visible (move dev gear).
- Exercises list: thumbnail per exercise (exercise media (WorkoutX) still), or at least a different icon per equipment type (dumbbell, barbell, machine, cable, band, bodyweight, kettlebell) in its category colour.

### 6.8 Planner (D5, H1)
- Day headers smaller and quieter: `eyebrow` style "WED 4 NOV" in `inkMuted` on `surfaceMuted`, 32 px tall. Today keeps the dark bar.
- Planned session rows: unchanged (eyebrow, title, subtitle, chevron).
- Empty days: no "Tap to add" band. Show just the header with a small "+" on the right.
- Rest weeks (H1) shown as a soft `accentSoft` banner across the week: "Planned rest week. Enjoy it."
- Reminder time shown on each planned row as a small bell + time (H3); tap to change.

### 6.9 Activity (D6, D7, H1, H6, H7)
- Sub-tabs become **Progress** and **Awards** (Photos moves into Progress as a card, only shown if photos are switched on).
- **Progress tab:**
  - Highlights tiles (keep).
  - StreakCard: "Current run 5 weeks" + "Weeks trained 23" + a row of the last 8 weeks as small circles (gold, counted, rest, missed shown neutral grey, never red) + rest weeks banked.
  - Your routine: card with progress bar and only the current week's sessions, plus "See full plan".
  - Personal bests list; charts (Pro). Hide "Sessions per week" until there are 2+ weeks of data.
- **Awards tab (D7):**
  - Remove duplicated Highlights tiles and developer copy ("Badge tiers come next", "Most recent", "0/1").
  - Group cards: First times, Sessions, Weeks trained, Personal bests, Programmes, Gym unlocked, Weight lifted.
  - 3-column grid of 72 px badge icons (an icon per family, not a number), earned in colour with tier ring (bronze, silver, gold, platinum), locked as `surfaceMuted` silhouettes.
  - Only the next unearned badge in each group shows progress ("38 / 50").
  - Tapping a badge opens a sheet: name, what it's for, date earned.

### 6.10 Profile (D8)
- Header: avatar, her onboarding name (not the email prefix), email, plan badge.
- Sections: Plan and subscription · Training (streak goal, units, rest timer default, show streak, show achievements) · Appearance (theme, show daily quote) · Notifications (session reminders, weekly summary, offers and news) · Privacy (progress photos on/off, export data, delete account) · Your answers · About (Safety and disclaimer, Terms, Privacy policy, Contact us, App version).
- "My workouts" row subtitle shows a count ("4 saved").
- Sign out at the bottom; app version below it (hidden dev gesture lives here).

### 6.11 Onboarding changes (N1, N4)
- **Goals screen:** chip cloud, up to 3 selections; first selected shows a small "Main" label; helper line "Pick up to 3. Your first pick is your main goal." Disable further chips after 3 with a gentle hint.
- **Safety screen:** display serif title "Train safely", the full disclaimer in a scrollable card, required checkbox "I've read this and I'm 18 or over", PrimaryButton "Continue" disabled until ticked.
- Streak goal screen copy: frame as a milestone ("How many weeks would you like to aim for first?"), with 4 weeks pre-selected.

### 6.12 Learn (N6)
- **Learn tab:** header with avatar; display serif title "Learn"; featured article hero (image, category eyebrow, display title overlay, read time); category tiles in a 2-column grid (image with label overlay, like the reference); "Recommended for you" carousel; "Continue reading" row if she left an article midway.
- **Article page:** HeroImage with title; meta row (category · 3 min read); body with comfortable reading width, `body` 17/26, headings `title2`, bullet lists, pull-quote style; "Sources" list at the end; related articles; "Mark as read"; safety line at the bottom.
- **ArticleCard component:** 16:10 image, category eyebrow, `title3`, read time; Pro badge if Pro.

### 6.13 New components to add
QuoteCard, WelcomeBackCard, StreakCard (with week circles), RestWeekBanner, ReminderTimeChip, ArticleCard, CategoryTile, SafetyNotice (inline one-line link), DisclaimerSheet, GoalChipGroup (multi-select with max and "Main" label), SegmentedThemePicker.
