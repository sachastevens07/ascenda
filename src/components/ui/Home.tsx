import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode, Ref } from 'react';
import { Pressable, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AnchorHandle } from '@/components/AnchoredMenu';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';
import { challengesCopy, fillCopy, homeCopy, recapCopy, referCopy } from '@/lib/copy';
import type { AchievementBadge, AchievementFamily } from '@/lib/achievements';
import { referralOfferVars } from '@/lib/referrals';

import { PrimaryButton, TextButton } from './Buttons';
import { PhotoFill, StatTile } from './Cards';
import { CoachButton } from './CoachButton';
import { IconButton } from './IconButton';
import { SectionHeader } from './List';

export function HomeHeader({ leading }: { leading: ReactNode }) {
  return (
    <View style={styles.header}>
      {leading}
      <View style={styles.headerSpacer} />
      <CoachButton />
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
  leading,
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
  leading?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colours.surfaceMuted }, style]}>
      <View style={{ height, backgroundColor: colours.surfaceMuted }}>
        <PhotoFill slug={imageSlug} source={imageSlug ? null : image} kind="people" label={title} />
        <View style={[styles.heroTopFade, { height: insets.top + 56 }]} pointerEvents="none">
          <View style={[styles.heroFadeBand, { backgroundColor: 'rgba(44, 24, 16, 0.28)' }]} />
          <View style={[styles.heroFadeBand, { backgroundColor: 'rgba(44, 24, 16, 0.08)' }]} />
        </View>
        <View style={styles.heroFade} pointerEvents="none">
          <View style={[styles.heroFadeBand, { backgroundColor: 'rgba(44, 24, 16, 0.06)' }]} />
          <View style={[styles.heroFadeBand, { backgroundColor: 'rgba(44, 24, 16, 0.22)' }]} />
          <View style={[styles.heroFadeBand, { backgroundColor: 'rgba(44, 24, 16, 0.5)' }]} />
          <View style={[styles.heroFadeBand, { backgroundColor: 'rgba(44, 24, 16, 0.72)' }]} />
        </View>
        {leading ? (
          <View
            style={[styles.heroChrome, { paddingHorizontal: spacing.md, paddingTop: insets.top + spacing.sm }]}
            pointerEvents="box-none">
            <HomeHeader leading={leading} />
          </View>
        ) : null}
        <View
          style={[styles.heroCopy, { padding: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm }]}
          pointerEvents="box-none">
          <View style={styles.heroHeading}>
            <View style={styles.flex}>
              <AppText variant="eyebrow" style={[styles.heroText, { color: colours.onAccent }]}>
                {eyebrow}
              </AppText>
              <AppText
                variant="display"
                style={[styles.heroText, { color: colours.onAccent, marginTop: 6 }]}
                numberOfLines={3}>
                {title}
              </AppText>
              <AppText
                variant="body"
                style={[styles.heroText, { color: colours.onAccent, marginTop: 4 }]}
                numberOfLines={3}>
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
                <AppText variant="bodyStrong" style={[styles.heroText, { color: colours.onAccent }]}>
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

