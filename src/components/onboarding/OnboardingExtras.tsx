import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { CardChoiceList } from '@/components/onboarding/OnboardingInputs';
import { AppText, HeroImage, TextButton } from '@/components/ui';
import { equipmentIconColour, equipmentIconName } from '@/components/ui/ExerciseThumb';
import { useTheme } from '@/constants/theme';
import { contentPhaseForWeek, type ContentDay } from '@/lib/contentRoutines';
import type { Equipment } from '@/lib/exercises';
import { selectionTap, successTap } from '@/lib/haptics';
import { routineCoverSlug } from '@/lib/images';
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  exerciseEquipmentFromSlug,
  exerciseNameFromSlug,
  type Weekday,
} from '@/lib/onboardingAnswers';
import type { RecommendedPlan } from '@/lib/onboardingPlan';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const EQUIPMENT_SET = new Set(['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'band', 'bodyweight']);

function asEquipment(value: string | null | undefined): Equipment {
  return (value && EQUIPMENT_SET.has(value) ? value : 'machine') as Equipment;
}

function EquipmentIcon({ equipment, size = 40 }: { equipment: Equipment; size?: number }) {
  const { colours, radius, scheme } = useTheme();
  const tint = equipmentIconColour(equipment, colours, scheme);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.md,
        backgroundColor: tint.background,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <MaterialCommunityIcons name={equipmentIconName(equipment)} size={Math.round(size * 0.5)} color={tint.icon} />
    </View>
  );
}

/** Mon to Sun with her training days filled. Names show under each day when given. */
export function WeekPreview({
  title,
  days,
  names,
  restLabel,
}: {
  title?: string;
  days: Weekday[];
  names?: Partial<Record<Weekday, string>>;
  restLabel: string;
}) {
  const { colours, radius } = useTheme();
  return (
    <View style={{ marginTop: 20 }}>
      {title ? (
        <AppText variant="eyebrow" style={{ color: colours.accent, marginBottom: 10 }}>
          {title}
        </AppText>
      ) : null}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((day) => {
          const on = days.includes(day);
          return (
            <View key={day} style={styles.weekCell}>
              <AppText variant="caption" style={{ color: colours.inkMuted, marginBottom: 6 }}>
                {WEEKDAY_LABELS[day].slice(0, 1)}
              </AppText>
              <View
                style={[
                  styles.weekDot,
                  {
                    borderRadius: radius.md,
                    backgroundColor: on ? colours.brand : colours.surfaceMuted,
                  },
                ]}>
                {on ? (
                  <MaterialCommunityIcons name="dumbbell" size={16} color={colours.onBrand} />
                ) : null}
              </View>
              <AppText
                variant="caption"
                numberOfLines={2}
                style={{
                  color: on ? colours.ink : colours.inkMuted,
                  marginTop: 6,
                  textAlign: 'center',
                  fontSize: 10,
                  lineHeight: 13,
                }}>
                {on ? names?.[day] ?? '' : restLabel}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Her strength days in week order, matched to the routine's day names (Lower A, Upper A...). */
export function sessionNamesForDays(plan: RecommendedPlan, days: Weekday[]): Partial<Record<Weekday, string>> {
  const overlay = plan.recommended.overlay;
  const phase = contentPhaseForWeek(overlay, 1) ?? overlay.phases[0];
  const order = overlay.weekly_plan?.strength_days.length
    ? overlay.weekly_plan.strength_days
    : (phase?.days ?? []).map((day) => day.key);
  const byKey = new Map((phase?.days ?? []).map((day) => [day.key, day.name]));
  const sorted = WEEKDAYS.filter((day) => days.includes(day));
  const names: Partial<Record<Weekday, string>> = {};
  sorted.forEach((day, index) => {
    const key = order[index];
    const name = key ? byKey.get(key) : undefined;
    if (name) names[day] = name;
  });
  return names;
}

export function firstSessionOf(plan: RecommendedPlan): ContentDay | null {
  const overlay = plan.recommended.overlay;
  const phase = contentPhaseForWeek(overlay, 1) ?? overlay.phases[0];
  if (!phase) return null;
  const firstKey = overlay.weekly_plan?.strength_days[0];
  return phase.days.find((day) => day.key === firstKey) ?? phase.days[0] ?? null;
}

function repsLabel(min: number | null, max: number | null): string {
  if (min && max && min !== max) return `${min} to ${max}`;
  return String(max ?? min ?? '');
}

export type PlanRevealCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  statsLine: string;
  weekTitle: string;
  restLabel: string;
  firstTitle: string;
  firstMeta: string;
  moreExercises: string;
  whyTitle: string;
  timelineTitle: string;
  estimateLabel: string;
  alternativesTitle: string;
  alternativesToggle: string;
};

/** The payoff screen: her plan, her week, her first session, why it suits her, what to look forward to. */
export function PlanRevealV2({
  plan,
  days,
  copy,
  chosenSlug,
  onChoose,
}: {
  plan: RecommendedPlan;
  days: Weekday[];
  copy: PlanRevealCopy;
  chosenSlug: string;
  onChoose: (slug: string) => void;
}) {
  const { colours, radius, shadow } = useTheme();
  const [showOthers, setShowOthers] = useState(false);
  const first = firstSessionOf(plan);
  const names = sessionNamesForDays(plan, days);
  const exercises = first?.exercises ?? [];
  const shown = exercises.slice(0, 5);
  const coverSlug = routineCoverSlug({ slug: plan.recommended.slug, name: plan.recommended.name });
  const card = [styles.card, { backgroundColor: colours.surface, borderRadius: radius.xl }, shadow];

  return (
    <View>
      <HeroImage
        imageSlug={coverSlug}
        eyebrow={copy.eyebrow}
        title={copy.title}
        height={230}
        style={{ marginHorizontal: -24, marginBottom: 14 }}
      />
      <AppText variant="bodyStrong" style={{ color: colours.brand }}>
        {copy.statsLine}
      </AppText>
      {copy.subtitle ? (
        <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 6 }}>
          {copy.subtitle}
        </AppText>
      ) : null}

      <WeekPreview title={copy.weekTitle} days={days} names={names} restLabel={copy.restLabel} />

      {first ? (
        <View style={[card, { marginTop: 20 }]}>
          <AppText variant="eyebrow" style={{ color: colours.accent }}>
            {copy.firstTitle}
          </AppText>
          <AppText variant="title3" style={{ color: colours.ink, marginTop: 4 }}>
            {first.name}
          </AppText>
          <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 2 }}>
            {copy.firstMeta}
          </AppText>
          <View style={{ marginTop: 12, gap: 10 }}>
            {shown.map((slot) => (
              <View key={`${slot.slug}-${slot.role}`} style={styles.exerciseRow}>
                <EquipmentIcon equipment={asEquipment(exerciseEquipmentFromSlug(slot.slug))} size={38} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" style={{ color: colours.ink }} numberOfLines={1}>
                    {exerciseNameFromSlug(slot.slug)}
                  </AppText>
                  {slot.sets ? (
                    <AppText variant="caption" style={{ color: colours.inkMuted }}>
                      {slot.sets} sets of {repsLabel(slot.rep_min, slot.rep_max)}
                    </AppText>
                  ) : null}
                </View>
              </View>
            ))}
            {exercises.length > shown.length ? (
              <AppText variant="caption" style={{ color: colours.inkMuted }}>
                {copy.moreExercises.replace('{count}', String(exercises.length - shown.length))}
              </AppText>
            ) : null}
          </View>
        </View>
      ) : null}

      {plan.why.length > 0 ? (
        <View style={{ marginTop: 22 }}>
          <AppText variant="title3" style={{ color: colours.ink, marginBottom: 10 }}>
            {copy.whyTitle}
          </AppText>
          {plan.why.map((line) => (
            <View key={line} style={styles.whyRow}>
              <Ionicons name="checkmark-circle" size={22} color={colours.success} />
              <AppText variant="body" style={{ color: colours.ink, flex: 1 }}>
                {line}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      {plan.milestones.length > 0 ? (
        <View style={{ marginTop: 22 }}>
          <AppText variant="title3" style={{ color: colours.ink, marginBottom: 12 }}>
            {copy.timelineTitle}
          </AppText>
          {plan.milestones.map((item, index) => {
            const last = index === plan.milestones.length - 1;
            return (
              <View key={`${item.week}-${item.title}`} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View style={[styles.timelineDot, { backgroundColor: last ? colours.brand : colours.brandSoft, borderColor: colours.brand }]} />
                  {!last ? <View style={[styles.timelineLine, { backgroundColor: colours.brandSoft }]} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: last ? 0 : 16 }}>
                  <AppText variant="eyebrow" style={{ color: colours.accent }}>
                    Week {item.week}
                  </AppText>
                  <AppText variant="bodyStrong" style={{ color: colours.ink, marginTop: 2 }}>
                    {item.title}
                  </AppText>
                  {item.description ? (
                    <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 2 }}>
                      {item.description}
                    </AppText>
                  ) : null}
                </View>
              </View>
            );
          })}
          <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 8 }}>
            {copy.estimateLabel}
          </AppText>
        </View>
      ) : null}

      {plan.alternatives.length > 0 ? (
        <View style={{ marginTop: 18 }}>
          {showOthers ? (
            <>
              <AppText variant="title3" style={{ color: colours.ink, marginBottom: 8 }}>
                {copy.alternativesTitle}
              </AppText>
              <CardChoiceList
                options={[plan.recommended, ...plan.alternatives].map((item) => ({
                  value: item.slug,
                  label: item.name,
                  sub: item.subtitle,
                }))}
                value={chosenSlug}
                onChange={onChoose}
              />
            </>
          ) : (
            <TextButton label={copy.alternativesToggle} onPress={() => setShowOthers(true)} style={{ alignSelf: 'center' }} />
          )}
        </View>
      ) : null}
    </View>
  );
}

/** Press-and-hold commitment button. Fills a ring, then a success haptic and onDone. */
export function HoldToCommit({
  label,
  doneLabel,
  accessibilityLabel,
  durationMs,
  onDone,
}: {
  label: string;
  doneLabel: string;
  accessibilityLabel: string;
  durationMs: number;
  onDone: () => void;
}) {
  const { colours } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);
  const size = 148;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  function complete() {
    if (doneRef.current) return;
    doneRef.current = true;
    setDone(true);
    successTap();
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.08, friction: 4, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
    setTimeout(onDone, 650);
  }

  function start() {
    if (doneRef.current) return;
    selectionTap();
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true }).start();
    Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) complete();
    });
  }

  function cancel() {
    if (doneRef.current) return;
    progress.stopAnimation();
    Animated.parallel([
      Animated.timing(progress, { toValue: 0, duration: 220, useNativeDriver: false }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
    ]).start();
  }

  return (
    <View style={{ alignItems: 'center', marginTop: 26 }}>
      <Pressable
        onPressIn={start}
        onPressOut={cancel}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={() => complete()}>
        <Animated.View style={{ width: size, height: size, transform: [{ scale }] }}>
          <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={colours.brandSoft} strokeWidth={stroke} fill="none" />
            <AnimatedCircle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={colours.brand}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={progress.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] })}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </Svg>
          <View
            style={[
              styles.holdInner,
              {
                margin: stroke + 6,
                borderRadius: size,
                backgroundColor: done ? colours.success : colours.brand,
              },
            ]}>
            <Ionicons name={done ? 'checkmark' : 'finger-print'} size={34} color={colours.onBrand} />
          </View>
        </Animated.View>
      </Pressable>
      <AppText variant="bodyStrong" style={{ color: done ? colours.success : colours.brand, marginTop: 12 }}>
        {done ? doneLabel : label}
      </AppText>
    </View>
  );
}

