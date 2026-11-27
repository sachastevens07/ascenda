import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { CardChoiceList } from '@/components/onboarding/OnboardingInputs';
import { AppText, HeroImage, PhotoFill, TextButton } from '@/components/ui';
import { equipmentIconColour, equipmentIconName } from '@/components/ui/ExerciseThumb';
import { fonts } from '@/constants/fonts';
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
import manifest from '../../../content/images/image-manifest.json';

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
  calendarTitle: string;
  calendarStart: string;
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

      <PlanCalendar title={copy.calendarTitle} days={days} startLabel={copy.calendarStart} />

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

      {/* Milestones are shown on the "Where it can take you" screen just before this one. */}
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
  const size = 120;
  const stroke = 7;
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
    <View style={{ alignItems: 'center', marginTop: 18 }}>
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
            <Ionicons name={done ? 'checkmark' : 'finger-print'} size={30} color={colours.onBrand} />
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

/** Plays a staggered reveal, holds it, then quietly plays it again while the screen is open. */
function useSequence(steps: number, stepMs: number, startDelay = 500): Animated.Value[] {
  const values = useRef(Array.from({ length: steps }, () => new Animated.Value(0))).current;
  const alive = useRef(true);
  const play = () => {
    if (!alive.current) return;
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
      Animated.delay(2600),
      Animated.parallel(
        values.map((value) => Animated.timing(value, { toValue: 0, duration: 250, useNativeDriver: true }))
      ),
    ]).start(({ finished }) => {
      if (finished) play();
    });
  };
  useEffect(() => {
    alive.current = true;
    play();
    return () => {
      alive.current = false;
      values.forEach((value) => value.stopAnimation());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return values;
}

/** Runs `play` now and again every `everyMs` while mounted. */
function useLoop(play: () => void, everyMs: number) {
  useEffect(() => {
    play();
    const timer = setInterval(play, everyMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  const values = useSequence(steps.length, 650);
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
  useLoop(play, 5200);

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
  useLoop(play, 5600);

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
    </>
  );
}

export function PreviewGlimpse({ kind, demo }: { kind: string; demo: Demo }) {
  if (kind === 'guide') return <GuideDemo demo={demo} />;
  if (kind === 'swap') return <SwapDemo demo={demo} />;
  if (kind === 'missed') return <MissedDemo demo={demo} />;
  return null;
}

// ---------- Round 2: icons, rewards, obstacles, projection, building, calendar ----------

/** Fades and lifts its children in after `delay` ms. Used to stagger onboarding content. */
export function Appear({
  delay = 0,
  children,
  distance = 14,
}: {
  delay?: number;
  children: ReactNode;
  distance?: number;
}) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(value, {
      toValue: 1,
      duration: 380,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [delay, value]);
  return (
    <Animated.View
      style={{
        opacity: value,
        transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
      }}>
      {children}
    </Animated.View>
  );
}

function orientationOf(slug: string): 'portrait' | 'landscape' {
  const row = (manifest.images as { slug: string; orientation?: string }[]).find((item) => item.slug === slug);
  return row?.orientation?.startsWith('portrait') ? 'portrait' : 'landscape';
}

/**
 * Rounded photo above a question, with a slow zoom-out as it appears. Portrait photos get a taller
 * frame and a crop anchored near the top, so faces stay in view instead of being cut at the chin.
 */
export function QuestionPhoto({
  slug,
  height,
  focus,
}: {
  slug: string;
  height?: number;
  focus?: { x: number; y: number } | null;
}) {
  const { radius } = useTheme();
  const portrait = orientationOf(slug) === 'portrait';
  const frame = height ?? (portrait ? 180 : 150);
  const zoom = useRef(new Animated.Value(1.12)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(zoom, { toValue: 1, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]).start();
  }, [fade, zoom]);
  return (
    <Animated.View style={{ height: frame, borderRadius: radius.xl, overflow: 'hidden', marginBottom: 16, opacity: fade }}>
      <Animated.View style={{ flex: 1, transform: [{ scale: zoom }] }}>
        <PhotoFill slug={slug} focalPoint={focus ?? (portrait ? { x: 0.5, y: 0.38 } : { x: 0.5, y: 0.4 })} />
      </Animated.View>
    </Animated.View>
  );
}

/** Soft circle with an icon, above a question's heading. */
export function HeadingIcon({ name }: { name: string }) {
  const { colours } = useTheme();
  return (
    <View style={[styles.headingIcon, { backgroundColor: colours.brandSoft }]}>
      <Ionicons name={name as keyof typeof Ionicons.glyphMap} size={26} color={colours.brand} />
    </View>
  );
}

/** One-line payoff after a big answer: a big icon that pops in, her name, one or two lines. */
export function RewardScreen({
  icon,
  title,
  lines,
  stat,
  imageSlug,
}: {
  icon: string;
  title: string;
  lines: string[];
  stat?: { value: string; text: string; source: string } | null;
  imageSlug?: string | null;
}) {
  const { colours, radius } = useTheme();
  const pop = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    successTap();
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: true }),
    ]).start();
  }, [fade, pop]);
  return (
    <View style={styles.reward}>
      {imageSlug ? (
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <View style={[styles.rewardPhoto, { borderColor: colours.surface }]}>
            <PhotoFill slug={imageSlug} focalPoint={orientationOf(imageSlug) === 'portrait' ? { x: 0.5, y: 0.2 } : { x: 0.5, y: 0.35 }} />
          </View>
          <View style={[styles.rewardBadge, { backgroundColor: colours.brand, borderColor: colours.bg }]}>
            <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={28} color={colours.onBrand} />
          </View>
        </Animated.View>
      ) : (
        <Animated.View
          style={[
            styles.rewardIcon,
            { backgroundColor: colours.brand, transform: [{ scale: pop }] },
          ]}>
          <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={64} color={colours.onBrand} />
        </Animated.View>
      )}
      <AppText variant="display" style={{ color: colours.ink, textAlign: 'center', marginTop: 20, fontSize: 30, lineHeight: 36 }}>
        {title}
      </AppText>
      <Animated.View style={{ opacity: fade, marginTop: 12, gap: 8, alignSelf: 'stretch' }}>
        {lines.map((line) => (
          <AppText key={line} variant="body" style={{ color: colours.inkMuted, textAlign: 'center' }}>
            {line}
          </AppText>
        ))}
        {stat ? (
          <View style={[styles.statCard, { backgroundColor: colours.surface, borderRadius: radius.xl }]}>
            <AppText style={{ fontFamily: fonts.display, fontSize: 44, lineHeight: 50, color: colours.brand }}>
              {stat.value}
            </AppText>
            <AppText variant="body" style={{ color: colours.ink, textAlign: 'center' }}>
              {stat.text}
            </AppText>
            <AppText variant="caption" style={{ color: colours.inkMuted, textAlign: 'center', marginTop: 6 }}>
              {stat.source}
            </AppText>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

export type ObstacleOption = { value: string; label: string; icon?: string; exclusive?: boolean };

/** Up to `max` choices as large rows; an exclusive option clears the others. */
export function ObstaclePicker({
  options,
  selected,
  max,
  onChange,
}: {
  options: ObstacleOption[];
  selected: string[];
  max: number;
  onChange: (next: string[]) => void;
}) {
  const { colours, radius } = useTheme();
  function toggle(option: ObstacleOption) {
    selectionTap();
    if (selected.includes(option.value)) {
      onChange(selected.filter((value) => value !== option.value));
      return;
    }
    if (option.exclusive) {
      onChange([option.value]);
      return;
    }
    const exclusive = new Set(options.filter((item) => item.exclusive).map((item) => item.value));
    const kept = selected.filter((value) => !exclusive.has(value));
    onChange(kept.length >= max ? [...kept.slice(1), option.value] : [...kept, option.value]);
  }
  return (
    <View style={{ gap: 7 }}>
      {options.map((option, index) => {
        const on = selected.includes(option.value);
        return (
          <Appear key={option.value} delay={120 + index * 45}>
          <Pressable
            onPress={() => toggle(option)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            style={({ pressed }) => [
              styles.obstacle,
              {
                borderRadius: radius.lg,
                backgroundColor: on ? colours.brandSoft : colours.surface,
                borderColor: on ? colours.brand : colours.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            {option.icon ? (
              <Ionicons
                name={option.icon as keyof typeof Ionicons.glyphMap}
                size={22}
                color={on ? colours.brand : colours.inkMuted}
              />
            ) : null}
            <AppText variant={on ? 'bodyStrong' : 'body'} style={{ color: on ? colours.brand : colours.ink, flex: 1 }}>
              {option.label}
            </AppText>
            <Ionicons
              name={on ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={on ? colours.brand : colours.border}
            />
          </Pressable>
          </Appear>
        );
      })}
    </View>
  );
}

/**
 * Generic progress picture: a smooth rising line (no lift names, no kilos) with her plan's
 * milestones pinned along it. It draws slowly, and each milestone appears as the line reaches it.
 */
export function ProjectionChart({
  weeks,
  milestones,
  startLabel,
  durationMs = 2600,
}: {
  weeks: number;
  milestones: { week: number; title: string }[];
  startLabel: string;
  durationMs?: number;
}) {
  const { colours, radius } = useTheme();
  const [width, setWidth] = useState(0);
  const draw = useRef(new Animated.Value(0)).current;
  const pins = useRef(milestones.map(() => new Animated.Value(0))).current;
  const height = 140;
  const pad = 16;
  const total = Math.max(1, weeks);

  useEffect(() => {
    if (width <= 0) return;
    draw.setValue(0);
    pins.forEach((pin) => pin.setValue(0));
    Animated.timing(draw, { toValue: 1, duration: durationMs, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
    milestones.forEach((item, index) => {
      Animated.sequence([
        Animated.delay(Math.round((item.week / total) * durationMs * 0.92)),
        Animated.spring(pins[index], { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
      ]).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  const plotW = Math.max(0, width - pad * 2);
  const yFor = (t: number) => height - pad - (1 - Math.pow(1 - t, 1.7)) * (height - pad * 2 - 10);
  const steps = 24;
  let line = '';
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = pad + t * plotW;
    const y = yFor(t);
    line += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }
  const area = `${line} L ${pad + plotW} ${height} L ${pad} ${height} Z`;
  const pathLength = plotW * 1.5 + 200;

  return (
    <View
      style={[styles.chartCard, { backgroundColor: colours.surface, borderRadius: radius.xl }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width - 32)}>
      {width > 0 ? (
        <View style={{ height, width }}>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="projFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colours.brand} stopOpacity={0.2} />
                <Stop offset="1" stopColor={colours.brand} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={area} fill="url(#projFill)" />
            <AnimatedPath
              d={line}
              stroke={colours.brand}
              strokeWidth={4}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${pathLength} ${pathLength}`}
              strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [pathLength, 0] })}
            />
            <Circle cx={pad} cy={yFor(0)} r={6} fill={colours.surface} stroke={colours.inkMuted} strokeWidth={3} />
          </Svg>
          {milestones.map((item, index) => {
            const t = Math.min(1, item.week / total);
            const x = pad + t * plotW;
            const y = yFor(t);
            return (
              <Animated.View
                key={`${item.week}-${item.title}`}
                pointerEvents="none"
                style={[
                  styles.pin,
                  {
                    left: x - 9,
                    top: y - 9,
                    backgroundColor: colours.surface,
                    borderColor: colours.brand,
                    opacity: pins[index],
                    transform: [{ scale: pins[index] }],
                  },
                ]}
              />
            );
          })}
        </View>
      ) : (
        <View style={{ height }} />
      )}
      <View style={styles.chartAxis}>
        <AppText variant="caption" style={{ color: colours.inkMuted }}>
          {startLabel}
        </AppText>
        <AppText variant="caption" style={{ color: colours.ink, fontWeight: '700' }}>
          Week {weeks}
        </AppText>
      </View>
      <View style={{ marginTop: 10, gap: 8 }}>
        {milestones.map((item, index) => (
          <Animated.View
            key={`${item.week}-${item.title}-row`}
            style={[
              styles.milestoneRow,
              {
                opacity: pins[index],
                transform: [{ translateY: pins[index].interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
              },
            ]}>
            <View style={[styles.milestoneWeek, { backgroundColor: colours.brandSoft, borderRadius: radius.full }]}>
              <AppText variant="caption" style={{ color: colours.brand, fontWeight: '800' }}>
                Week {item.week}
              </AppText>
            </View>
            <AppText variant="bodyStrong" style={{ color: colours.ink, flex: 1 }}>
              {item.title}
            </AppText>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

/** Building your plan: a ring that counts to 100%, her steps ticking off, honest facts rotating below. */
export function BuildingShow({
  title,
  steps,
  proof,
  proofSource,
  durationMs,
  onDone,
}: {
  title: string;
  steps: string[];
  proof: string[];
  proofSource: string;
  durationMs: number;
  onDone: () => void;
}) {
  const { colours, radius } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const [percent, setPercent] = useState(0);
  const [proofIndex, setProofIndex] = useState(0);
  const proofFade = useRef(new Animated.Value(1)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const size = 170;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  useEffect(() => {
    const id = progress.addListener(({ value }) => setPercent(Math.round(value * 100)));
    Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        successTap();
        setTimeout(() => onDoneRef.current(), 450);
      }
    });
    return () => progress.removeListener(id);
  }, [durationMs, progress]);

  useEffect(() => {
    if (proof.length < 2) return;
    const timer = setInterval(() => {
      Animated.timing(proofFade, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
        setProofIndex((value) => (value + 1) % proof.length);
        Animated.timing(proofFade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      });
    }, Math.max(1200, durationMs / proof.length));
    return () => clearInterval(timer);
  }, [durationMs, proof.length, proofFade]);

  const doneSteps = Math.min(steps.length, Math.floor((percent / 100) * (steps.length + 0.4)));
  const proofLine = proof[proofIndex] ?? '';
  return (
    <View style={{ alignItems: 'center', paddingTop: 8 }}>
      <AppText variant="title2" style={{ color: colours.ink, textAlign: 'center', marginBottom: 18 }}>
        {title}
      </AppText>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colours.brandSoft} strokeWidth={stroke} fill="none" />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colours.brand}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={progress.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] })}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <AppText style={{ fontFamily: fonts.display, fontSize: 48, lineHeight: 54, color: colours.brand }}>
          {percent}%
        </AppText>
      </View>
      <View style={{ alignSelf: 'stretch', marginTop: 22, gap: 12 }}>
        {steps.map((step, index) => {
          const done = index < doneSteps;
          const active = index === doneSteps;
          return (
            <View key={step} style={styles.buildStep}>
              <View
                style={[
                  styles.buildDot,
                  { backgroundColor: done ? colours.brand : 'transparent', borderColor: done || active ? colours.brand : colours.border },
                ]}>
                {done ? <Ionicons name="checkmark" size={14} color={colours.onBrand} /> : null}
              </View>
              <AppText
                variant={done ? 'bodyStrong' : 'body'}
                style={{ color: done ? colours.ink : active ? colours.ink : colours.inkMuted, flex: 1 }}>
                {step}
              </AppText>
            </View>
          );
        })}
      </View>
      {proofLine ? (
        <Animated.View
          style={[styles.proof, { backgroundColor: colours.surface, borderRadius: radius.xl, opacity: proofFade }]}>
          <Ionicons name="sparkles" size={18} color={colours.accent} />
          <AppText variant="bodyStrong" style={{ color: colours.ink, textAlign: 'center' }}>
            {proofLine}
          </AppText>
          {proofLine.startsWith('88%') && proofSource ? (
            <AppText variant="caption" style={{ color: colours.inkMuted, textAlign: 'center' }}>
              {proofSource.replace(/^88%: /, '')}
            </AppText>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Two weeks from this Monday, her training days dotted from today, the first one marked Start. */
export function PlanCalendar({
  title,
  days,
  startLabel,
}: {
  title: string;
  days: Weekday[];
  startLabel: string;
}) {
  const { colours, radius } = useTheme();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const cells = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
  const todayIso = isoDate(today);
  const trainingIso = cells
    .filter((date) => isoDate(date) >= todayIso && days.includes(WEEKDAYS[(date.getDay() + 6) % 7]))
    .map(isoDate);
  const startIso = trainingIso[0];
  return (
    <View style={[styles.calendar, { backgroundColor: colours.surface, borderRadius: radius.xl }]}>
      <AppText variant="eyebrow" style={{ color: colours.accent, marginBottom: 10 }}>
        {title}
      </AppText>
      <View style={styles.calendarRow}>
        {WEEKDAYS.map((day) => (
          <AppText key={day} variant="caption" style={[styles.calendarHead, { color: colours.inkMuted }]}>
            {WEEKDAY_LABELS[day].slice(0, 1)}
          </AppText>
        ))}
      </View>
      {[0, 1].map((row) => (
        <View key={row} style={styles.calendarRow}>
          {cells.slice(row * 7, row * 7 + 7).map((date) => {
            const iso = isoDate(date);
            const past = iso < todayIso;
            const training = trainingIso.includes(iso);
            const start = iso === startIso;
            return (
              <View
                key={iso}
                style={[
                  styles.calendarCell,
                  {
                    borderRadius: radius.md,
                    backgroundColor: start ? colours.brand : training ? colours.brandSoft : colours.surfaceMuted,
                    opacity: past ? 0.45 : 1,
                  },
                ]}>
                {start ? (
                  <AppText variant="caption" style={{ color: colours.onBrand, fontWeight: '800', fontSize: 11 }}>
                    {startLabel}
                  </AppText>
                ) : (
                  <>
                    {training ? <View style={[styles.calendarDot, { backgroundColor: colours.brand }]} /> : null}
                    <AppText variant="bodySm" style={{ color: training ? colours.ink : colours.inkMuted, fontWeight: training ? '700' : '400' }}>
                      {date.getDate()}
                    </AppText>
                  </>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

const styles = StyleSheet.create({
  headingIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  reward: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  rewardPhoto: { width: 150, height: 150, borderRadius: 75, overflow: 'hidden', borderWidth: 5 },
  rewardBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardIcon: { width: 128, height: 128, borderRadius: 64, alignItems: 'center', justifyContent: 'center' },
  statCard: { alignItems: 'center', padding: 18, marginTop: 14 },
  obstacle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1.5 },
  chartCard: { padding: 16, marginTop: 20 },
  pin: { position: 'absolute', width: 18, height: 18, borderRadius: 9, borderWidth: 4 },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  milestoneWeek: { paddingHorizontal: 10, paddingVertical: 4 },
  chartAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  buildStep: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  buildDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  proof: { alignSelf: 'stretch', alignItems: 'center', gap: 6, padding: 16, marginTop: 26 },
  calendar: { padding: 16, marginTop: 20 },
  calendarRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  calendarHead: { flex: 1, textAlign: 'center' },
  calendarCell: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  calendarDot: { width: 5, height: 5, borderRadius: 3, marginBottom: 2 },
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