export function WeekTabSwitch({
  value,
  onChange,
}: {
  value: 'workouts' | 'meals';
  onChange: (value: 'workouts' | 'meals') => void;
}) {
  const { colours, radius } = useTheme();
  const tabs = [
    { id: 'workouts' as const, label: homeCopy.week_tab_workouts },
    { id: 'meals' as const, label: homeCopy.week_tab_meals },
  ];
  return (
    <View
      style={[styles.tabSwitch, { backgroundColor: colours.surfaceMuted, borderRadius: radius.full }]}
      accessibilityRole="tablist">
      {tabs.map((tab) => {
        const selected = value === tab.id;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[
              styles.tabSwitchItem,
              selected && { backgroundColor: colours.surface, borderRadius: radius.full },
            ]}>
            <AppText
              variant={selected ? 'bodyStrong' : 'bodySm'}
              style={{ color: selected ? colours.brand : colours.inkMuted, textAlign: 'center' }}>
              {tab.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function WeekStripCard({
  days,
  selectedIso,
  onPressDay,
  todayCard,
  style,
}: {
  days: WeekStripDay[];
  selectedIso?: string | null;
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
          const selected = selectedIso ? day.iso === selectedIso : day.isToday;
          const fill = selected ? colours.brand : 'transparent';
          const ink = selected ? colours.onBrand : colours.ink;
          const outline = !selected && day.isToday ? colours.brand : colours.border;
          return (
            <Pressable
              key={day.iso}
              onPress={() => onPressDay(day.iso)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={day.label}
              style={styles.stripDay}>
              <View
                style={[
                  styles.stripCircle,
                  { backgroundColor: fill, borderRadius: radius.full },
                  !selected && [styles.stripCircleIdle, { borderColor: outline }],
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

export function WeekTodayEmpty({
  onExplore,
  title,
  message,
  cta,
}: {
  onExplore: () => void;
  title?: string;
  message?: string;
  cta?: string;
}) {
  const { colours, spacing } = useTheme();
  return (
    <View style={{ marginTop: spacing.md, gap: spacing.sm, alignItems: 'center' }}>
      {title ? (
        <AppText variant="title3" style={{ color: colours.ink, textAlign: 'center' }}>
          {title}
        </AppText>
      ) : null}
      <AppText variant="bodySm" style={{ color: colours.inkMuted, textAlign: 'center' }}>
        {message ?? homeCopy.week_strip_empty}
      </AppText>
      <TextButton label={cta ?? homeCopy.hero_nothing_planned.cta} onPress={onExplore} />
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
  onPress,
  image,
  imageSlug,
  style,
}: {
  onPress: () => void;
  image?: ImageSourcePropType | null;
  imageSlug?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius } = useTheme();
  const title = fillCopy(referCopy.banner_title, referralOfferVars());
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${referCopy.banner_cta}`}
      style={({ pressed }) => [
        styles.refer,
        { backgroundColor: colours.accentSoft, borderRadius: radius.xl },
        pressed && styles.pressed,
        style,
      ]}>
      <View style={styles.flex}>
        <AppText variant="displaySm" style={{ color: colours.ink }}>
          {title}
        </AppText>
        <View style={[styles.referPill, { backgroundColor: colours.surface, borderRadius: radius.full }]}>
          <AppText variant="bodyStrong" style={{ color: colours.brand }}>
            {referCopy.banner_cta}
          </AppText>
        </View>
      </View>
      {image || imageSlug ? (
        <View style={[styles.referPhoto, { borderRadius: radius.lg, overflow: 'hidden' }]}>
          <PhotoFill slug={imageSlug} source={imageSlug ? null : image} kind="people" align="center" />
        </View>
      ) : null}
    </Pressable>
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
  strength,
  cardio,
  minutes,
  onShare,
  style,
}: {
  sessions: number;
  strength: number;
  cardio: number;
  minutes: number;
  onShare: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { spacing } = useTheme();
  return (
    <View style={style}>
      <SectionHeader title={homeCopy.section_week_so_far} actionLabel={homeCopy.share_week} onAction={onShare} />
      <View style={[styles.statsGrid, { gap: spacing.sm }]}>
        <StatTile value={String(sessions)} label={homeCopy.stat_sessions} icon="checkmark-circle-outline" style={styles.stat} />
        <StatTile value={String(strength)} label={homeCopy.stat_strength} icon="barbell-outline" style={styles.stat} />
        <StatTile value={String(cardio)} label={homeCopy.stat_cardio} icon="bicycle-outline" style={styles.stat} />
        <StatTile value={String(minutes)} label={homeCopy.stat_minutes} icon="time-outline" style={styles.stat} />
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
    minHeight: 40,
  },
  headerSpacer: {
    flex: 1,
  },
  heroChrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  heroTopFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 72,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  heroFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '48%',
  },
  heroText: {
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  heroFadeBand: {
    flex: 1,
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
  tabSwitch: {
    flexDirection: 'row',
    alignSelf: 'center',
    padding: 4,
  },
  tabSwitchItem: {
    minWidth: 108,
    paddingHorizontal: 20,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
    width: 88,
    height: 88,
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
