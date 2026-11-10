import microcopy from '../../content/microcopy/en-GB.json';

const profile = microcopy.strings.profile;
const safety = microcopy.strings.safety;

/** Appearance picker labels from content/microcopy. Microcopy is bundled, not synced to Supabase. */
export const appearanceLabels = {
  light: profile.appearance.light,
  dark: profile.appearance.dark,
  system: profile.appearance.system,
} as const;

export const appearanceSectionTitle = profile.settings_rows.appearance;

/** Profile → Privacy hide toggles. Bundled from content/microcopy. */
export const privacySettingsCopy = {
  photos: profile.privacy.photos,
  hide_streak: profile.privacy.hide_streak,
  hide_achievements: profile.privacy.hide_achievements,
  hide_quote: profile.privacy.hide_quote,
  hide_macros: profile.privacy.hide_macros,
} as const;

/** Surrounding safety strings. The full disclaimer body stays in src/lib/disclaimer.ts. */
export const safetyCopy = {
  onboarding_title: safety.onboarding_title,
  onboarding_checkbox: safety.onboarding_checkbox,
  onboarding_cta: safety.onboarding_cta,
  updated_title: safety.updated_title,
  updated_body: safety.updated_body,
  updated_cta: safety.updated_cta,
  first_session_sheet_title: safety.first_session_sheet_title,
  first_session_link: safety.first_session_link,
  first_session_cta: safety.first_session_cta,
  footer_line: safety.footer_line,
} as const;

export const safetySettingsTitle = profile.settings_rows.safety;

const subscription = microcopy.strings.subscription_status;

/** Profile → Plan and subscription. Prices still come from RevenueCat. */
export const subscriptionStatusCopy = {
  title: subscription.title,
  chip_trial: subscription.chip_trial,
  chip_active: subscription.chip_active,
  chip_active_cancelled: subscription.chip_active_cancelled,
  chip_grace: subscription.chip_grace,
  chip_expired: subscription.chip_expired,
  manage: subscription.manage,
  manage_help: subscription.manage_help,
  restore: subscription.restore,
  how_to_cancel_title: subscription.how_to_cancel_title,
  how_to_cancel_body: subscription.how_to_cancel_body,
} as const;

export const planSettingsTitle = profile.settings_rows.plan;

const paywall = microcopy.strings.paywall;

export const restoreCopy = {
  restore: paywall.restore,
  none: paywall.restore_none,
  success: paywall.restore_success,
  error: paywall.error,
} as const;

export const paywallScreenCopy = {
  headline_with_plan: paywall.headline_with_plan,
  headline_fallback: paywall.headline_fallback,
  title: paywall.headline_fallback,
  body: paywall.subheadline,
  subheadline: paywall.subheadline,
  benefits: paywall.benefits,
  annual_title: paywall.annual_title,
  annual_trial_line: paywall.annual_trial_line,
  annual_monthly_equiv: paywall.annual_monthly_equiv,
  annual_tag: paywall.annual_tag,
  monthly_title: paywall.monthly_title,
  monthly_line: paywall.monthly_line,
  cta_trial: paywall.cta_trial,
  cta_subscribe: paywall.cta_subscribe,
  small_print_trial: paywall.small_print_trial,
  small_print_monthly: paywall.small_print_monthly,
  restore: paywall.restore,
  terms: paywall.terms,
  privacy: paywall.privacy,
  close_a11y: paywall.close_a11y,
  purchasing: paywall.purchasing,
  success_title: paywall.success_title,
  success_body: paywall.success_body,
  error: paywall.error,
} as const;

export const lockedHomeCopy = microcopy.strings.locked_home;

export const referCopy = microcopy.strings.refer;

export const sessionCompleteCopy = microcopy.strings.session_complete;

const home = microcopy.strings.home;

/** X2 Home sections. Bundled from content/microcopy. Every section hides itself if empty. */
export const homeCopy = {
  hero_planned_today: home.hero_planned_today,
  hero_rest_day: home.hero_rest_day,
  hero_done_today: home.hero_done_today,
  hero_nothing_planned: home.hero_nothing_planned,
  hero_no_routine: home.hero_no_routine,
  week_strip_empty: home.week_strip_empty,
  week_tab_workouts: home.week_tab_workouts,
  week_tab_meals: home.week_tab_meals,
  meals_empty: home.meals_empty,
  section_featured: home.section_featured,
  section_week_so_far: home.section_week_so_far,
  section_awards: home.section_awards,
  section_stretch_today: home.section_stretch_today,
  section_personalised: home.section_personalised,
  section_learn: home.section_learn,
  see_all: home.see_all,
  quote_eyebrow: home.quote_eyebrow,
  share_week: home.share_week,
} as const;

