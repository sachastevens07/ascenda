import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState, type ElementRef } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppText, Chip, GoalChipGroup } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { PhotoFill } from '@/components/ui/Cards';
import { imageSourceForSlug } from '@/lib/images';
import { hapticSelection } from '@/lib/haptics';
import type { OnboardingOption } from '@/lib/onboardingContent';
import { WEEKDAY_LABELS, type Weekday } from '@/lib/onboardingAnswers';
import { formatReminderClock, hourToReminderTime, REMINDER_HOURS } from '@/lib/reminders';
import type { Goal } from '@/lib/goals';

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  dumbbell: 'barbell-outline',
  muscle: 'fitness-outline',
  legs: 'walk-outline',
  arm: 'accessibility-outline',
  sparkle: 'sparkles-outline',
  heart: 'heart-outline',
  lungs: 'pulse-outline',
  stretch: 'body-outline',
  spine: 'man-outline',
  bolt: 'flash-outline',
  leaf: 'leaf-outline',
  shield: 'shield-outline',
  refresh: 'refresh-outline',
  flame: 'flame-outline',
  door: 'enter-outline',
  sparkles: 'sparkles-outline',
  barbell: 'barbell-outline',
  thumb: 'thumbs-up-outline',
  shrug: 'remove-outline',
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const EQUIP_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  dumbbells: 'barbell-outline',
  'leg-press': 'fitness-outline',
  'lat-pulldown': 'swap-vertical-outline',
  'chest-press-machine': 'body-outline',
  cable_station: 'git-branch-outline',
  'smith-machine': 'square-outline',
  barbell: 'barbell-outline',
  squat_rack: 'cube-outline',
  treadmill: 'speedometer-outline',
};

function iconName(icon?: string): keyof typeof Ionicons.glyphMap {
  return (icon && ICON_MAP[icon]) || 'ellipse-outline';
}

export function ScreenHeading({
  eyebrow,
  title,
  body,
  helper,
  why,
  eyebrowStrong = false,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  helper?: string;
  why?: string;
  eyebrowStrong?: boolean;
}) {
  const { colours } = useTheme();
  return (
    <View style={styles.heading}>
      {eyebrow ? (
        <AppText
          variant={eyebrowStrong ? 'title2' : 'eyebrow'}
          style={{ color: eyebrowStrong ? colours.ink : colours.accent, marginBottom: 8 }}>
          {eyebrow}
        </AppText>
      ) : null}
      <AppText variant="display" style={{ color: colours.ink }}>
        {title}
      </AppText>
      {body ? (
        <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 12 }}>
          {body}
        </AppText>
      ) : null}
      {helper ? (
        <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 12 }}>
          {helper}
        </AppText>
      ) : null}
      {why ? (
        <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 12 }}>
          {why}
        </AppText>
      ) : null}
    </View>
  );
}

