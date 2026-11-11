import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode, Ref } from 'react';
import { Pressable, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

import type { AnchorHandle } from '@/components/AnchoredMenu';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';
import { challengesCopy, fillCopy, homeCopy, recapCopy, referCopy } from '@/lib/copy';
import type { AchievementBadge, AchievementFamily } from '@/lib/achievements';
import { FRIEND_TRIAL_DAYS } from '@/lib/referrals';

import { PrimaryButton, TextButton } from './Buttons';
import { PhotoFill, StatTile } from './Cards';
import { IconButton } from './IconButton';
import { SectionHeader } from './List';

export function HomeHeader({
  leading,
  onSearch,
  onPlanner,
  onAsk,
}: {
  leading: ReactNode;
  onSearch: () => void;
  onPlanner: () => void;
  onAsk?: () => void;
}) {
  return (
    <View style={styles.header}>
      {leading}
      <View style={styles.headerSpacer} />
      <View style={styles.headerActions}>
        {onAsk ? (
          <IconButton icon="chatbubbles-outline" accessibilityLabel="Ask Ascenda" onPress={onAsk} />
        ) : null}
        <IconButton icon="search" accessibilityLabel="Search programmes" onPress={onSearch} />
        <IconButton icon="calendar-outline" accessibilityLabel="Open Planner" onPress={onPlanner} />
      </View>
    </View>
  );
}

export function WelcomeHero({
  image,
  imageSlug,
  height,
  eyebrow,
  title,
  subtitle,
  cta,
  onCta,
  ctaLoading = false,
  ctaDisabled = false,
  secondaryLabel,
  onSecondary,
  secondaryRef,
  menuRef,
  onMenu,
  children,
  style,
}: {
  image?: ImageSourcePropType | null;
  /** Manifest slug. When set, this is the photo. */
  imageSlug?: string | null;
  height: number;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  onCta: () => void;
  ctaLoading?: boolean;
  ctaDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryRef?: Ref<AnchorHandle>;
  menuRef?: Ref<AnchorHandle>;
  onMenu?: () => void;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, spacing } = useTheme();
  return (
    <View style={[{ borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colours.surfaceMuted }, style]}>
      <View style={{ height, backgroundColor: colours.surfaceMuted }}>
        <PhotoFill slug={imageSlug} source={imageSlug ? null : image} kind="people" label={title} />
        <View style={[styles.heroFade, { backgroundColor: colours.overlay }]} />
        <View style={[styles.heroCopy, { padding: spacing.lg, gap: spacing.sm }]}>
          <View style={styles.heroHeading}>
            <View style={styles.flex}>
              <AppText variant="eyebrow" style={{ color: colours.onAccent }}>
                {eyebrow}
              </AppText>
              <AppText variant="display" style={{ color: colours.onAccent, marginTop: 6 }} numberOfLines={3}>
                {title}
              </AppText>
              <AppText variant="body" style={{ color: colours.onAccent, marginTop: 4 }} numberOfLines={3}>
                {subtitle}
              </AppText>
            </View>
            {onMenu ? (
              <View ref={menuRef} collapsable={false}>
                <IconButton
                  icon="ellipsis-horizontal"
                  variant="overlay"
                  accessibilityLabel="Session options"
                  onPress={onMenu}
                />
              </View>
            ) : null}
          </View>
          <PrimaryButton
            label={ctaLoading ? 'Starting…' : cta}
            onPress={onCta}
            loading={ctaLoading}
            disabled={ctaDisabled || ctaLoading}
          />
          {secondaryLabel && onSecondary ? (
            <View ref={secondaryRef} collapsable={false}>
              <Pressable
                onPress={onSecondary}
                accessibilityRole="button"
                style={{ alignSelf: 'flex-start' }}>
                <AppText variant="bodyStrong" style={{ color: colours.onAccent }}>
                  {secondaryLabel}
                </AppText>
              </Pressable>
            </View>
          ) : null}
          {children}
        </View>
      </View>
    </View>
  );
}

export type WeekStripDay = {
  iso: string;
  label: string;
  isToday: boolean;
  planned: boolean;
  completed: boolean;
};

export function WeekStripCard({
  days,
  onPressDay,
  todayCard,
  style,
}: {
  days: WeekStripDay[];
  onPressDay: (iso: string) => void;
  todayCard?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, spacing, shadow } = useTheme();
  if (days.length === 0) return null;
  return (
    <View style={[{ backgroundColor: colours.surface, borderRadius: radius.xl, padding: spacing.md }, shadow, style]}>
      <View style={styles.stripRow}>
        {days.map((day) => {
          const fill = day.isToday ? colours.brand : 'transparent';
          const ink = day.isToday ? colours.onBrand : colours.ink;
          return (
            <Pressable
              key={day.iso}
              onPress={() => onPressDay(day.iso)}
              accessibilityRole="button"
              accessibilityLabel={day.label}
              style={styles.stripDay}>
              <View
                style={[
                  styles.stripCircle,
                  { backgroundColor: fill, borderRadius: radius.full },
                  !day.isToday && [styles.stripCircleIdle, { borderColor: colours.border }],
                ]}>
                <AppText variant="caption" style={{ color: ink }}>
                  {day.label}
                </AppText>
              </View>
              {day.completed ? (
                <Ionicons name="checkmark" size={12} color={colours.brand} />
              ) : day.planned ? (
                <View style={[styles.stripDot, { backgroundColor: colours.brand }]} />
              ) : (
                <View style={styles.stripDotSpacer} />
              )}
            </Pressable>
          );
        })}
      </View>
      {todayCard}
    </View>
  );
}

export function WeekTodaySession({
  title,
  subtitle,
  image,
  imageSlug,
  onPress,
}: {
  title: string;
  subtitle: string;
  image?: ImageSourcePropType | null;
  imageSlug?: string | null;
  onPress: () => void;
}) {
  const { colours, radius, spacing } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.todayRow, pressed && styles.pressed]}>
      <View style={[styles.todayThumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}>
        <PhotoFill slug={imageSlug} source={imageSlug ? null : image} kind="people" label={title} />
      </View>
      <View style={styles.flex}>
        <AppText variant="title3" style={{ color: colours.ink }} numberOfLines={2}>
          {title}
        </AppText>
        <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }} numberOfLines={1}>
          {subtitle}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colours.inkMuted} />
    </Pressable>
  );
}

