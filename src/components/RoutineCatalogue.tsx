import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { AppText } from '@/components/ui/AppText';
import {
  Chip,
  ChipScroller,
  FreeBadge,
  IconButton,
  MenuHeader,
  MenuRow,
  OverflowMenu,
  PrimaryButton,
  ProBadge,
  ProgressBar,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import {
  challengeStatus,
  challengeTimingCopy,
  fetchChallenges,
  type Challenge,
} from '@/lib/challenges';
import { coverForRoutine, coverSources } from '@/lib/images';
import { openPaywall } from '@/lib/paywall';
import { fetchPaths, type RoutinePath } from '@/lib/paths';
import {
  DIFFICULTY_LABELS,
  ROUTINE_GOAL_LABELS,
  collectRoutineTags,
  formatTagLabel,
  endActiveEnrolment,
  currentEnrolmentWeek,
  describeRoutineError,
  fetchActiveEnrolment,
  fetchRoutineProgressMap,
  fetchRoutines,
  missingRoutinesMessage,
  type RoutineEnrolment,
  type RoutineProgress,
  type RoutineSummary,
} from '@/lib/routines';
import { useSubscription } from '@/lib/subscription';

type LoadState = 'loading' | 'error' | 'ready';

function coverImage(routine: Pick<RoutineSummary, 'id' | 'cover'>): ImageSourcePropType | null {
  return coverSources(coverForRoutine(routine))[0] ?? null;
}

export function RoutineCatalogue({
  showTitle = true,
  bottomInset,
  routineType = 'strength',
}: {
  showTitle?: boolean;
  bottomInset?: number;
  routineType?: 'strength' | 'stretch';
}) {
  const insets = useSafeAreaInsets();
  const paddingBottom = (bottomInset ?? insets.bottom) + 32;
  const { colours, spacing, radius, shadow } = useTheme();
  const subscription = useSubscription();
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [enrolment, setEnrolment] = useState<RoutineEnrolment | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [missingSql, setMissingSql] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [path, setPath] = useState<RoutinePath | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [progress, setProgress] = useState<Record<string, RoutineProgress>>({});
  const menuRef = useRef<AnchorHandle>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      (async () => {
        try {
          const [list, active, paths, challengeList, progressMap] = await Promise.all([
            fetchRoutines({ type: routineType }),
            fetchActiveEnrolment(),
            routineType === 'strength' ? fetchPaths().catch(() => []) : Promise.resolve([]),
            routineType === 'strength' ? fetchChallenges().catch(() => []) : Promise.resolve([]),
            routineType === 'strength' ? fetchRoutineProgressMap().catch(() => ({})) : Promise.resolve({}),
          ]);
          if (!isCurrent) return;
          setRoutines(list);
          setEnrolment(active);
          setPath(paths[0] ?? null);
          setChallenges(challengeList.filter((item) => challengeStatus(item) !== 'ended'));
          setProgress(progressMap);
          setMissingSql(list.length === 0);
          setLoadState('ready');
        } catch (error) {
          if (!isCurrent) return;
          const detail = error instanceof Error ? error.message : '';
          setMissingSql(/routines\.sql/i.test(detail));
          setLoadState((state) => (state === 'ready' ? state : 'error'));
        }
      })();
      return () => {
        isCurrent = false;
      };
    }, [attempt, routineType])
  );

  function requestLeave() {
    if (!enrolment) return;
    showDialog(
      `End ${enrolment.routine.name}?`,
      'Your logged sessions and progress stay. Upcoming planned sessions from this plan will be cleared.',
      [
        { text: 'End routine', style: 'destructive', onPress: handleLeave },
        { text: 'Keep this plan', style: 'cancel' },
      ]
    );
  }

  async function handleLeave() {
    setIsLeaving(true);
    try {
      await endActiveEnrolment();
      setEnrolment(null);
    } catch (error) {
      showDialog('Couldn’t end the routine', describeRoutineError(error));
    } finally {
      setIsLeaving(false);
    }
  }

  function openDetails(summary: RoutineSummary) {
    if (routineType === 'stretch') {
      router.push({ pathname: '/stretches/[id]', params: { id: summary.id } } as Href);
      return;
    }
    router.push({ pathname: '/routines/[id]', params: { id: summary.id } } as Href);
  }

  function openCurrentMenu() {
    measureAnchor(menuRef.current, (rect) => {
      setMenuAnchor(rect);
      setMenuOpen(true);
    });
  }

  const tags = collectRoutineTags(routines);
  const currentProgress = enrolment ? progress[enrolment.routine_id] : undefined;
  const currentWeek = enrolment ? currentEnrolmentWeek(enrolment) : 0;
  const currentBar =
    currentProgress && currentProgress.target > 0
      ? currentProgress.done / currentProgress.target
      : enrolment
        ? currentWeek / enrolment.routine.length_weeks
        : 0;

  return (
    <>
      <ScrollView
        style={[styles.scroll, { backgroundColor: colours.bg }]}
        contentContainerStyle={[styles.container, { paddingBottom }]}>
        {showTitle ? (
          <AppText variant="display" style={{ color: colours.ink, marginBottom: spacing.sm }}>
            {routineType === 'stretch' ? 'Stretches' : 'Routines'}
          </AppText>
        ) : null}

        {path && routineType === 'strength' ? (
          <Pressable
            onPress={() => {
              if (path.is_pro && !subscription.isPro) {
                openPaywall('path');
                return;
              }
              router.push({ pathname: '/paths/[id]', params: { id: path.id } } as Href);
            }}
            style={({ pressed }) => [pressed && styles.pressed]}
            accessibilityRole="button">
            <View style={[{ backgroundColor: colours.surface, borderRadius: radius.lg }, shadow]}>
              <View style={[styles.block, { borderRadius: radius.lg }]}>
                <View style={styles.rowBetween}>
                  <AppText variant="eyebrow" style={{ color: colours.accent }}>
                    Path
                  </AppText>
                  {path.is_pro && !subscription.isPro ? <ProBadge compact /> : null}
                </View>
                <AppText variant="title3" style={{ color: colours.ink, marginTop: spacing.sm }}>
                  {path.name}
                </AppText>
                <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
                  {path.steps.filter((step) => step.done).length} of {path.steps.length} routines finished
                </AppText>
              </View>
            </View>
          </Pressable>
        ) : null}

        {routineType === 'strength' &&
          challenges.map((challenge) => (
            <Pressable
              key={challenge.id}
              onPress={() =>
                router.push({ pathname: '/challenges/[id]', params: { id: challenge.id } } as Href)
              }
              style={({ pressed }) => [pressed && styles.pressed]}
              accessibilityRole="button">
              <View style={[{ backgroundColor: colours.surface, borderRadius: radius.lg }, shadow]}>
                <View style={[styles.block, { borderRadius: radius.lg }]}>
                  <View style={styles.rowBetween}>
                    <AppText variant="eyebrow" style={{ color: colours.accent }}>
                      Challenge
                    </AppText>
                    {challenge.is_pro && !subscription.isPro ? <ProBadge compact /> : null}
                  </View>
                  <AppText variant="title3" style={{ color: colours.ink, marginTop: spacing.sm }}>
                    {challenge.name}
                  </AppText>
                  <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
                    {challengeTimingCopy(challenge)}
                  </AppText>
                </View>
              </View>
            </Pressable>
          ))}

        {enrolment && routineType === 'strength' ? (
          <View style={[{ backgroundColor: colours.surface, borderRadius: radius.lg }, shadow]}>
            <View style={[styles.pin, { borderRadius: radius.lg }]}>
              <Pressable
                onPress={() => openDetails(enrolment.routine)}
                style={styles.pinMain}
                accessibilityRole="button">
                <Thumb image={coverImage(enrolment.routine)} letter={enrolment.routine.name} />
                <View style={styles.pinCopy}>
                  <AppText variant="eyebrow" style={{ color: colours.accent }}>
                    Current routine
                  </AppText>
                  <AppText variant="title3" style={{ color: colours.ink, marginTop: 4 }} numberOfLines={2}>
                    {enrolment.routine.name}
                  </AppText>
                  <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
                    {currentProgress
                      ? currentProgress.status === 'complete'
                        ? 'Finished'
                        : `${currentProgress.done} of ${currentProgress.target} sessions`
                      : `Week ${currentWeek} of ${enrolment.routine.length_weeks}`}
                  </AppText>
                  <ProgressBar progress={currentBar} style={{ marginTop: 10 }} />
                </View>
              </Pressable>
              <View ref={menuRef} collapsable={false}>
                <IconButton
                  icon="ellipsis-horizontal"
                  variant="muted"
                  accessibilityLabel="Routine options"
                  onPress={openCurrentMenu}
                />
              </View>
            </View>
          </View>
        ) : null}

        {loadState === 'loading' ? <ActivityIndicator color={colours.brand} style={styles.spinner} /> : null}

        {loadState === 'error' ? (
          <View style={[styles.block, { backgroundColor: colours.surface, borderRadius: radius.lg }]}>
            <AppText variant="title3" style={{ color: colours.ink }}>
              Couldn’t load routines
            </AppText>
            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: spacing.sm }}>
              {missingSql ? missingRoutinesMessage() : 'Check your connection and try again.'}
            </AppText>
            <PrimaryButton
              label="Try again"
              onPress={() => setAttempt((n) => n + 1)}
              style={{ marginTop: spacing.md }}
            />
          </View>
        ) : null}

        {loadState === 'ready' && missingSql ? (
          <View style={[styles.block, { backgroundColor: colours.brandSoft, borderRadius: radius.lg }]}>
            <AppText variant="title3" style={{ color: colours.ink }}>
              {routineType === 'stretch' ? 'Stretches aren’t in the database yet' : 'Routines aren’t in the database yet'}
            </AppText>
            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: spacing.sm }}>
              {routineType === 'stretch'
                ? 'Stretch routines need supabase/stretches.sql run in the Supabase SQL editor.'
                : missingRoutinesMessage()}
            </AppText>
          </View>
        ) : null}

        {routines.length > 0 ? (
          <ChipScroller style={styles.filters}>
            <Chip label="All" selected={tagFilter === null} onPress={() => setTagFilter(null)} />
            {tags.map((tag) => (
              <Chip
                key={tag}
                label={formatTagLabel(tag)}
                selected={tagFilter === tag}
                onPress={() => setTagFilter(tagFilter === tag ? null : tag)}
              />
            ))}
          </ChipScroller>
        ) : null}

        {routines
          .filter((summary) => !tagFilter || summary.tags.includes(tagFilter))
          .map((summary) => (
            <CatalogueCard
              key={summary.id}
              summary={summary}
              stretch={routineType === 'stretch'}
              showBadges={!subscription.isPro}
              onPress={() => openDetails(summary)}
            />
          ))}
      </ScrollView>

      <OverflowMenu visible={menuOpen} anchor={menuAnchor} onClose={() => setMenuOpen(false)}>
        <MenuHeader
          label={enrolment?.routine.name ?? 'Your routine'}
          detail="Your logged sessions stay if you end this plan."
        />
        <MenuRow
          label="View routine"
          onPress={() => {
            setMenuOpen(false);
            if (enrolment) openDetails(enrolment.routine);
          }}
        />
        <MenuRow
          label={isLeaving ? 'Ending…' : 'End routine'}
          danger
          onPress={() => {
            setMenuOpen(false);
            requestLeave();
          }}
        />
      </OverflowMenu>
    </>
  );
}