/** W7 weekly ring. Bundled from content/microcopy. */
export const weekRingCopy = {
  label: home.week_ring_label,
  sessions: home.week_ring_sessions,
  counts: home.week_ring_counts,
  strength: home.week_ring_strength,
  cardio: home.week_ring_cardio,
  recovery: home.week_ring_recovery,
  optional: home.optional_chip,
  skip: home.optional_skip,
  eyebrow_strength: home.eyebrow_strength,
  eyebrow_cardio: home.eyebrow_cardio,
  eyebrow_recovery: home.eyebrow_recovery,
} as const;

const programmes = microcopy.strings.programmes;

/** X3 Programmes browse. Bundled from content/microcopy. */
export const programmesCopy = {
  tab_title: programmes.tab_title,
  section_recommended: programmes.section_recommended,
  build_plan: programmes.build_plan,
  section_styles: programmes.section_styles,
  section_start_here: programmes.section_start_here,
  section_single_sessions: programmes.section_single_sessions,
  see_all: programmes.see_all,
  current_plan: programmes.current_plan,
  coach_reviewed: programmes.coach_reviewed,
  start_session: programmes.start_session,
  play_a11y: programmes.play_a11y,
  style_gym_confidence: programmes.style_gym_confidence,
  style_strength: programmes.style_strength,
  style_glutes: programmes.style_glutes,
  style_upper: programmes.style_upper,
  style_full_body: programmes.style_full_body,
  style_cardio: programmes.style_cardio,
  style_busy_gym: programmes.style_busy_gym,
  style_stretch: programmes.style_stretch,
  style_cant_get_to_gym: programmes.style_cant_get_to_gym,
  empty_style: programmes.empty_style,
} as const;

const food = microcopy.strings.food;

/** Food tab and recipe pages (F1 to F6). Bundled from content/microcopy. Recipe bodies stay in /content. */
export const foodCopy = food;

export const subscriptionBanners = {
  trial_ending: subscription.banner_trial_ending,
  trial_ending_cta: subscription.banner_trial_ending_cta,
  grace: subscription.banner_grace,
  grace_cta: subscription.banner_grace_cta,
  dismiss_a11y: subscription.banner_dismiss_a11y,
} as const;

const notifications = microcopy.strings.notifications;

/** Trial-ending and annual-renewal pushes. {date} and {price} come from RevenueCat. */
export const billingReminderCopy = {
  trial_ending: notifications.trial_ending,
  renewal: notifications.renewal_reminder,
} as const;

/** H3 planner reminders. Bundled from content/microcopy. */
export const reminderCopy = {
  primer_title: notifications.primer_title,
  primer_body: notifications.primer_body,
  primer_yes: notifications.primer_yes,
  primer_no: notifications.primer_no,
  session_reminders: notifications.session_reminders,
  stretch_reminder: notifications.stretch_reminder,
  weekly_summary: notifications.weekly_summary,
  weekly_summary_with_stats: notifications.weekly_summary_with_stats,
  settings: notifications.settings,
} as const;

/** Logger strings from content/microcopy. Bundled, not loaded by content:sync. */
export const loggerCopy = microcopy.strings.logger;

/** Shown when exercise media is missing, rate-limited or fails. */
export const mediaUnavailableCopy = microcopy.strings.errors.media_unavailable;

export function fillCopy(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}

const streak = microcopy.strings.streak;

/** H1 streak copy. Never guilt. Bundled from content/microcopy. */
export const streakCopy = {
  label: streak.label,
  weeks_trained: streak.weeks_trained,
  current_run: streak.current_run,
  weeks_unit_one: streak.weeks_unit_one,
  weeks_unit_many: streak.weeks_unit_many,
  gold_weeks: streak.gold_weeks,
  goal_progress: streak.goal_progress,
  this_week_progress: streak.this_week_progress,
  this_week_counted: streak.this_week_counted,
  this_week_gold: streak.this_week_gold,
  this_week_none_yet: streak.this_week_none_yet,
  goal_reached_title: streak.goal_reached_title,
  goal_reached_body: streak.goal_reached_body,
  goal_reached_cta: streak.goal_reached_cta,
  goal_reached_later: streak.goal_reached_later,
  rest_week_prompt_title: streak.rest_week_prompt_title,
  repair_offer: streak.repair_offer,
  repair_progress: streak.repair_progress,
  repaired: streak.repaired,
  new_run: streak.new_run,
  hidden_note: streak.hidden_note,
} as const;