export function WeekTodayEmpty({ onExplore }: { onExplore: () => void }) {
  const { colours, spacing } = useTheme();
  return (
    <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
      <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
        {homeCopy.week_strip_empty}
      </AppText>
      <TextButton label={homeCopy.hero_nothing_planned.cta} onPress={onExplore} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

export function ChallengeHomeCard({
  name,
  timing,
  joined,
  image,
  imageSlug,
  onPress,
  style,
}: {
  name: string;
  timing: string;
  joined: boolean;
  image?: ImageSourcePropType | null;
  imageSlug?: string | null;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, spacing, shadow } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.challenge,
        { backgroundColor: colours.surface, borderRadius: radius.xl },
        shadow,
        pressed && styles.pressed,
        style,
      ]}>
      <View style={[styles.challengeThumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}>
        <PhotoFill slug={imageSlug} source={imageSlug ? null : image} kind="people" label={name} />
      </View>
      <View style={styles.flex}>
        <AppText variant="eyebrow" style={{ color: colours.accent }}>
          Challenge
        </AppText>
        <AppText variant="title3" style={{ color: colours.ink, marginTop: 4 }} numberOfLines={2}>
          {name}
        </AppText>
        <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }} numberOfLines={2}>
          {timing}
        </AppText>
        {joined ? null : (
          <TextButton label={challengesCopy.join} onPress={onPress} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
        )}
      </View>
    </Pressable>
  );
}

export function ReferralBanner({
  onInvite,
  onDismiss,
  image,
  imageSlug,
  style,
}: {
  onInvite: () => void;
  onDismiss: () => void;
  image?: ImageSourcePropType | null;
  imageSlug?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, spacing } = useTheme();
  return (
    <View style={[styles.refer, { backgroundColor: colours.accentSoft, borderRadius: radius.xl }, style]}>
      <View style={styles.flex}>
        <AppText variant="displaySm" style={{ color: colours.ink }}>
          {referCopy.banner_title}
        </AppText>
        <AppText variant="bodySm" style={{ color: colours.ink, marginTop: spacing.sm }}>
          {fillCopy(referCopy.banner_body, { friend_trial_days: FRIEND_TRIAL_DAYS })}
        </AppText>
        <Pressable
          onPress={onInvite}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.referPill,
            { backgroundColor: colours.surface, borderRadius: radius.full },
            pressed && styles.pressed,
          ]}>
          <AppText variant="bodyStrong" style={{ color: colours.brand }}>
            {referCopy.banner_cta}
          </AppText>
        </Pressable>
      </View>
      {image || imageSlug ? (
        <View style={[styles.referPhoto, { borderRadius: radius.lg, overflow: 'hidden' }]}>
          <PhotoFill slug={imageSlug} source={imageSlug ? null : image} kind="people" />
        </View>
      ) : null}
      <View style={styles.referClose}>
        <IconButton icon="close" accessibilityLabel="Dismiss" onPress={onDismiss} />
      </View>
    </View>
  );
}

export function RecapHomeCard({
  month,
  onOpen,
  onDismiss,
  style,
}: {
  month: string;
  onOpen: () => void;
  onDismiss: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, spacing, shadow } = useTheme();
  return (
    <View
      style={[
        styles.recapCard,
        { backgroundColor: colours.brand, borderRadius: radius.xl, padding: spacing.lg },
        shadow,
        style,
      ]}>
      <View style={styles.recapTop}>
        <AppText variant="eyebrow" style={{ color: colours.accent }}>
          {recapCopy.eyebrow}
        </AppText>
        <IconButton
          icon="close"
          variant="overlay"
          accessibilityLabel={recapCopy.dismiss}
          onPress={onDismiss}
        />
      </View>
      <AppText variant="displaySm" style={{ color: colours.onBrand, marginTop: spacing.xs }}>
        {fillCopy(recapCopy.card_title, { month })}
      </AppText>
      <AppText variant="bodySm" style={{ color: colours.brandSoft, marginTop: spacing.sm }}>
        {recapCopy.card_body}
      </AppText>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.recapCta,
          { backgroundColor: colours.surface, borderRadius: radius.full },
          pressed && styles.pressed,
        ]}>
        <AppText variant="bodyStrong" style={{ color: colours.brand }}>
          {recapCopy.card_cta}
        </AppText>
      </Pressable>
    </View>
  );
}

