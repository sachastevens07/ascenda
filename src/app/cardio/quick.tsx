import { router, type Href } from 'expo-router';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import {
  AppText,
  IconButton,
  PhotoFill,
  PrimaryButton,
  TextButton,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { track } from '@/lib/analytics';
import {
  beginCustomCardioSession,
  describeCardioError,
  isSessionInProgressError,
  type CardioMachineId,
} from '@/lib/cardio';
import {
  buildQuickCardioPlan,
  builderMachineLabel,
  cardioBuilderSpec,
  machineImageSlug,
  quickStartMinutesOptions,
  type QuickStartStyle,
} from '@/lib/cardioBuilderContent';
import { cardioCopy, fillCopy } from '@/lib/copy';
import { saveCustomCardioWorkout } from '@/lib/customWorkouts';
import { confirmFirstSessionSafety } from '@/lib/firstSession';
import { ensureSubscribed, useSubscriptionGate } from '@/lib/paywall';
import { routeForActiveSession } from '@/lib/startLogger';
import { useWorkout } from '@/lib/workout';

const spec = cardioBuilderSpec;
const MINUTE_ITEM = 58;
type Step = 'machine' | 'type' | 'minutes';

export default function QuickStartScreen() {
  const allowed = useSubscriptionGate();
  const insets = useSafeAreaInsets();
  const { colours, spacing, radius } = useTheme();
  const workout = useWorkout();
  const [step, setStep] = useState<Step>('machine');
  const [machineId, setMachineId] = useState<CardioMachineId | null>(null);
  const [style, setStyle] = useState<QuickStartStyle | null>(null);
  const [minutes, setMinutes] = useState(spec.quickStart.minutes.default);
  const [includeWarmup, setIncludeWarmup] = useState(spec.quickStart.warmup.defaultOn);
  const [busy, setBusy] = useState<'start' | 'save' | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    track('cardio_builder_opened');
  }, []);

  if (!allowed) {
    return <View style={[styles.screen, { backgroundColor: colours.bg }]} />;
  }

  function goBack() {
    if (step === 'type') {
      setStep('machine');
      return;
    }
    if (step === 'minutes') {
      setStep('type');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/programmes', params: { section: 'cardio' } } as Href);
  }

  const title =
    step === 'machine'
      ? spec.quickStart.machineTitle
      : step === 'type'
        ? spec.quickStart.typeTitle
        : spec.quickStart.minutesTitle;

  function openActive(id: string, source?: string) {
    router.push(routeForActiveSession(id, source));
  }

  function currentPlan() {
    if (!machineId || !style) return null;
    return buildQuickCardioPlan({
      machineId,
      style,
      minutes,
      includeWarmup,
    });
  }

  async function handleStart() {
    if (!ensureSubscribed()) return;
    const plan = currentPlan();
    if (!plan) return;
    setBusy('start');
    try {
      const allowedSafety = await confirmFirstSessionSafety();
      if (!allowedSafety) return;
      const key = `${plan.slug}-${includeWarmup ? 'wu' : 'plain'}`;
      const started = await beginCustomCardioSession(plan, savedKey === key ? savedId : null);
      track('custom_cardio_started', { style: plan.style, minutes: plan.duration_minutes });
      workout.publish(
        {
          sessionId: started.id,
          dayName: plan.name,
          startedAt: Date.parse(started.started_at),
          source: 'cardio',
        },
        null
      );
      router.replace({ pathname: '/cardio/play', params: { sessionId: started.id } } as Href);
    } catch (error) {
      if (isSessionInProgressError(error) && error.activeId) {
        showDialog(cardioCopy.in_progress_title, cardioCopy.in_progress_body, [
          { text: cardioCopy.open_it, onPress: () => openActive(error.activeId, error.activeSource) },
          { text: 'OK', style: 'cancel' },
        ]);
        return;
      }
      showDialog(cardioCopy.not_found, describeCardioError(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    const plan = currentPlan();
    if (!plan) return;
    const key = `${plan.slug}-${includeWarmup ? 'wu' : 'plain'}`;
    if (savedKey === key) {
      showDialog(spec.quickStart.saved);
      return;
    }
    setBusy('save');
    try {
      const saved = await saveCustomCardioWorkout(plan);
      setSavedId(saved.id);
      setSavedKey(key);
      track('custom_cardio_saved');
      showDialog(spec.quickStart.saved);
    } catch (error) {
      showDialog(cardioCopy.not_found, describeCardioError(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg, paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <IconButton icon="chevron-back" accessibilityLabel="Back" onPress={goBack} />
        <AppText variant="eyebrow" style={{ color: colours.accent }}>
          {spec.quickStart.title}
        </AppText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + (step === 'minutes' ? 140 : 32),
          gap: spacing.md,
        }}>
        <AppText variant="display" style={{ color: colours.ink }}>
          {title}
        </AppText>

        {step === 'machine' ? (
          <View style={styles.machineGrid}>
            {spec.machinesOrder.map((id, index, list) => {
              const selected = machineId === id;
              const label = builderMachineLabel(id);
              const lastOdd = index === list.length - 1 && list.length % 2 === 1;
              return (
                <Fragment key={id}>
                  {lastOdd ? <View style={styles.machineSpacer} /> : null}
                  <Pressable
                    onPress={() => {
                      setMachineId(id);
                      setStep('type');
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={label}
                    style={styles.machineCell}>
                    <View
                      style={[
                        styles.machineInner,
                        {
                          backgroundColor: colours.surfaceMuted,
                          borderRadius: radius.lg,
                          borderColor: selected ? colours.brand : 'transparent',
                        },
                      ]}>
                      <View style={styles.machinePhoto}>
                        <PhotoFill slug={machineImageSlug(id)} kind="equipment" label={label} />
                      </View>
                      <AppText
                        variant="bodyStrong"
                        style={{ color: colours.ink, paddingVertical: 10, textAlign: 'center' }}
                        numberOfLines={1}>
                        {label}
                      </AppText>
                    </View>
                  </Pressable>
                </Fragment>
              );
            })}
          </View>
        ) : null}

        {step === 'type' ? (
          <View style={{ gap: 10 }}>
            {spec.quickStart.types.map((item) => {
              const selected = style === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setStyle(item.id);
                    setStep('minutes');
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.typeCard,
                    {
                      backgroundColor: selected ? colours.brandSoft : colours.surface,
                      borderRadius: radius.lg,
                      borderWidth: selected ? 1.5 : 0,
                      borderColor: colours.brand,
                    },
                  ]}>
                  <AppText variant="title3" style={{ color: selected ? colours.brand : colours.ink }}>
                    {item.label}
                  </AppText>
                  {item.sub ? (
                    <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
                      {item.sub}
                    </AppText>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {step === 'minutes' ? (
          <View style={{ gap: spacing.md }}>
            <MinutesWheel value={minutes} onChange={setMinutes} />
            <Pressable
              onPress={() => setIncludeWarmup((value) => !value)}
              accessibilityRole="switch"
              accessibilityState={{ checked: includeWarmup }}
              style={styles.toggleRow}>
              <AppText variant="body" style={{ color: colours.ink, flex: 1 }}>
                {spec.quickStart.warmup.label}
              </AppText>
              <Switch
                value={includeWarmup}
                onValueChange={setIncludeWarmup}
                trackColor={{ false: colours.border, true: colours.brand }}
                thumbColor={colours.surface}
              />
            </Pressable>
            <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
              {spec.quickStart.warmup.note}
            </AppText>
          </View>
        ) : null}
      </ScrollView>

      {step === 'minutes' ? (
        <View
          style={[
            styles.sticky,
            {
              paddingBottom: insets.bottom + 12,
              backgroundColor: colours.bg,
              borderTopColor: colours.border,
            },
          ]}>
          <PrimaryButton
            label={spec.quickStart.startButton}
            loading={busy === 'start'}
            disabled={busy !== null || !machineId || !style}
            onPress={() => void handleStart()}
          />
          <TextButton
            label={spec.quickStart.saveLink}
            onPress={() => void handleSave()}
            disabled={busy !== null}
            style={{ alignSelf: 'center' }}
          />
        </View>
      ) : null}
    </View>
  );
}

function MinutesWheel({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const { colours } = useTheme();
  const options = useMemo(() => quickStartMinutesOptions(spec), []);
  const listRef = useRef<ScrollViewInstance>(null);
  const ready = useRef(false);

  useEffect(() => {
    const index = Math.max(0, options.indexOf(value));
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ y: index * MINUTE_ITEM, animated: false });
      ready.current = true;
    });
    // Scroll to the default once. Later changes come from the wheel itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!ready.current) return;
    const index = Math.round(event.nativeEvent.contentOffset.y / MINUTE_ITEM);
    const next = options[Math.min(options.length - 1, Math.max(0, index))];
    if (next != null && next !== value) onChange(next);
  }

  return (
    <View style={styles.wheelWrap}>
      <View
        pointerEvents="none"
        style={[styles.wheelHighlight, { borderColor: colours.brand, backgroundColor: colours.brandSoft }]}
      />
      <ScrollView
        ref={listRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={MINUTE_ITEM}
        decelerationRate="fast"
        onMomentumScrollEnd={onScrollEnd}
        onScrollEndDrag={onScrollEnd}
        contentContainerStyle={{ paddingVertical: MINUTE_ITEM }}>
        {options.map((item) => {
          const selected = item === value;
          return (
            <Pressable
              key={item}
              onPress={() => {
                onChange(item);
                const index = options.indexOf(item);
                listRef.current?.scrollTo({ y: index * MINUTE_ITEM, animated: true });
              }}
              style={styles.wheelItem}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={fillCopy(spec.quickStart.minutesValue, { minutes: item })}>
              <AppText
                variant={selected ? 'title1' : 'title3'}
                style={{ color: selected ? colours.ink : colours.inkMuted, textAlign: 'center' }}
                numberOfLines={1}>
                {fillCopy(spec.quickStart.minutesValue, { minutes: item })}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  machineGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -5,
  },
  machineCell: {
    width: '50%',
    paddingHorizontal: 5,
    marginBottom: 10,
  },
  machineSpacer: {
    width: '25%',
  },
  machineInner: {
    overflow: 'hidden',
    borderWidth: 2,
  },
  machinePhoto: {
    width: '100%',
    aspectRatio: 4 / 3,
    overflow: 'hidden',
  },
  typeCard: {
    padding: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
  },
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  wheelWrap: {
    height: MINUTE_ITEM * 3,
    overflow: 'hidden',
  },
  wheelHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: MINUTE_ITEM,
    height: MINUTE_ITEM,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  wheelItem: {
    height: MINUTE_ITEM,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