function CatalogueCard({
  summary,
  stretch,
  showBadges,
  onPress,
}: {
  summary: RoutineSummary;
  stretch: boolean;
  showBadges: boolean;
  onPress: () => void;
}) {
  const { colours, radius, shadow } = useTheme();
  const image = coverImage(summary);
  const eyebrow = stretch
    ? formatTagLabel(summary.tags[0] ?? 'Stretch')
    : `${DIFFICULTY_LABELS[summary.difficulty]} · ${ROUTINE_GOAL_LABELS[summary.goal]}`;
  const meta = stretch
    ? `${summary.session_minutes} min`
    : `${summary.length_weeks} weeks · ${summary.days_per_week} days / week`;
  const chips = summary.tags.filter((tag) => !stretch || tag !== summary.tags[0]).slice(0, 2);

  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
      <View style={[{ backgroundColor: colours.surface, borderRadius: radius.lg }, shadow]}>
        <View style={[styles.compact, { borderRadius: radius.lg }]}>
          <Thumb image={image} letter={summary.name} />
          <View style={styles.compactCopy}>
            <View style={styles.rowBetween}>
              <AppText variant="eyebrow" style={{ color: colours.inkMuted, flex: 1 }} numberOfLines={1}>
                {eyebrow}
              </AppText>
              {showBadges ? summary.is_pro ? <ProBadge compact /> : <FreeBadge /> : null}
            </View>
            <AppText variant="title3" style={{ color: colours.ink, marginTop: 4 }} numberOfLines={2}>
              {summary.name}
            </AppText>
            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 2 }} numberOfLines={1}>
              {meta}
            </AppText>
            {chips.length > 0 ? (
              <View style={styles.chipRow}>
                {chips.map((tag) => (
                  <Chip key={tag} label={formatTagLabel(tag)} />
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function Thumb({ image, letter }: { image: ImageSourcePropType | null; letter: string }) {
  const { colours, radius } = useTheme();
  return (
    <View style={[styles.thumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}>
      {image ? (
        <Image source={image} style={styles.thumbFill} resizeMode="cover" accessibilityLabel="" />
      ) : (
        <AppText variant="display" style={{ color: colours.brand }}>
          {letter.slice(0, 1)}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    padding: 24,
    paddingTop: 16,
    gap: 14,
  },
  spinner: {
    marginVertical: 24,
  },
  block: {
    padding: 16,
    overflow: 'hidden',
  },
  pin: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    overflow: 'hidden',
  },
  pinMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  pinCopy: {
    flex: 1,
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    overflow: 'hidden',
  },
  compactCopy: {
    flex: 1,
  },
  thumb: {
    width: 88,
    height: 88,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbFill: {
    width: '100%',
    height: '100%',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
    marginTop: 8,
    overflow: 'hidden',
  },
  filters: {
    marginHorizontal: -24,
    paddingHorizontal: 24,
  },
  pressed: {
    opacity: 0.92,
  },
});
