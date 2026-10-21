import Ionicons from '@expo/vector-icons/Ionicons';
import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { showDialog } from '@/components/Dialog';
import { colours } from '@/constants/theme';
import { EQUIPMENT_LABELS, ZONE_LABELS, type Zone } from '@/lib/exercises';
import type { EquipmentAccess } from '@/lib/profile';
import type { ProgrammeExercise, SlotExercise } from '@/lib/programmes';
import { exerciseFits, fetchAlternatives, type SwapScope } from '@/lib/swaps';

type SwapSheetProps = {
  open: boolean;
  item: ProgrammeExercise;
  equipment: EquipmentAccess;
  /** Highest zone she may swap to (her level, or 1 in Quiet Mode). */
  maxZone: Zone;
  /** Exercises already in the day, which can't be offered. */
  excludeIds: string[];
  onClose: () => void;
  onSwap: (exercise: SlotExercise, scope: SwapScope) => Promise<void>;
  /** Puts the programme's own exercise back, today and in her programme. */
  onRestore: () => Promise<void>;
};

type LoadState = 'loading' | 'error' | 'ready';

const OPTION_HEIGHT = 56;
const OPTION_GAP = 8;
const ANIM_MS = 220;

function menuHeight(pills: number): number {
  if (pills <= 0) return OPTION_HEIGHT;
  return pills * OPTION_HEIGHT + (pills - 1) * OPTION_GAP;
}

/** In-place swap menu: alternatives drop down as pills under the exercise. */
export function SwapSheet({
  open,
  item,
  equipment,
  maxZone,
  excludeIds,
  onClose,
  onSwap,
  onRestore,
}: SwapSheetProps) {
  const [alternatives, setAlternatives] = useState<SlotExercise[]>([]);
  const [trySomethingNew, setTrySomethingNew] = useState<SlotExercise | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [chosen, setChosen] = useState<SlotExercise | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const height = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const excludeKey = excludeIds.join(',');
  const canRestore = Boolean(item.original && exerciseFits(item.original, equipment, maxZone));

  const pillCount = chosen
    ? 3
    : loadState === 'ready'
      ? (canRestore ? 1 : 0) +
        alternatives.length +
        (trySomethingNew ? 1 : 0) +
        (alternatives.length === 0 && !trySomethingNew && !canRestore ? 1 : 0)
      : 1;
  const targetHeight = open ? menuHeight(pillCount) : 0;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(height, {
        toValue: targetHeight,
        duration: ANIM_MS,
        easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(opacity, {
        toValue: open ? 1 : 0,
        duration: ANIM_MS,
        easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [height, opacity, open, targetHeight]);

  useEffect(() => {
    setChosen(null);
    setTrySomethingNew(null);
    if (!open) return;
    let isCurrent = true;
    setLoadState('loading');
    fetchAlternatives(item.exercise, equipment, excludeKey.split(','), maxZone)
      .then((result) => {
        if (!isCurrent) return;
        setAlternatives(result.alternatives);
        setTrySomethingNew(result.trySomethingNew);
        setLoadState('ready');
      })
      .catch(() => {
        if (isCurrent) setLoadState('error');
      });
    return () => {
      isCurrent = false;
    };
  }, [open, item.exercise, equipment, excludeKey, maxZone]);

  async function save(action: () => Promise<void>) {
    setIsSaving(true);
    try {
      await action();
      onClose();
    } catch {
      showDialog('That swap didn’t save', 'Check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Animated.View
      style={[
        styles.menu,
        {
          height,
          opacity,
          marginBottom: open ? OPTION_GAP : 0,
        },
      ]}
      pointerEvents={open ? 'auto' : 'none'}>
      {chosen ? (
        <Pills>
          <Pill
            title="Just today"
            disabled={isSaving}
            onPress={() => save(() => onSwap(chosen, 'today'))}
          />
          <Pill
            title="Every time"
            detail="Replaces it in your programme"
            disabled={isSaving}
            onPress={() => save(() => onSwap(chosen, 'always'))}
          />
          <Pill title="Back" muted disabled={isSaving} onPress={() => setChosen(null)} />
        </Pills>
      ) : loadState === 'loading' ? (
        <Pills>
          <Status>
            <ActivityIndicator color={colours.accent} />
          </Status>
        </Pills>
      ) : loadState === 'error' ? (
        <Pills>
          <Status>
            <Text style={styles.status}>We couldn’t load alternatives. Try again.</Text>
          </Status>
        </Pills>
      ) : (
        <Pills>
          {canRestore && item.original && (
            <Pill
              title={`Back to ${item.original.name}`}
              detail="The exercise from your programme"
              icon="arrow-undo"
              disabled={isSaving}
              onPress={() => save(onRestore)}
            />
          )}
          {alternatives.map((exercise) => (
            <Pill
              key={exercise.id}
              title={exercise.name}
              detail={EQUIPMENT_LABELS[exercise.equipment]}
              icon="swap-horizontal"
              onPress={() => setChosen(exercise)}
            />
          ))}
          {trySomethingNew && (
            <Pill
              title={trySomethingNew.name}
              detail={`Try something new · ${ZONE_LABELS[trySomethingNew.zone]}`}
              icon="sparkles-outline"
              onPress={() => setChosen(trySomethingNew)}
            />
          )}
          {alternatives.length === 0 && !trySomethingNew && !canRestore && (
            <Status>
              <Text style={styles.status}>Nothing else for this muscle with your equipment.</Text>
            </Status>
          )}
        </Pills>
      )}
    </Animated.View>
  );
}

function Pills({ children }: { children: ReactNode }) {
  const items = Children.toArray(children);
  return (
    <>
      {items.map((child, index) => (
        <View key={index} style={index < items.length - 1 ? styles.slot : undefined}>
          {child}
        </View>
      ))}
    </>
  );
}

function Status({ children }: { children: ReactNode }) {
  return <View style={styles.statusPill}>{children}</View>;
}

function Pill({
  title,
  detail,
  icon,
  muted,
  disabled,
  onPress,
}: {
  title: string;
  detail?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  muted?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.pill, muted && styles.pillMuted, pressed && styles.pressed]}
      accessibilityRole="button">
      {icon ? (
        <Ionicons name={icon} size={20} color={colours.accent} style={styles.icon} />
      ) : (
        <View style={styles.icon} />
      )}
      <View style={styles.pillText}>
        <Text style={styles.pillTitle} numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text style={styles.pillDetail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  menu: {
    overflow: 'hidden',
  },
  slot: {
    marginBottom: OPTION_GAP,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: OPTION_HEIGHT,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colours.border,
    backgroundColor: colours.surface,
  },
  icon: {
    width: 20,
    marginRight: 10,
  },
  pillMuted: {
    backgroundColor: colours.background,
  },
  pillText: {
    flex: 1,
  },
  pillTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.text,
  },
  pillDetail: {
    fontSize: 13,
    color: colours.textMuted,
    marginTop: 1,
  },
  statusPill: {
    height: OPTION_HEIGHT,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colours.border,
    backgroundColor: colours.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  status: {
    fontSize: 15,
    color: colours.textMuted,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
