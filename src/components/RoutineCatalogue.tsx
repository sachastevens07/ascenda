import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { AppText } from '@/components/ui/AppText';
import {
  Chip,
  ChipScroller,
  PhotoFill,
  IconButton,
  MenuHeader,
  MenuRow,
  OverflowMenu,
  PrimaryButton,
  ProgressBar,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import {
  challengeTimingCopy,
  fetchChallenges,
  type Challenge,
} from '@/lib/challenges';
import { routineCardDays } from '@/lib/contentRoutines';
import {
  STRETCH_AREAS,
  STRETCH_OCCASIONS,
  STRETCH_TIME_RANGES,
  contentStretch,
  stretchMatchesFilters,
  type StretchArea,
  type StretchOccasion,
  type StretchTimeRange,
} from '@/lib/contentStretches';
import { fillCopy, programmesCopy, routineActionsCopy, stretchMuscleLabel } from '@/lib/copy';
import { coverForChallenge, coverForRoutine, takeSlug } from '@/lib/images';
import { fetchPaths, type RoutinePath } from '@/lib/paths';
import {
  DIFFICULTY_LABELS,
  ROUTINE_GOAL_EYEBROWS,
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

type LoadState = 'loading' | 'error' | 'ready';

function uniqueCover(
  routine: Pick<RoutineSummary, 'id' | 'slug' | 'name' | 'type' | 'cover'>
): string | null {
  return coverForRoutine(routine)?.id ?? null;
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
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [enrolment, setEnrolment] = useState<RoutineEnrolment | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [missingSql, setMissingSql] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [stretchTime, setStretchTime] = useState<StretchTimeRange | null>(null);
  const [stretchArea, setStretchArea] = useState<StretchArea | null>(null);
  const [stretchOccasion, setStretchOccasion] = useState<StretchOccasion | null>(null);
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
          setChallenges(challengeList);
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
      fillCopy(routineActionsCopy.end_title, { routine_name: enrolment.routine.name }),
      routineActionsCopy.end_body,
      [
        { text: routineActionsCopy.end_cta, style: 'destructive', onPress: handleLeave },
        { text: routineActionsCopy.cancel, style: 'cancel' },
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

  const tags = routineType === 'strength' ? collectRoutineTags(routines) : [];
  const stretchList =
    routineType === 'stretch'
      ? routines.filter((summary) =>
          stretchMatchesFilters(summary.slug, {
            time: stretchTime,
            area: stretchArea,
            occasion: stretchOccasion,
          })
        )
      : routines.filter((summary) => !tagFilter || summary.tags.includes(tagFilter));
  const currentProgress = enrolment ? progress[enrolment.routine_id] : undefined;
  const currentWeek = enrolment ? currentEnrolmentWeek(enrolment) : 0;
  const currentBar =
    currentProgress && currentProgress.target > 0
      ? currentProgress.done / currentProgress.target
      : enrolment
        ? currentWeek / enrolment.routine.length_weeks
        : 0;
  const usedPhotos = new Set<string>();

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
                  </View>
                  <View style={styles.challengeRow}>
                    <Thumb imageSlug={takeSlug(coverForChallenge(challenge)?.id, usedPhotos)} letter={challenge.name} />
                    <View style={styles.flex}>
                      <AppText variant="title3" style={{ color: colours.ink }} numberOfLines={2}>
                        {challenge.name}
                      </AppText>
                      <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
                        {challengeTimingCopy(challenge)}
                      </AppText>
                    </View>
                  </View>
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
                <Thumb imageSlug={uniqueCover(enrolment.routine)} letter={enrolment.routine.name} />
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

        {routineType === 'stretch' && routines.length > 0 ? (
          <StretchFilterBar
            time={stretchTime}
            area={stretchArea}
            occasion={stretchOccasion}
            onTime={setStretchTime}
            onArea={setStretchArea}
            onOccasion={setStretchOccasion}
          />
        ) : null}

        {routineType === 'strength' && routines.length > 0 ? (
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

        {loadState === 'ready' &&
        routineType === 'stretch' &&
        routines.length > 0 &&
        stretchList.length === 0 ? (
          <AppText variant="body" style={{ color: colours.inkMuted }}>
            {programmesCopy.stretch_empty_filters}
          </AppText>
        ) : null}

        {stretchList.map((summary) => (
          <CatalogueCard
            key={summary.id}
            summary={summary}
            stretch={routineType === 'stretch'}
            onPress={() => openDetails(summary)}
          />
        ))}
      </ScrollView>

      <OverflowMenu visible={menuOpen} anchor={menuAnchor} onClose={() => setMenuOpen(false)}>
        <MenuHeader label={enrolment?.routine.name ?? 'Your routine'} />
        <MenuRow
          label="View routine"
          onPress={() => {
            setMenuOpen(false);
            if (enrolment) openDetails(enrolment.routine);
          }}
        />
        <MenuRow
          label={isLeaving ? 'Ending…' : routineActionsCopy.end_cta}
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

function StretchFilterBar({
  time,
  area,
  occasion,
  onTime,
  onArea,
  onOccasion,
}: {
  time: StretchTimeRange | null;
  area: StretchArea | null;
  occasion: StretchOccasion | null;
  onTime: (value: StretchTimeRange | null) => void;
  onArea: (value: StretchArea | null) => void;
  onOccasion: (value: StretchOccasion | null) => void;
}) {
  const timeLabels: Record<StretchTimeRange, string> = {
    under_5: programmesCopy.stretch_filter_under_5,
    '5_10': programmesCopy.stretch_filter_5_10,
    '10_20': programmesCopy.stretch_filter_10_20,
  };
  const areaLabels: Record<StretchArea, string> = {
    full_body: programmesCopy.stretch_muscle_full_body,
    lower_body: programmesCopy.stretch_muscle_legs,
    upper_body: programmesCopy.stretch_muscle_upper_body,
    hips: programmesCopy.stretch_muscle_hips,
    back: programmesCopy.stretch_muscle_back,
  };
  const occasionLabels: Record<StretchOccasion, string> = {
    morning: programmesCopy.stretch_when_morning,
    pre_workout: programmesCopy.stretch_when_pre_workout,
    post_workout: programmesCopy.stretch_when_post_workout,
    evening: programmesCopy.stretch_when_evening,
  };

  return (
    <View style={styles.filterGroups}>
      <FilterChipRow
        group={programmesCopy.stretch_filter_time}
        options={STRETCH_TIME_RANGES.map((id) => ({ id, label: timeLabels[id] }))}
        selected={time}
        onSelect={onTime}
      />
      <FilterChipRow
        group={programmesCopy.stretch_filter_muscle}
        options={STRETCH_AREAS.map((id) => ({ id, label: areaLabels[id] }))}
        selected={area}
        onSelect={onArea}
      />
      <FilterChipRow
        group={programmesCopy.stretch_filter_when}
        options={STRETCH_OCCASIONS.map((id) => ({ id, label: occasionLabels[id] }))}
        selected={occasion}
        onSelect={onOccasion}
      />
    </View>
  );
}

function FilterChipRow<T extends string>({
  group,
  options,
  selected,
  onSelect,
}: {
  group: string;
  options: { id: T; label: string }[];
  selected: T | null;
  onSelect: (value: T | null) => void;
}) {
  const { colours } = useTheme();
  return (
    <View style={styles.filterGroup} accessibilityRole="tablist" accessibilityLabel={group}>
      <AppText variant="eyebrow" style={{ color: colours.inkMuted }}>
        {group}
      </AppText>
      <View style={styles.filterWrap}>
        {options.map((option) => (
          <CompactFilterChip
            key={option.id}
            label={option.label}
            selected={selected === option.id}
            accessibilityLabel={`${group}: ${option.label}`}
            onPress={() => onSelect(selected === option.id ? null : option.id)}
          />
        ))}
      </View>
    </View>
  );
}

function CompactFilterChip({
  label,
  selected,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  selected: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { colours, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.filterChip,
        {
          borderRadius: radius.full,
          backgroundColor: selected ? colours.brandSoft : colours.surfaceMuted,
          borderWidth: selected ? 1.5 : 0,
          borderColor: colours.brand,
        },
      ]}>
      <AppText numberOfLines={1} variant="caption" style={{ color: selected ? colours.brand : colours.ink }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function CatalogueCard({
  summary,
  stretch,
  onPress,
}: {
  summary: RoutineSummary;
  stretch: boolean;
  onPress: () => void;
}) {
  const { colours, radius, shadow } = useTheme();
  const imageSlug = uniqueCover(summary);
  const stretchMeta = stretch ? contentStretch(summary.slug) : null;
  const eyebrow = stretch
    ? stretchMuscleLabel(stretchMeta?.area)
    : `${DIFFICULTY_LABELS[summary.difficulty]} · ${ROUTINE_GOAL_EYEBROWS[summary.goal]}`;
  const meta = stretch
    ? `${summary.session_minutes} min`
    : `${summary.length_weeks} weeks · ${routineCardDays(summary)} days a week`;
  const chips = stretch ? [] : summary.tags.slice(0, 2);

  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
      <View style={[{ backgroundColor: colours.surface, borderRadius: radius.lg }, shadow]}>
        <View style={[styles.compact, { borderRadius: radius.lg }]}>
          <Thumb imageSlug={imageSlug} letter={summary.name} />
          <View style={styles.compactCopy}>
            <View style={styles.rowBetween}>
              <AppText variant="eyebrow" style={{ color: colours.inkMuted, flex: 1 }} numberOfLines={1}>
                {eyebrow}
              </AppText>
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

function Thumb({ imageSlug, letter }: { imageSlug: string | null; letter: string }) {
  const { colours, radius } = useTheme();
  return (
    <View style={[styles.thumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}>
      <PhotoFill slug={imageSlug} kind="people" label={letter} />
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
    position: 'relative',
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
  challengeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 12,
  },
  flex: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
    marginTop: 8,
    overflow: 'hidden',
  },
  filterGroups: {
    gap: 8,
  },
  filterGroup: {
    gap: 4,
  },
  filterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterChip: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filters: {
    marginHorizontal: -24,
    paddingHorizontal: 24,
  },
  pressed: {
    opacity: 0.92,
  },
});
