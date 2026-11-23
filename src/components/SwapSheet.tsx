import Ionicons from '@expo/vector-icons/Ionicons';
import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { showDialog } from '@/components/Dialog';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';
import { preferredSwapIds } from '@/lib/contentGuides';
import { loggerCopy } from '@/lib/copy';
import { EQUIPMENT_LABELS, type Zone } from '@/lib/exercises';
import type { EquipmentAccess } from '@/lib/profile';
import type { ProgrammeExercise, SlotExercise } from '@/lib/programmes';
import { exerciseFits, fetchAlternatives, type SwapScope } from '@/lib/swaps';

type SwapSheetProps = {
  open: boolean;
  item: ProgrammeExercise;
  equipment: EquipmentAccess;
  /** Optional zone cap. Omit it so any same-muscle swap on her kit is allowed. */
  maxZone?: Zone;
  /** Exercises already in the day, which can't be offered. */
  excludeIds: string[];
  onClose: () => void;
  onSwap: (exercise: SlotExercise, scope: SwapScope) => Promise<void>;
  /** Puts the programme's own exercise back, today and in her programme. */
  onRestore: () => Promise<void>;
  /** Hide "Every time" on the shared starter (it can't be edited). Default true. */
  allowAlways?: boolean;
  alwaysDetail?: string;
};

type LoadState = 'loading' | 'error' | 'ready';

const OPTION_HEIGHT = 56;
const EMPTY_STATUS_HEIGHT = 88;
const OPTION_GAP = 8;
const ANIM_MS = 220;

function menuHeight(pills: number, emptyStatus: boolean): number {
  if (pills <= 0) return emptyStatus ? EMPTY_STATUS_HEIGHT : OPTION_HEIGHT;
  if (!emptyStatus) return pills * OPTION_HEIGHT + (pills - 1) * OPTION_GAP;
  const extra = EMPTY_STATUS_HEIGHT - OPTION_HEIGHT;
  return pills * OPTION_HEIGHT + (pills - 1) * OPTION_GAP + extra;
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
  allowAlways = true,
  alwaysDetail = 'Replaces it in your programme',
}: SwapSheetProps) {
  const { colours } = useTheme();
  const [alternatives, setAlternatives] = useState<SlotExercise[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [chosen, setChosen] = useState<SlotExercise | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const height = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const excludeKey = excludeIds.join(',');
  const canRestore = Boolean(item.original && exerciseFits(item.original, equipment, maxZone));

  const showEmpty = loadState === 'ready' && !chosen && alternatives.length === 0;
  const pillCount = chosen
    ? allowAlways ? 3 : 2
    : loadState === 'ready'
      ? (canRestore ? 1 : 0) + alternatives.length + (showEmpty ? 1 : 0)
      : 1;
  const targetHeight = open ? menuHeight(pillCount, showEmpty) : 0;

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
    if (!open) return;
    let isCurrent = true;
    setLoadState('loading');
    fetchAlternatives(
      item.exercise,
      equipment,
      excludeKey.split(',').filter(Boolean),
      maxZone,
      preferredSwapIds(item.exercise.id)
    )
      .then((result) => {
        if (!isCurrent) return;
        setAlternatives(result.alternatives);
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
          {allowAlways && (
            <Pill
              title="Every time"
              detail={alwaysDetail}
              disabled={isSaving}
              onPress={() => save(() => onSwap(chosen, 'always'))}
            />
          )}
          <Pill title="Back" muted disabled={isSaving} onPress={() => setChosen(null)} />
        </Pills>
      ) : loadState === 'loading' ? (
        <Pills>
          <Status>
            <ActivityIndicator color={colours.brand} />
          </Status>
        </Pills>
      ) : loadState === 'error' ? (
        <Pills>
          <Status>
            <AppText variant="bodySm" style={{ color: colours.inkMuted, textAlign: 'center' }}>
              We couldn’t load alternatives. Try again.
            </AppText>
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
          {showEmpty && (
            <Status>
              <AppText variant="bodySm" style={{ color: colours.inkMuted, textAlign: 'center' }}>
                {loggerCopy.swap_none}
              </AppText>
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
  const { colours } = useTheme();
  return (
    <View
      style={[
        styles.statusPill,
        { borderColor: colours.border, backgroundColor: colours.surface },
      ]}>
      {children}
    </View>
  );
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
  const { colours } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.pill,
        {
          borderColor: colours.border,
          backgroundColor: muted ? colours.bg : colours.surface,
        },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button">
      {icon ? (
        <Ionicons name={icon} size={20} color={colours.brand} style={styles.icon} />
      ) : (
        <View style={styles.icon} />
      )}
      <View style={styles.pillText}>
        <AppText variant="bodyStrong" style={{ color: colours.ink }} numberOfLines={1}>
          {title}
        </AppText>
        {detail ? (
          <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 1 }} numberOfLines={1}>
            {detail}
          </AppText>
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
  },
  icon: {
    width: 20,
    marginRight: 10,
  },
  pillText: {
    flex: 1,
  },
  statusPill: {
    minHeight: EMPTY_STATUS_HEIGHT,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pressed: {
    opacity: 0.7,
  },
});