function ChoiceRow({
  label,
  sub,
  icon,
  selected,
  onPress,
}: {
  label: string;
  sub?: string;
  icon?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colours, radius } = useTheme();
  return (
    <Pressable
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.choice,
        {
          backgroundColor: selected ? colours.brandSoft : colours.surfaceMuted,
          borderRadius: radius.lg,
          borderWidth: selected ? 1.5 : 0,
          borderColor: colours.brand,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      {icon ? <Ionicons name={iconName(icon)} size={22} color={selected ? colours.brand : colours.ink} /> : null}
      <View style={{ flex: 1 }}>
        <AppText variant={selected ? 'bodyStrong' : 'body'} style={{ color: selected ? colours.brand : colours.ink }}>
          {label}
        </AppText>
        {sub ? (
          <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 2 }}>
            {sub}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

export function SingleChoiceList({
  options,
  value,
  onChange,
}: {
  options: OnboardingOption[];
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.stack}>
      {options.map((option) => (
        <ChoiceRow
          key={option.value}
          label={option.label}
          icon={option.icon}
          selected={value === option.value}
          onPress={() => onChange(option.value)}
        />
      ))}
    </View>
  );
}

export function CardChoiceList({
  options,
  value,
  onChange,
}: {
  options: OnboardingOption[];
  value: string | number | null;
  onChange: (value: string) => void;
}) {
  const { colours, radius } = useTheme();
  const selected = options.find((option) => String(option.value) === String(value));
  return (
    <View style={styles.stack}>
      {options.map((option) => (
        <ChoiceRow
          key={option.value}
          label={option.label}
          sub={option.sub}
          selected={String(value) === String(option.value)}
          onPress={() => onChange(option.value)}
        />
      ))}
      {selected?.stat_value ? (
        <StatCallout
          value={selected.stat_value}
          text={selected.insight ?? ''}
          source={selected.insight_source}
        />
      ) : selected?.insight ? (
        <View style={[styles.insightCard, { backgroundColor: colours.brandSoft, borderRadius: radius.lg }]}>
          <AppText variant="body" style={{ color: colours.ink }}>
            {selected.insight}
          </AppText>
          {selected.insight_source ? (
            <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 8 }}>
              {selected.insight_source}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function ChipChoiceList({
  options,
  value,
  onChange,
}: {
  options: OnboardingOption[];
  value: string | number | null;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          size="lg"
          selected={String(value) === String(option.value)}
          onPress={() => {
            hapticSelection();
            onChange(option.value);
          }}
        />
      ))}
    </View>
  );
}

export function StatementScale({
  options,
  value,
  onChange,
}: {
  options: OnboardingOption[];
  value: number | null;
  onChange: (value: number) => void;
}) {
  const { colours, radius } = useTheme();
  return (
    <View style={styles.stack}>
      {options.map((option) => {
        const selected = value === Number(option.value);
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              hapticSelection();
              onChange(Number(option.value));
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.scaleRow,
              {
                backgroundColor: selected ? colours.brandSoft : colours.surfaceMuted,
                borderRadius: radius.full,
                borderWidth: selected ? 1.5 : 0,
                borderColor: colours.brand,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <AppText variant={selected ? 'bodyStrong' : 'body'} style={{ color: selected ? colours.brand : colours.ink }}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ComfortSlider({
  stops,
  value,
  onChange,
}: {
  stops: OnboardingOption[];
  value: number;
  onChange: (value: number) => void;
}) {
  const { colours } = useTheme();
  const min = Number(stops[0]?.value ?? 1);
  const max = Number(stops[stops.length - 1]?.value ?? 5);
  const [trackWidth, setTrackWidth] = useState(0);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const widthRef = useRef(0);
  const originX = useRef(0);
  const trackRef = useRef<ElementRef<typeof View>>(null);

  function valueFromX(x: number): number {
    const width = widthRef.current;
    if (width <= 0) return valueRef.current;
    const t = Math.max(0, Math.min(1, x / width));
    return Math.round(min + t * (max - min));
  }

  function applyFromPageX(pageX: number) {
    const next = valueFromX(pageX - originX.current);
    if (next !== valueRef.current) hapticSelection();
    onChangeRef.current(next);
  }

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          applyFromPageX(event.nativeEvent.pageX);
          trackRef.current?.measureInWindow((x) => {
            originX.current = x;
            applyFromPageX(event.nativeEvent.pageX);
          });
        },
        onPanResponderMove: (event) => {
          applyFromPageX(event.nativeEvent.pageX);
        },
      }),
    [min, max]
  );

  const current = stops.find((stop) => Number(stop.value) === value);
  const t = max === min ? 0 : (value - min) / (max - min);
  const thumbLeft = Math.max(0, trackWidth * t - 18);

  return (
    <View>
      <AppText variant="title1" style={{ color: colours.ink, textAlign: 'center', marginBottom: 20 }}>
        {current?.label ?? ''}
      </AppText>
      <View
        ref={trackRef}
        style={styles.sliderHit}
        onLayout={(event) => {
          const next = event.nativeEvent.layout.width;
          widthRef.current = next;
          setTrackWidth(next);
          trackRef.current?.measureInWindow((x) => {
            originX.current = x;
          });
        }}
        {...pan.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel={current?.label ?? 'How you feel in the gym'}
        accessibilityValue={{ min, max, now: value }}>
        <View style={[styles.sliderTrack, { backgroundColor: colours.surfaceMuted }]}>
          <View
            style={[
              styles.sliderFill,
              { width: `${t * 100}%`, backgroundColor: colours.brand },
            ]}
          />
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.sliderThumb,
            { left: thumbLeft, backgroundColor: colours.brand, borderColor: colours.surface },
          ]}
        />
      </View>
      <View style={styles.sliderLabels}>
        <AppText variant="caption" style={{ color: colours.inkMuted }}>
          {stops[0]?.label}
        </AppText>
        <AppText variant="caption" style={{ color: colours.inkMuted }}>
          {stops[stops.length - 1]?.label}
        </AppText>
      </View>
    </View>
  );
}

export function NumberSelect({
  min,
  max,
  value,
  onChange,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const { colours, radius } = useTheme();
  const numbers = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  return (
    <View style={styles.numberRow}>
      {numbers.map((number) => {
        const selected = number === value;
        return (
          <Pressable
            key={number}
            onPress={() => {
              hapticSelection();
              onChange(number);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.numberCell,
              {
                backgroundColor: selected ? colours.brand : colours.surfaceMuted,
                borderRadius: radius.lg,
              },
            ]}>
            <AppText variant="title1" style={{ color: selected ? colours.onBrand : colours.ink }}>
              {number}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function DayPills({
  selected,
  targetCount,
  onChange,
}: {
  selected: Weekday[];
  targetCount: number;
  onChange: (next: Weekday[]) => void;
}) {
  const { colours, radius } = useTheme();
  const days = Object.keys(WEEKDAY_LABELS) as Weekday[];
  return (
    <View>
      <View style={styles.dayRow}>
        {days.map((day) => {
          const on = selected.includes(day);
          return (
            <Pressable
              key={day}
              onPress={() => {
                hapticSelection();
                if (on) onChange(selected.filter((item) => item !== day));
                else if (selected.length < targetCount) onChange([...selected, day]);
                else onChange([...selected.slice(1), day]);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[
                styles.dayPill,
                {
                  backgroundColor: on ? colours.brand : colours.surfaceMuted,
                  borderRadius: radius.full,
                },
              ]}>
              <AppText variant="bodyStrong" style={{ color: on ? colours.onBrand : colours.ink }}>
                {WEEKDAY_LABELS[day]}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 12, textAlign: 'center' }}>
        {selected.length} of {targetCount} days
      </AppText>
    </View>
  );
}

export function PhotoMultiChoice({
  options,
  selected,
  onChange,
}: {
  options: OnboardingOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { colours, radius } = useTheme();
  const photos = options.filter((option) => !option.exclusive);
  const exclusive = options.filter((option) => option.exclusive);

  function toggle(option: OnboardingOption) {
    hapticSelection();
    if (option.exclusive) {
      onChange(selected.includes(option.value) ? [] : [option.value]);
      return;
    }
    const withoutNone = selected.filter((item) => !exclusive.some((row) => row.value === item));
    onChange(
      selected.includes(option.value)
        ? withoutNone.filter((item) => item !== option.value)
        : [...withoutNone, option.value]
    );
  }

  return (
    <View>
      <View style={styles.photoGrid}>
        {photos.map((option) => {
          const on = selected.includes(option.value);
          const image = option.image_slug ? imageSourceForSlug(option.image_slug) : null;
          return (
            <Pressable
              key={option.value}
              onPress={() => toggle(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[
                styles.photoCell,
                {
                  backgroundColor: colours.surfaceMuted,
                  borderRadius: radius.lg,
                  borderWidth: on ? 2 : 0,
                  borderColor: colours.brand,
                },
              ]}>
              {image ? (
                <View style={[styles.photo, { overflow: 'hidden' }]}>
                  <PhotoFill slug={option.image_slug} kind="equipment" label={option.label} />
                </View>
              ) : (
                <View style={[styles.photo, { alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons
                    name={EQUIP_ICONS[option.value] ?? 'ellipse-outline'}
                    size={32}
                    color={on ? colours.brand : colours.inkMuted}
                  />
                </View>
              )}
              <View style={styles.photoLabel}>
                <AppText variant="caption" style={{ color: colours.ink }} numberOfLines={1}>
                  {option.label}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>
      {exclusive.length ? (
        <AppText variant="caption" style={{ color: colours.inkMuted, textAlign: 'center', marginTop: 16 }}>
          or
        </AppText>
      ) : null}
      {exclusive.map((option) => {
        const on = selected.includes(option.value);
        return (
          <Pressable
            key={option.value}
            onPress={() => toggle(option)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[
              styles.noneRow,
              {
                borderRadius: radius.lg,
                borderColor: on ? colours.brand : colours.border,
                backgroundColor: on ? colours.brandSoft : colours.surface,
              },
            ]}>
            <Ionicons
              name={on ? 'checkmark-circle' : 'remove-circle-outline'}
              size={22}
              color={on ? colours.brand : colours.inkMuted}
            />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" style={{ color: on ? colours.brand : colours.ink }}>
                {option.label}
              </AppText>
              <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 2 }}>
                I have not used any of these yet
              </AppText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TimePickerChips({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {REMINDER_HOURS.map((hour) => {
        const time = hourToReminderTime(hour);
        return (
          <Chip
            key={time}
            label={formatReminderClock(time)}
            selected={value === time}
            size="lg"
            onPress={() => {
              hapticSelection();
              onChange(time);
            }}
          />
        );
      })}
    </View>
  );
}

export function NameField({
  value,
  placeholder,
  maxLength,
  onChange,
}: {
  value: string;
  placeholder: string;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  const { colours, radius } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colours.inkMuted}
      maxLength={maxLength}
      autoCapitalize="words"
      autoCorrect={false}
      style={[
        styles.input,
        { color: colours.ink, backgroundColor: colours.surfaceMuted, borderRadius: radius.lg },
      ]}
    />
  );
}

export function BodyweightField({
  kgText,
  stonesText: _stonesText,
  poundsText,
  unit,
  onUnit,
  onKg,
  onStones: _onStones,
  onPounds,
}: {
  kgText: string;
  stonesText?: string;
  poundsText: string;
  unit: 'kg' | 'lb' | 'st_lb';
  onUnit: (unit: 'kg' | 'st_lb') => void;
  onKg: (value: string) => void;
  onStones?: (value: string) => void;
  onPounds: (value: string) => void;
}) {
  const { colours, radius } = useTheme();
  const field = [
    styles.input,
    { color: colours.ink, backgroundColor: colours.surfaceMuted, borderRadius: radius.lg, width: '100%' as const },
  ];
  return (
    <View>
      <View style={[styles.chipRow, { marginBottom: 12 }]}>
        <Chip label="kg" selected={unit === 'kg'} onPress={() => onUnit('kg')} />
        <Chip label="lb" selected={unit !== 'kg'} onPress={() => onUnit('st_lb')} />
      </View>
      {unit === 'kg' ? (
        <TextInput
          value={kgText}
          onChangeText={onKg}
          keyboardType="decimal-pad"
          placeholder="kg"
          placeholderTextColor={colours.inkMuted}
          style={field}
        />
      ) : (
        <TextInput
          value={poundsText}
          onChangeText={onPounds}
          keyboardType="decimal-pad"
          placeholder="lb"
          placeholderTextColor={colours.inkMuted}
          style={field}
        />
      )}
    </View>
  );
}

export function GoalsPicker({
  selected,
  onChange,
}: {
  selected: Goal[];
  onChange: (next: Goal[]) => void;
}) {
  return <GoalChipGroup selected={selected} onChange={onChange} />;
}

export function StatCallout({
  value,
  text,
  source,
  extras,
}: {
  value: string;
  text: string;
  source?: string;
  extras?: { value: string; text: string }[];
}) {
  const { colours, radius, shadow } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colours.surface,
        borderRadius: radius.xl,
        padding: 16,
        marginBottom: 16,
        ...shadow,
      }}>
      <AppText variant="display" style={{ color: colours.accent }}>
        {value}
      </AppText>
      <AppText variant="body" style={{ color: colours.ink, marginTop: 8 }}>
        {text}
      </AppText>
      {extras?.map((item) => (
        <View key={item.value} style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <AppText variant="title2" style={{ color: colours.accent, minWidth: 56 }}>
            {item.value}
          </AppText>
          <AppText variant="body" style={{ color: colours.ink, flex: 1 }}>
            {item.text}
          </AppText>
        </View>
      ))}
      {source ? (
        <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 10 }}>
          {source}
        </AppText>
      ) : null}
    </View>
  );
}

export function BlockMessage({ title, body }: { title: string; body: string }) {
  const { colours, radius } = useTheme();
  return (
    <View style={[styles.block, { backgroundColor: colours.surfaceMuted, borderRadius: radius.lg }]}>
      <AppText variant="bodyStrong" style={{ color: colours.ink }}>
        {title}
      </AppText>
      <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 8 }}>
        {body}
      </AppText>
    </View>
  );
}

export function NameAck({ title, body }: { title: string; body: string }) {
  const { colours } = useTheme();
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, scale]);

  return (
    <View style={styles.ackWrap}>
      <Animated.View style={{ transform: [{ scale }], opacity }}>
        <Ionicons name="checkmark-circle" size={72} color={colours.brand} />
      </Animated.View>
      <AppText variant="display" style={{ color: colours.ink, textAlign: 'center', marginTop: 20 }}>
        {title}
      </AppText>
      {body ? (
        <AppText variant="body" style={{ color: colours.inkMuted, textAlign: 'center', marginTop: 12 }}>
          {body}
        </AppText>
      ) : null}
    </View>
  );
}

export function BuildingSteps({
  steps,
  doneCount: _doneCount,
  onDone,
}: {
  steps: string[];
  doneCount?: number;
  onDone?: () => void;
}) {
  const { colours, radius } = useTheme();
  const fills = useRef(steps.map(() => new Animated.Value(0))).current;
  const checks = useRef(steps.map(() => new Animated.Value(0))).current;
  const overall = useRef(new Animated.Value(0)).current;
  const tick = useRef(new Animated.Value(0)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const ringSize = 88;
  const ringStroke = 7;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = overall.interpolate({
    inputRange: [0, 1],
    outputRange: [ringCircumference, 0],
  });

  useEffect(() => {
    let cancelled = false;
    fills.forEach((value) => value.setValue(0));
    checks.forEach((value) => value.setValue(0));
    overall.setValue(0);
    tick.setValue(0);
    const stepMs = 480;
    const staggerMs = 320;
    const overallMs = staggerMs * Math.max(0, steps.length - 1) + stepMs;
    const run = Animated.parallel([
      Animated.timing(overall, {
        toValue: 1,
        duration: overallMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.stagger(
        staggerMs,
        steps.map((_, index) =>
          Animated.parallel([
            Animated.timing(fills[index], {
              toValue: 1,
              duration: stepMs,
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              useNativeDriver: false,
            }),
            Animated.sequence([
              Animated.delay(300),
              Animated.spring(checks[index], {
                toValue: 1,
                friction: 6,
                tension: 140,
                useNativeDriver: true,
              }),
            ]),
          ])
        )
      ),
    ]);
    run.start(({ finished }) => {
      if (!finished || cancelled) return;
      Animated.spring(tick, {
        toValue: 1,
        friction: 6,
        tension: 140,
        useNativeDriver: true,
      }).start(() => {
        if (!cancelled) setTimeout(() => onDoneRef.current?.(), 280);
      });
    });
    return () => {
      cancelled = true;
      fills.forEach((value) => value.stopAnimation());
      checks.forEach((value) => value.stopAnimation());
      overall.stopAnimation();
      tick.stopAnimation();
    };
  }, [checks, fills, overall, steps, tick]);

  return (
    <View style={styles.stack}>
      {steps.map((step, index) => {
        const width = fills[index].interpolate({
          inputRange: [0, 1],
          outputRange: ['4%', '100%'],
        });
        return (
          <View key={step} style={styles.buildBlock}>
            <View style={styles.buildRow}>
              <View>
                <Ionicons name="ellipse-outline" size={22} color={colours.inkMuted} />
                <Animated.View
                  style={{
                    position: 'absolute',
                    opacity: checks[index],
                    transform: [
                      {
                        scale: checks[index].interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.6, 1],
                        }),
                      },
                    ],
                  }}>
                  <Ionicons name="checkmark-circle" size={22} color={colours.brand} />
                </Animated.View>
              </View>
              <AppText variant="body" style={{ color: colours.ink, flex: 1 }}>
                {step}
              </AppText>
            </View>
            <View style={[styles.buildTrack, { backgroundColor: colours.surfaceMuted, borderRadius: radius.full }]}>
              <Animated.View
                style={{
                  width,
                  height: '100%',
                  backgroundColor: colours.brand,
                  borderRadius: radius.full,
                }}
              />
            </View>
          </View>
        );
      })}
      <View style={styles.buildRingWrap}>
        <View style={{ width: ringSize, height: ringSize }}>
          <Svg width={ringSize} height={ringSize}>
            <Circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={ringRadius}
              stroke={colours.surfaceMuted}
              strokeWidth={ringStroke}
              fill="none"
            />
            <AnimatedCircle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={ringRadius}
              stroke={colours.brand}
              strokeWidth={ringStroke}
              fill="none"
              strokeDasharray={`${ringCircumference} ${ringCircumference}`}
              strokeDashoffset={ringOffset}
              strokeLinecap="round"
              rotation="-90"
              origin={`${ringSize / 2}, ${ringSize / 2}`}
            />
          </Svg>
          <Animated.View
            style={{
              ...StyleSheet.absoluteFill,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: tick,
              transform: [
                {
                  scale: tick.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.6, 1],
                  }),
                },
              ],
            }}>
            <Ionicons name="checkmark" size={36} color={colours.brand} />
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { marginBottom: 24 },
  stack: { gap: 10 },
  choice: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scaleRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sliderHit: { height: 56, justifyContent: 'center' },
  sliderTrack: { height: 8, borderRadius: 99, overflow: 'hidden' },
  sliderFill: { height: '100%' },
  sliderThumb: {
    position: 'absolute',
    top: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
  },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  insightCard: { padding: 16, marginTop: 6 },
  noneRow: {
    marginTop: 10,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  ackWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 48 },
  numberRow: { flexDirection: 'row', gap: 10 },
  numberCell: { flex: 1, height: 72, alignItems: 'center', justifyContent: 'center' },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayPill: { paddingHorizontal: 14, paddingVertical: 10, minWidth: 52, alignItems: 'center' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoCell: { width: '47%', overflow: 'hidden' },
  photo: { width: '100%', height: 96 },
  photoLabel: { paddingHorizontal: 8, paddingVertical: 8 },
  input: { minHeight: 52, paddingHorizontal: 16, fontSize: 17 },
  block: { padding: 16, marginTop: 16 },
  buildBlock: { gap: 8 },
  buildTrack: { height: 8, overflow: 'hidden' },
  buildRingWrap: { alignItems: 'center', marginTop: 20 },
  buildRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
});