export function AccountField({
  label,
  value,
  onChange,
  placeholder,
  secure,
  email,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  secure?: boolean;
  email?: boolean;
}) {
  const { colours, radius } = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      <AppText variant="bodySm" style={{ color: colours.ink, marginBottom: 6 }}>
        {label}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colours.inkMuted}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={email ? 'email-address' : 'default'}
        autoComplete={email ? 'email' : secure ? 'new-password' : 'off'}
        textContentType={email ? 'emailAddress' : secure ? 'newPassword' : 'none'}
        style={[
          styles.input,
          { color: colours.ink, backgroundColor: colours.surfaceMuted, borderRadius: radius.lg },
        ]}
      />
    </View>
  );
}

// ---------- Live previews: short glimpses of the real app, shown after a matching answer ----------

type Demo = Record<string, unknown>;

function demoText(demo: Demo, key: string): string {
  const value = demo[key];
  return typeof value === 'string' ? value : '';
}

function useSequence(steps: number, stepMs: number, startDelay = 500): [Animated.Value[], () => void] {
  const values = useRef(Array.from({ length: steps }, () => new Animated.Value(0))).current;
  const play = () => {
    values.forEach((value) => value.setValue(0));
    Animated.sequence([
      Animated.delay(startDelay),
      Animated.stagger(
        stepMs,
        values.map((value) =>
          Animated.timing(value, {
            toValue: 1,
            duration: 380,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          })
        )
      ),
    ]).start();
  };
  useEffect(() => {
    play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [values, play];
}

function PhoneFrame({ children }: { children: ReactNode }) {
  const { colours, radius, shadow } = useTheme();
  return (
    <View
      style={[
        styles.phone,
        { backgroundColor: colours.bg, borderColor: colours.border, borderRadius: radius.xl + 6 },
        shadow,
      ]}>
      {children}
    </View>
  );
}

function GuideDemo({ demo }: { demo: Demo }) {
  const { colours, radius } = useTheme();
  const steps = Array.isArray(demo.steps) ? (demo.steps as unknown[]).map(String) : [];
  const [values, replay] = useSequence(steps.length, 650);
  const labels = ['Where to find it', 'Set it up', 'Focus on'];
  return (
    <>
      <PhoneFrame>
        <View style={styles.demoHeader}>
          <EquipmentIcon equipment={asEquipment(demoText(demo, 'equipment'))} size={44} />
          <View style={{ flex: 1 }}>
            <AppText variant="title3" style={{ color: colours.ink }}>
              {demoText(demo, 'exercise')}
            </AppText>
            <View style={[styles.pill, { backgroundColor: colours.brandSoft, borderRadius: radius.full }]}>
              <AppText variant="caption" style={{ color: colours.brand, fontWeight: '700' }}>
                First-time guide
              </AppText>
            </View>
          </View>
        </View>
        {steps.map((step, index) => (
          <Animated.View
            key={step}
            style={[
              styles.guideStep,
              {
                backgroundColor: colours.surface,
                borderRadius: radius.lg,
                opacity: values[index],
                transform: [{ translateY: values[index].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
              },
            ]}>
            <View style={[styles.stepNumber, { backgroundColor: colours.brand }]}>
              <AppText variant="caption" style={{ color: colours.onBrand, fontWeight: '700' }}>
                {index + 1}
              </AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" style={{ color: colours.accent, fontWeight: '700' }}>
                {labels[index] ?? ''}
              </AppText>
              <AppText variant="bodySm" style={{ color: colours.ink }}>
                {step}
              </AppText>
            </View>
          </Animated.View>
        ))}
      </PhoneFrame>
      <TextButton label="Play again" onPress={replay} style={styles.replay} />
    </>
  );
}

function SwapDemo({ demo }: { demo: Demo }) {
  const { colours, radius } = useTheme();
  const swapPress = useRef(new Animated.Value(1)).current;
  const outgoing = useRef(new Animated.Value(0)).current;
  const incoming = useRef(new Animated.Value(0)).current;

  const play = () => {
    swapPress.setValue(1);
    outgoing.setValue(0);
    incoming.setValue(0);
    Animated.sequence([
      Animated.delay(900),
      Animated.sequence([
        Animated.timing(swapPress, { toValue: 0.88, duration: 140, useNativeDriver: true }),
        Animated.timing(swapPress, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]),
      Animated.timing(outgoing, { toValue: 1, duration: 380, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(incoming, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  };
  useEffect(() => {
    play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PhoneFrame>
        <AppText variant="caption" style={{ color: colours.inkMuted, marginBottom: 8 }}>
          Today · Lower body
        </AppText>
        <View style={{ height: 112 }}>
          <Animated.View
            style={[
              styles.swapCard,
              {
                backgroundColor: colours.surface,
                borderRadius: radius.lg,
                opacity: outgoing.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                transform: [{ translateX: outgoing.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) }],
              },
            ]}>
            <EquipmentIcon equipment={asEquipment(demoText(demo, 'from_equipment'))} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                {demoText(demo, 'from_name')}
              </AppText>
              <View style={[styles.pill, { backgroundColor: colours.accentSoft, borderRadius: radius.full }]}>
                <AppText variant="caption" style={{ color: colours.accent, fontWeight: '700' }}>
                  {demoText(demo, 'taken_label')}
                </AppText>
              </View>
            </View>
            <Animated.View
              style={[
                styles.swapButton,
                { backgroundColor: colours.brand, borderRadius: radius.full, transform: [{ scale: swapPress }] },
              ]}>
              <Ionicons name="swap-horizontal" size={14} color={colours.onBrand} />
              <AppText variant="caption" style={{ color: colours.onBrand, fontWeight: '700' }}>
                {demoText(demo, 'action_label')}
              </AppText>
            </Animated.View>
          </Animated.View>
          <Animated.View
            style={[
              styles.swapCard,
              {
                backgroundColor: colours.surface,
                borderRadius: radius.lg,
                borderWidth: 1.5,
                borderColor: colours.success,
                opacity: incoming,
                transform: [{ translateX: incoming.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }],
              },
            ]}>
            <EquipmentIcon equipment={asEquipment(demoText(demo, 'to_equipment'))} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                {demoText(demo, 'to_name')}
              </AppText>
              <View style={styles.noteRow}>
                <Ionicons name="checkmark-circle" size={14} color={colours.success} />
                <AppText variant="caption" style={{ color: colours.success, fontWeight: '700' }}>
                  {demoText(demo, 'to_note')}
                </AppText>
              </View>
            </View>
          </Animated.View>
        </View>
      </PhoneFrame>
      <TextButton label="Play again" onPress={play} style={styles.replay} />
    </>
  );
}

function MissedDemo({ demo }: { demo: Demo }) {
  const { colours, radius } = useTheme();
  const [cellWidth, setCellWidth] = useState(0);
  const press = useRef(new Animated.Value(1)).current;
  const move = useRef(new Animated.Value(0)).current;
  const [moved, setMoved] = useState(false);
  const fromDay = demoText(demo, 'from_day') as Weekday;
  const toDay = demoText(demo, 'to_day') as Weekday;
  const fromIndex = Math.max(0, WEEKDAYS.indexOf(fromDay));
  const toIndex = Math.max(0, WEEKDAYS.indexOf(toDay));

  const play = () => {
    setMoved(false);
    press.setValue(1);
    move.setValue(0);
    Animated.sequence([
      Animated.delay(1100),
      Animated.timing(press, { toValue: 0.9, duration: 140, useNativeDriver: true }),
      Animated.timing(press, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.timing(move, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setMoved(true);
    });
  };
  useEffect(() => {
    play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PhoneFrame>
        <View
          style={styles.weekRow}
          onLayout={(event) => setCellWidth(event.nativeEvent.layout.width / 7)}>
          {WEEKDAYS.map((day) => (
            <View key={day} style={styles.weekCell}>
              <AppText variant="caption" style={{ color: colours.inkMuted, marginBottom: 6 }}>
                {WEEKDAY_LABELS[day].slice(0, 1)}
              </AppText>
              <View style={[styles.weekDot, { borderRadius: radius.md, backgroundColor: colours.surfaceMuted }]} />
            </View>
          ))}
          {cellWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.movingDot,
                {
                  left: fromIndex * cellWidth + (cellWidth - 34) / 2,
                  borderRadius: radius.md,
                  backgroundColor: colours.brand,
                  transform: [
                    {
                      translateX: move.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, (toIndex - fromIndex) * cellWidth],
                      }),
                    },
                  ],
                },
              ]}>
              <MaterialCommunityIcons name="dumbbell" size={16} color={colours.onBrand} />
            </Animated.View>
          ) : null}
        </View>
        <View style={[styles.missedCard, { backgroundColor: colours.surface, borderRadius: radius.lg }]}>
          {moved ? (
            <View style={styles.noteRow}>
              <Ionicons name="checkmark-circle" size={18} color={colours.success} />
              <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                {demoText(demo, 'session')} moved. See you then.
              </AppText>
            </View>
          ) : (
            <>
              <AppText variant="caption" style={{ color: colours.accent, fontWeight: '700' }}>
                {demoText(demo, 'card_title')}
              </AppText>
              <AppText variant="bodySm" style={{ color: colours.ink, marginTop: 2 }}>
                {demoText(demo, 'card_body')}
              </AppText>
              <Animated.View
                style={[
                  styles.missedButton,
                  { backgroundColor: colours.brand, borderRadius: radius.full, transform: [{ scale: press }] },
                ]}>
                <AppText variant="caption" style={{ color: colours.onBrand, fontWeight: '700' }}>
                  {demoText(demo, 'action_label')}
                </AppText>
              </Animated.View>
            </>
          )}
        </View>
      </PhoneFrame>
      <TextButton label="Play again" onPress={play} style={styles.replay} />
    </>
  );
}

export function PreviewGlimpse({ kind, demo }: { kind: string; demo: Demo }) {
  if (kind === 'guide') return <GuideDemo demo={demo} />;
  if (kind === 'swap') return <SwapDemo demo={demo} />;
  if (kind === 'missed') return <MissedDemo demo={demo} />;
  return null;
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  weekRow: { flexDirection: 'row' },
  weekCell: { flex: 1, alignItems: 'center' },
  weekDot: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  movingDot: {
    position: 'absolute',
    top: 22,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  whyRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 10 },
  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineRail: { width: 16, alignItems: 'center' },
  timelineDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginTop: 2 },
  timelineLine: { width: 2, flex: 1, marginTop: 2 },
  holdInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 54, paddingHorizontal: 16, fontSize: 16 },
  phone: { borderWidth: 1, padding: 16, marginTop: 20, gap: 10 },
  demoHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  guideStep: { flexDirection: 'row', gap: 10, padding: 12, alignItems: 'flex-start' },
  stepNumber: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  swapCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  swapButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  missedCard: { padding: 14, marginTop: 6 },
  missedButton: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, marginTop: 10 },
  replay: { alignSelf: 'center', marginTop: 6 },
});
