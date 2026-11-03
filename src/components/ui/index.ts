/** Shared visual kit for the redesign. Wire these in screen-by-screen; do not restyle old screens from here. */

export {
  ButtonRow,
  DestructiveTextButton,
  PrimaryButton,
  SecondaryButton,
  TextButton,
} from './Buttons';
export { IconButton } from './IconButton';
export { AchievementBadge, FreeBadge, LockedOverlay, ProBadge, ProMark } from './Badges';
export {
  Chip,
  EmptyState,
  HeroImage,
  HighlightTile,
  ImageCard,
  ReminderTimeChip,
  SegmentedThemePicker,
  StatTile,
  Tag,
} from './Cards';
export { ChipScroller, ListRow, SectionHeader, StickyDayHeader } from './List';
export { ProgressBar, ProgressRing } from './Progress';
export { RestTimerBar, SetRow } from './Workout';
export {
  DisclaimerBody,
  DisclaimerCheckbox,
  DisclaimerSheet,
  SafetyNotice,
} from './Disclaimer';
export { GoalChipGroup } from './GoalChipGroup';
export { RestWeekBanner, StreakCard } from './Streak';
export { WelcomeBackCard } from './WelcomeBack';

export {
  AnchoredMenu as OverflowMenu,
  MenuHeader,
  MenuRow,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/AnchoredMenu';