export function streakWeeksLabel(count: number): string {
  return fillCopy(count === 1 ? streakCopy.weeks_unit_one : streakCopy.weeks_unit_many, { count });
}

const welcomeBack = microcopy.strings.welcome_back;

/** H2 welcome-back card and options. Bundled from content/microcopy. */
export const welcomeBackCopy = {
  eyebrow: welcomeBack.eyebrow,
  title: welcomeBack.title,
  title_no_name: welcomeBack.title_no_name,
  body: welcomeBack.body,
  card_cta: welcomeBack.card_cta,
  see_options: welcomeBack.see_options,
  options: welcomeBack.options,
  cta: welcomeBack.cta,
  later: welcomeBack.later,
  complete_title: welcomeBack.complete_title,
  complete_body: welcomeBack.complete_body,
} as const;

export const welcomeBackFreshStartCopy = notifications.welcome_back_fresh_start;

/** Home next-session card ⋯. Bundled microcopy, not loaded by content:sync. */
export const nextSessionMenuCopy = home.next_session_menu;

const routineActions = microcopy.strings.routine_actions;

/** Switch, End and H4 next-routine copy. Bundled from content/microcopy. */
export const routineActionsCopy = {
  start: routineActions.start,
  start_monday: routineActions.start_monday,
  start_today: routineActions.start_today,
  start_sheet_title: routineActions.start_sheet_title,
  switch_title: routineActions.switch_title,
  switch_body: routineActions.switch_body,
  switch_cta: routineActions.switch_cta,
  end_title: routineActions.end_title,
  end_body: routineActions.end_body,
  end_cta: routineActions.end_cta,
  cancel: routineActions.cancel,
  whats_next_eyebrow: routineActions.whats_next_eyebrow,
  whats_next_title: routineActions.whats_next_title,
  whats_next_body: routineActions.whats_next_body,
  whats_next_cta: routineActions.whats_next_cta,
  complete_title: routineActions.complete_title,
  complete_body: routineActions.complete_body,
  complete_checkpoint: routineActions.complete_checkpoint,
  complete_next_cta: routineActions.complete_next_cta,
  complete_browse: routineActions.complete_browse,
} as const;

const progressPhotos = microcopy.strings.progress_photos;

/** H7 progress photos. Bundled from content/microcopy. Never used in shares or notifications. */
export const progressPhotosCopy = {
  consent_title: progressPhotos.consent_title,
  consent_points: progressPhotos.consent_points,
  consent_cta: progressPhotos.consent_cta,
  consent_cancel: progressPhotos.consent_cancel,
  show: progressPhotos.show,
  hide: progressPhotos.hide,
  add: progressPhotos.add,
  compare: progressPhotos.compare,
  delete_one_title: progressPhotos.delete_one_title,
  delete_all_title: progressPhotos.delete_all_title,
  delete_body: progressPhotos.delete_body,
  delete_cta: progressPhotos.delete_cta,
  deleted: progressPhotos.deleted,
} as const;

const challenges = microcopy.strings.challenges;

/** W2/W3 cardio library and player. Bundled from content/microcopy. */
const cardio = microcopy.strings.cardio;
export const cardioCopy = cardio;

/** W4 machine guides. Bundled from content/microcopy. */
export const machineCopy = microcopy.strings.machines;

/** AI1 Scan a machine. Prompts stay in content/ai, not here. */
export const aiCopy = microcopy.strings.ai;

/** AI5 monthly recap. Stats stay in the app. Story from the Edge Function or the template. */
export const recapCopy = microcopy.strings.recap;

/** H8 challenge copy. Bundled from content/microcopy. Never a countdown. */
export const challengesCopy = {
  join: challenges.join,
  joined: challenges.joined,
  starts: challenges.starts,
  start_choice_title: challenges.start_choice_title,
  start_next_monday: challenges.start_next_monday,
  start_first_of_month: challenges.start_first_of_month,
  progress: challenges.progress,
  complete_title: challenges.complete_title,
  leave: challenges.leave,
  leave_body: challenges.leave_body,
  week_repeat: challenges.week_repeat,
  this_week_mission: challenges.this_week_mission,
  switch_title: challenges.switch_title,
  switch_body: challenges.switch_body,
  ended_quietly: challenges.ended_quietly,
} as const;
