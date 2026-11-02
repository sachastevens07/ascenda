# Ascenda design direction (v1)

Status: approved (2 Nov 2026). Visual changes only. No features, data or logic change unless approved separately.

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

- **Display font (serif):** one elegant serif for screen titles on Home, hero titles on routine pages, onboarding headlines, paywall headline and big achievement moments. Suggested: Fraunces or DM Serif Display. Needs `expo-font` plus a Google Fonts package; ask before adding.
- **UI font (sans):** keep the current sans (or Inter if adding fonts is approved) for everything else.

| Style | Font | Size / line | Weight | Use |
|---|---|---|---|---|
| `display` | Serif | 34 / 40 | Regular | Home title, hero titles, onboarding headlines |
| `title1` | Sans | 28 / 34 | Bold | Screen titles (Programmes, Planner, Activity, Profile) |
| `title2` | Sans | 22 / 28 | Semibold | Card titles on detail pages, section titles |
| `title3` | Sans | 18 / 24 | Semibold | Card titles in lists, exercise names |
| `body` | Sans | 16 / 22 | Regular | Body copy |
| `bodyStrong` | Sans | 16 / 22 | Semibold | Emphasis, button text |
| `bodySm` | Sans | 14 / 20 | Regular | Metadata, descriptions |
| `caption` | Sans | 12 / 16 | Medium | Captions, tab labels |
| `eyebrow` | Sans | 11 / 14 | Semibold, uppercase, letter-spacing 1.2 | Category labels, section kickers |
| `number` | Sans | 32 / 36 | Bold, tabular figures | Stats, ring centres |

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

Step 4. Session detail
- Header: eyebrow, `title1` session name, metadata.
- Exercise list as ListRows with thumbnails, "3 × 10-12", and last weight or "Find your starting weight" once at the top as a tip.
- Swap and remove as icons; sets/reps editing opens on tap (sheet) rather than always-visible steppers.
- Sticky PrimaryButton "Start session"; "Do a different day" and "Save as workout" in "⋯" or as TextButtons.

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
