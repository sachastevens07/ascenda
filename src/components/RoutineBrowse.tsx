import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { CatalogueCard } from '@/components/RoutineCatalogue';
import {
  AppText,
  BuildPlanButton,
  IconButton,
  ImageCard,
  MenuHeader,
  MenuRow,
  OverlayImageCard,
  OverflowMenu,
  PrimaryButton,
  ProgressBar,
  SectionHeader,
  SingleSessionCard,
  StyleGrid,
  StyleTile,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { routineCardDays } from '@/lib/contentRoutines';
import { aiCopy, fillCopy, programmesCopy, routineActionsCopy } from '@/lib/copy';
import { ensureSubscribed } from '@/lib/paywall';
import { coverForRoutine, takeSlug } from '@/lib/images';
import {
  recommendedBrowseRoutine,
  routineMatchesStyle,
  singleMatchesStyle,
  startHereRoutines,
  stylesWithContent,
  type TrainingStyleId,
} from '@/lib/programmeBrowse';
import { useProfile } from '@/lib/profile';
import {
  currentEnrolmentWeek,
  describeRoutineError,
  endActiveEnrolment,
  fetchActiveEnrolment,
  fetchRoutineProgressMap,
  fetchRoutines,
  formatTagLabel,
  missingRoutinesMessage,
  type RoutineEnrolment,
  type RoutineProgress,
  type RoutineSummary,
} from '@/lib/routines';
import {
  describeSingleSessionError,
  featuredSingleSessions,
  listSingleSessions,
  startSingleSession,
  type SingleSession,
} from '@/lib/singleSessions';

type LoadState = 'loading' | 'error' | 'ready';
type BrowseView =
  | { kind: 'home' }
  | { kind: 'style'; style: TrainingStyleId; title: string }
  | { kind: 'start_here' }
  | { kind: 'singles' };

export function RoutineBrowse({
  bottomInset,
  onOpenStretches,
  onOpenCardio,
}: {
  bottomInset?: number;
  onOpenStretches: () => void;
  onOpenCardio?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const paddingBottom = (bottomInset ?? insets.bottom) + 32;
  const { width } = useWindowDimensions();
  const { colours, spacing, radius, shadow } = useTheme();
  const { profile } = useProfile();
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [enrolment, setEnrolment] = useState<RoutineEnrolment | null>(null);
  const [progress, setProgress] = useState<Record<string, RoutineProgress>>({});
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [missingSql, setMissingSql] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const [startingSlug, setStartingSlug] = useState<string | null>(null);
  const [view, setView] = useState<BrowseView>({ kind: 'home' });
  const singles = listSingleSessions();
  const featuredSingles = featuredSingleSessions();
  const menuRef = useRef<AnchorHandle>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const cardWidth = width * 0.42;

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      (async () => {
        try {
          const [list, active, progressMap] = await Promise.all([
            fetchRoutines({ type: 'strength' }),
            fetchActiveEnrolment(),
            fetchRoutineProgressMap().catch(() => ({})),
          ]);
          if (!isCurrent) return;
          setRoutines(list);
          setEnrolment(active);
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
    }, [attempt])
  );

  function openRoutine(summary: RoutineSummary) {
    router.push({ pathname: '/routines/[id]', params: { id: summary.id } } as Href);
  }

  function openSingle(session: SingleSession) {
    router.push({ pathname: '/singles/[slug]', params: { slug: session.slug } } as Href);
  }

  async function playSingle(session: SingleSession) {
    setStartingSlug(session.slug);
    try {
      await startSingleSession(session.slug);
    } catch (error) {
      const message = describeSingleSessionError(error);
      if (message) showDialog('Couldn’t start that session', message);
    } finally {
      setStartingSlug(null);
    }
  }

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

  const usedPhotos = new Set<string>();
  const recommended = recommendedBrowseRoutine(routines, profile);
  const startHere = startHereRoutines(routines).filter(
    (routine) => routine.id !== recommended?.id && routine.slug !== recommended?.slug
  );
  const trainingStyles = stylesWithContent(routines, singles);
  const currentProgress = enrolment ? progress[enrolment.routine_id] : undefined;
  const currentWeek = enrolment ? currentEnrolmentWeek(enrolment) : 0;
  const currentBar =
    currentProgress && currentProgress.target > 0
      ? currentProgress.done / currentProgress.target
      : enrolment
        ? currentWeek / enrolment.routine.length_weeks
        : 0;

  const recommendedSlug = recommended ? takeSlug(coverForRoutine(recommended)?.id, usedPhotos) : null;
  const styleSlugs = Object.fromEntries(
    trainingStyles.map((style) => [style.id, takeSlug(style.coverSlug, usedPhotos)])
  ) as Partial<Record<TrainingStyleId, string | null>>;

  function headerForView(): { title: string; onBack: () => void } | null {
    if (view.kind === 'home') return null;
    if (view.kind === 'style') return { title: view.title, onBack: () => setView({ kind: 'home' }) };
    if (view.kind === 'start_here') {
      return { title: programmesCopy.section_start_here, onBack: () => setView({ kind: 'home' }) };
    }
    return { title: programmesCopy.section_single_sessions, onBack: () => setView({ kind: 'home' }) };
  }

  const nested = headerForView();
  const styleRoutines =
    view.kind === 'style'
      ? routines.filter((routine) => routineMatchesStyle(routine, view.style))
      : view.kind === 'start_here'
        ? startHere
        : [];
  const styleSingles =
    view.kind === 'style'
      ? singles.filter((session) => singleMatchesStyle(session, view.style))
      : view.kind === 'singles'
        ? featuredSingles
        : view.kind === 'start_here'
          ? singles.filter((session) => session.category === 'start_here')
          : [];

  return (
    <>
      <ScrollView
        style={[styles.scroll, { backgroundColor: colours.bg }]}
        contentContainerStyle={[styles.container, { paddingBottom }]}>
        {nested ? (
          <View style={styles.nestedHead}>
            <IconButton icon="chevron-back" accessibilityLabel="Back" onPress={nested.onBack} />
            <AppText variant="title1" style={{ color: colours.ink, flex: 1 }} numberOfLines={1}>
              {nested.title}
            </AppText>
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
            <AppText variant="bodySm" style={{ color: colours.ink }}>
              {missingRoutinesMessage()}
            </AppText>
          </View>
        ) : null}

        {nested ? (
          <>
            {styleRoutines.map((summary) => (
              <CatalogueCard
                key={summary.id}
                summary={summary}
                stretch={false}
                usedPhotos={usedPhotos}
                onPress={() => openRoutine(summary)}
              />
            ))}
            {styleSingles.length > 0 ? (
              <View>
                {view.kind !== 'singles' ? (
                  <SectionHeader title={programmesCopy.section_single_sessions} />
                ) : null}
                <View style={styles.singleGrid}>
                  {styleSingles.map((session) => (
                    <SingleSessionCard
                      key={session.slug}
                      title={session.name}
                      minutes={session.estimated_minutes}
                      imageSlug={takeSlug(session.cover_image_slug, usedPhotos)}
                      onPress={() => openSingle(session)}
                      onPlay={() => {
                        if (startingSlug) return;
                        void playSingle(session);
                      }}
                      style={{ width: cardWidth }}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            {styleRoutines.length === 0 && styleSingles.length === 0 && loadState === 'ready' ? (
              <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
                {programmesCopy.empty_style}
              </AppText>
            ) : null}
          </>
        ) : (
          <>
            {enrolment ? (
              <View style={[{ backgroundColor: colours.surface, borderRadius: radius.lg }, shadow]}>
                <View style={[styles.pin, { borderRadius: radius.lg }]}>
                  <Pressable
                    onPress={() => openRoutine(enrolment.routine)}
                    style={styles.pinMain}
                    accessibilityRole="button">
                    <View style={styles.pinCopy}>
                      <AppText variant="eyebrow" style={{ color: colours.accent }}>
                        {programmesCopy.current_plan}
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
                      onPress={() =>
                        measureAnchor(menuRef.current, (rect) => {
                          setMenuAnchor(rect);
                          setMenuOpen(true);
                        })
                      }
                    />
                  </View>
                </View>
              </View>
            ) : null}

            {recommended ? (
              <View>
                <SectionHeader title={programmesCopy.section_recommended} />
                <OverlayImageCard
                  imageSlug={recommendedSlug}
                  eyebrow={programmesCopy.section_recommended}
                  title={recommended.name}
                  subtitle={`${recommended.length_weeks} weeks · ${routineCardDays(recommended)} days / week`}
                  onPress={() => openRoutine(recommended)}
                />
              </View>
            ) : null}

            <BuildPlanButton
              onPress={() => router.push({ pathname: '/onboarding', params: { rebuild: '1' } } as Href)}
            />
            <BuildPlanButton
              label={aiCopy.build_title}
              onPress={() => {
                if (!ensureSubscribed()) return;
                router.push('/build-session' as Href);
              }}
            />

            {trainingStyles.length > 0 ? (
              <View>
                <SectionHeader title={programmesCopy.section_styles} />
                <StyleGrid>
                  {trainingStyles.map((style) => (
                    <StyleTile
                      key={style.id}
                      label={style.label}
                      wide={style.wide}
                      imageSlug={styleSlugs[style.id]}
                      onPress={() => {
                        if (style.id === 'stretch') {
                          onOpenStretches();
                          return;
                        }
                        if (style.id === 'cardio' && onOpenCardio) {
                          onOpenCardio();
                          return;
                        }
                        setView({ kind: 'style', style: style.id, title: style.label });
                      }}
                    />
                  ))}
                </StyleGrid>
              </View>
            ) : null}

            {startHere.length > 0 ? (
              <View>
                <SectionHeader
                  title={programmesCopy.section_start_here}
                  actionLabel={programmesCopy.see_all}
                  onAction={() => setView({ kind: 'start_here' })}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carousel}
                  style={styles.carouselBleed}>
                  {startHere.map((routine) => (
                    <ImageCard
                      key={routine.id}
                      title={routine.name}
                      subtitle={`${routine.length_weeks} weeks · ${routineCardDays(routine)} days / week`}
                      tags={routine.tags.slice(0, 2).map(formatTagLabel)}
                      imageSlug={takeSlug(coverForRoutine(routine)?.id, usedPhotos)}
                      letter={routine.name.slice(0, 1)}
                      imageAspectRatio={16 / 10}
                      onPress={() => openRoutine(routine)}
                      style={{ width: width * 0.72 }}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {featuredSingles.length > 0 ? (
              <View>
                <SectionHeader
                  title={programmesCopy.section_single_sessions}
                  actionLabel={programmesCopy.see_all}
                  onAction={() => setView({ kind: 'singles' })}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carousel}
                  style={styles.carouselBleed}>
                  {featuredSingles.map((session) => (
                    <SingleSessionCard
                      key={session.slug}
                      title={session.name}
                      minutes={session.estimated_minutes}
                      imageSlug={takeSlug(session.cover_image_slug, usedPhotos)}
                      onPress={() => openSingle(session)}
                      onPlay={() => {
                        if (startingSlug) return;
                        void playSingle(session);
                      }}
                      style={{ width: cardWidth }}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <OverflowMenu visible={menuOpen} anchor={menuAnchor} onClose={() => setMenuOpen(false)}>
        <MenuHeader label={enrolment?.routine.name ?? 'Your routine'} />
        <MenuRow
          label="View routine"
          onPress={() => {
            setMenuOpen(false);
            if (enrolment) openRoutine(enrolment.routine);
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

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    padding: 24,
    paddingTop: 16,
    gap: 16,
  },
  spinner: {
    marginVertical: 24,
  },
  block: {
    padding: 16,
  },
  nestedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pin: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 16,
  },
  pinMain: {
    flex: 1,
  },
  pinCopy: {
    flex: 1,
  },
  carouselBleed: {
    marginHorizontal: -24,
    marginVertical: -8,
  },
  carousel: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    gap: 12,
  },
  singleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});
