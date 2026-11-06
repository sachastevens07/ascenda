import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Chip, GoalChipGroup } from '@/components/ui';
import { useTheme } from '@/constants/theme';
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
  seedling: 'leaf-outline',
  sprout: 'flower-outline',
  wave: 'water-outline',
  tree: 'leaf-outline',
  thumb: 'thumbs-up-outline',
  shrug: 'remove-outline',
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
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  helper?: string;
  why?: string;
}) {
  const { colours } = useTheme();
  return (
    <View style={styles.heading}>
      {eyebrow ? (
        <AppText variant="eyebrow" style={{ color: colours.accent, marginBottom: 8 }}>
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
  const { colours, radius } = useTheme();
  const current = stops.find((stop) => Number(stop.value) === value);
  return (
    <View>
      <View style={styles.sliderRow}>
        {stops.map((stop) => {
          const selected = Number(stop.value) === value;
          return (
            <Pressable
              key={stop.value}
              onPress={() => {
                hapticSelection();
                onChange(Number(stop.value));
              }}
              accessibilityRole="button"
              accessibilityLabel={stop.label}
              accessibilityState={{ selected }}
              style={[
                styles.sliderStop,
                {
                  backgroundColor: selected ? colours.brand : colours.surfaceMuted,
                  borderRadius: radius.full,
                },
              ]}
            />
          );
        })}
      </View>
      <AppText variant="bodyStrong" style={{ color: colours.ink, textAlign: 'center', marginTop: 16 }}>
        {current?.label ?? ''}
      </AppText>
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
  return (
    <View style={styles.photoGrid}>
      {options.map((option) => {
        const on = selected.includes(option.value);
        const image = option.image_slug ? imageSourceForSlug(option.image_slug) : null;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              hapticSelection();
              if (option.exclusive) {
                onChange(on ? [] : [option.value]);
                return;
              }
              const withoutNone = selected.filter((item) => item !== 'none');
              onChange(on ? withoutNone.filter((item) => item !== option.value) : [...withoutNone, option.value]);
            }}
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
              <Image source={image} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={[styles.photo, { alignItems: 'center', justifyContent: 'center' }]}>
                <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                  {option.label}
                </AppText>
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
  stonesText,
  poundsText,
  unit,
  onUnit,
  onKg,
  onStones,
  onPounds,
}: {
  kgText: string;
  stonesText: string;
  poundsText: string;
  unit: 'kg' | 'st_lb';
  onUnit: (unit: 'kg' | 'st_lb') => void;
  onKg: (value: string) => void;
  onStones: (value: string) => void;
  onPounds: (value: string) => void;
}) {
  const { colours, radius } = useTheme();
  const field = [
    styles.input,
    { color: colours.ink, backgroundColor: colours.surfaceMuted, borderRadius: radius.lg, flex: 1 },
  ];
  return (
    <View>
      <View style={[styles.chipRow, { marginBottom: 12 }]}>
        <Chip label="kg" selected={unit === 'kg'} onPress={() => onUnit('kg')} />
        <Chip label="st / lb" selected={unit === 'st_lb'} onPress={() => onUnit('st_lb')} />
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
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TextInput
            value={stonesText}
            onChangeText={onStones}
            keyboardType="number-pad"
            placeholder="st"
            placeholderTextColor={colours.inkMuted}
            style={field}
          />
          <TextInput
            value={poundsText}
            onChangeText={onPounds}
            keyboardType="decimal-pad"
            placeholder="lb"
            placeholderTextColor={colours.inkMuted}
            style={field}
          />
        </View>
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

export function BuildingSteps({ steps, doneCount }: { steps: string[]; doneCount: number }) {
  const { colours } = useTheme();
  return (
    <View style={styles.stack}>
      {steps.map((step, index) => {
        const done = index < doneCount;
        return (
          <View key={step} style={styles.buildRow}>
            <Ionicons
              name={done ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={done ? colours.success : colours.inkMuted}
            />
            <AppText variant="body" style={{ color: done ? colours.ink : colours.inkMuted }}>
              {step}
            </AppText>
          </View>
        );
      })}
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
    minHeight: 48,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sliderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  sliderStop: { flex: 1, height: 14 },
  numberRow: { flexDirection: 'row', gap: 10 },
  numberCell: { flex: 1, height: 72, alignItems: 'center', justifyContent: 'center' },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayPill: { paddingHorizontal: 14, paddingVertical: 10, minWidth: 52, alignItems: 'center' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoCell: { width: '47%', overflow: 'hidden' },
  photo: { width: '100%', height: 88 },
  photoLabel: { paddingHorizontal: 8, paddingVertical: 8 },
  input: { minHeight: 52, paddingHorizontal: 16, fontSize: 17 },
  block: { padding: 16, marginTop: 16 },
  buildRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
});