export function ShareStatsCard({
  sessions,
  personalBests,
  minutes,
  awards,
  onShare,
  style,
}: {
  sessions: number;
  personalBests: number;
  minutes: string;
  awards: number;
  onShare: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { spacing } = useTheme();
  return (
    <View style={style}>
      <SectionHeader title={homeCopy.section_week_so_far} actionLabel={homeCopy.share_week} onAction={onShare} />
      <View style={[styles.statsGrid, { gap: spacing.sm }]}>
        <StatTile value={String(sessions)} label="Sessions" icon="barbell-outline" style={styles.stat} />
        <StatTile value={String(personalBests)} label="Personal bests" icon="trophy-outline" style={styles.stat} />
        <StatTile value={minutes} label="Minutes" icon="time-outline" style={styles.stat} />
        <StatTile value={String(awards)} label="Awards" icon="ribbon-outline" style={styles.stat} />
      </View>
    </View>
  );
}

function familyIcon(family: AchievementFamily): ComponentProps<typeof Ionicons>['name'] {
  switch (family) {
    case 'first_times':
      return 'sparkles-outline';
    case 'sessions':
      return 'barbell-outline';
    case 'weeks':
      return 'calendar-outline';
    case 'consistency':
      return 'flame-outline';
    case 'personal_bests':
      return 'trophy-outline';
    case 'programmes':
      return 'ribbon-outline';
    case 'gym_unlocked':
      return 'walk-outline';
    case 'stretch':
      return 'leaf-outline';
    case 'weight_lifted':
      return 'fitness-outline';
  }
}

export function AwardsPreview({
  badges,
  onSeeAll,
  onOpen,
  style,
}: {
  badges: AchievementBadge[];
  onSeeAll: () => void;
  onOpen: (badge: AchievementBadge) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, spacing } = useTheme();
  if (badges.length === 0) return null;
  return (
    <View style={style}>
      <SectionHeader title={homeCopy.section_awards} actionLabel={homeCopy.see_all} onAction={onSeeAll} />
      <View style={styles.awardsRow}>
        {badges.slice(0, 3).map((badge) => (
          <Pressable
            key={badge.id}
            onPress={() => onOpen(badge)}
            accessibilityRole="button"
            accessibilityLabel={badge.title}
            style={styles.awardItem}>
            <View
              style={[
                styles.awardIcon,
                {
                  backgroundColor: badge.unlocked ? colours.brandSoft : colours.surfaceMuted,
                  borderRadius: radius.full,
                },
              ]}>
              <Ionicons
                name={familyIcon(badge.family)}
                size={22}
                color={badge.unlocked ? colours.brand : colours.inkSubtle}
              />
            </View>
            <AppText
              variant="caption"
              style={{ color: badge.unlocked ? colours.ink : colours.inkMuted, marginTop: spacing.xs, textAlign: 'center' }}
              numberOfLines={2}>
              {badge.title}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function pickAwardsPreview(badges: AchievementBadge[]): AchievementBadge[] {
  const earned = badges
    .filter((item) => item.unlocked)
    .sort((a, b) => (b.unlockedOn ?? '').localeCompare(a.unlockedOn ?? ''));
  const next = badges.filter((item) => !item.unlocked);
  const picked = [...earned.slice(0, 3)];
  for (const badge of next) {
    if (picked.length >= 3) break;
    picked.push(badge);
  }
  return picked;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
  },
  headerSpacer: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  heroFade: {
    ...StyleSheet.absoluteFill,
    opacity: 0.45,
  },
  heroCopy: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
  },
  heroHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  flex: {
    flex: 1,
  },
  stripRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stripDay: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  stripCircle: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripCircleIdle: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  stripDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stripDotSpacer: {
    width: 6,
    height: 6,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
  },
  todayThumb: {
    width: 64,
    height: 64,
    overflow: 'hidden',
  },
  challenge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  challengeThumb: {
    width: 88,
    height: 88,
    overflow: 'hidden',
  },
  refer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingRight: 12,
    gap: 12,
  },
  referPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 12,
  },
  referPhoto: {
    width: 72,
    height: 88,
  },
  referClose: {
    alignSelf: 'flex-start',
  },
  recapCard: {
    gap: 0,
  },
  recapTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recapCta: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  stat: {
    width: '48%',
    flexGrow: 1,
  },
  awardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  awardItem: {
    flex: 1,
    alignItems: 'center',
  },
  awardIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});
