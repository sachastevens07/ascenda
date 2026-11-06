/** Shared visual kit for the redesign. Wire these in screen-by-screen; do not restyle old screens from here. */

export { AppText, type AppTextProps } from './AppText';
export {
  ButtonRow,
  DestructiveTextButton,
  PrimaryButton,
  SecondaryButton,
  TextButton,
} from './Buttons';
export { IconButton } from './IconButton';
export {
  AchievementBadge,
  BadgeSheet,
  BADGE_TIER_COLOURS,
  FreeBadge,
  LockedOverlay,
  ProBadge,
  ProMark,
} from './Badges';
export {
  Chip,
  CoverPlaceholder,
  EmptyState,
  HeroImage,
  HighlightTile,
  ImageCard,
  ReminderTimeChip,
  SegmentedThemePicker,
  StatStrip,
  StatTile,
  Tag,
} from './Cards';
export { DetailLayout } from './DetailLayout';
export { ExerciseThumb, equipmentIconColour, equipmentIconName } from './ExerciseThumb';
export { ChipScroller, ListRow, SectionHeader, StickyDayHeader } from './List';
export { ProgressBar, ProgressRing } from './Progress';
export { NoteChip, RestChip, RestTimerBar, SetRow, SetTableHeader } from './Workout';
export {
  DisclaimerBody,
  DisclaimerCheckbox,
  DisclaimerSheet,
  SafetyNotice,
} from './Disclaimer';
export { GoalChipGroup } from './GoalChipGroup';
export { StreakCard } from './Streak';
export { QuoteCard } from './QuoteCard';
export { WelcomeBackCard } from './WelcomeBack';
export {
  AwardsPreview,
  ChallengeHomeCard,
  HomeHeader,
  ReferralBanner,
  ShareStatsCard,
  WeekStripCard,
  WeekTodayEmpty,
  WeekTodaySession,
  WelcomeHero,
  pickAwardsPreview,
  type WeekStripDay,
} from './Home';
export { WhatsNextCard } from './WhatsNext';
export { TabAvatar } from './TabAvatar';
export { ArticleBody, ArticleCard, CategoryTile, RelatedLearn, openLearnArticle } from './Learn';
export {
  BuildPlanButton,
  OverlayImageCard,
  SingleSessionCard,
  StyleGrid,
  StyleTile,
} from './Programmes';

export {
  AnchoredMenu as OverflowMenu,
  MenuHeader,
  MenuRow,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/AnchoredMenu';
