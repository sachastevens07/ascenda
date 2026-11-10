import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  ButtonRow,
  Chip,
  PrimaryButton,
  SecondaryButton,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { aiCopy, fillCopy, loggerCopy } from '@/lib/copy';
import {
  BUSY_GYM_ENERGY,
  BUSY_GYM_MINUTES,
  busyGymEquipmentLabel,
  catalogueExercise,
  equipmentInSession,
  remainingBusyGymItems,
  type BusyGymEnergy,
  type BusyGymMinutes,
  type BusyGymPlan,
} from '@/lib/busyGym';
import { requestBusyGymFix } from '@/lib/busyGymFix';
import { trackAi } from '@/lib/analytics';
import type { Equipment } from '@/lib/exercises';
import type { ProgrammeDay, SlotExercise } from '@/lib/programmes';
import type { SetEntry } from '@/lib/workoutLog';

type BusyGymSheetProps = {
  open: boolean;
  day: ProgrammeDay | null;
  entries: Record<string, SetEntry>;
  seedEquipment?: Equipment | null;
  onClose: () => void;
  onApply: (plan: BusyGymPlan, byId: Map<string, SlotExercise>) => Promise<void>;
};

function nameFor(id: string, byId: Map<string, SlotExercise>): string {
  return byId.get(id)?.name ?? catalogueExercise(id)?.name ?? id;
}

export function BusyGymSheet({
  open,
  day,
  entries,
  seedEquipment = null,
  onClose,
  onApply,
}: BusyGymSheetProps) {
  const insets = useSafeAreaInsets();
  const { colours, radius, shadow } = useTheme();
  const remaining = useMemo(
    () => (day ? remainingBusyGymItems(day, entries) : []),
    [day, entries]
  );
  const equipment = useMemo(() => equipmentInSession(remaining), [remaining]);
  const [unavailable, setUnavailable] = useState<Equipment[]>([]);
  const [minutes, setMinutes] = useState<BusyGymMinutes>(30);
  const [energy, setEnergy] = useState<BusyGymEnergy>('normal');
  const [plan, setPlan] = useState<BusyGymPlan | null>(null);
  const [byId, setById] = useState<Map<string, SlotExercise>>(new Map());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    const seeded = seedEquipment && equipment.includes(seedEquipment) ? [seedEquipment] : [];
    setUnavailable(seeded);
    setMinutes(30);
    setEnergy('normal');
    setPlan(null);
    setById(new Map());
    setNotice(null);
    setBusy(false);
    setApplying(false);
  }, [open, seedEquipment, equipment]);

  function toggleEquipment(value: Equipment) {
    setUnavailable((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
    setPlan(null);
  }

  async function submit() {
    if (!day || remaining.length === 0 || busy) return;
    setBusy(true);
    setNotice(null);
    const outcome = await requestBusyGymFix({
      day,
      entries,
      unavailable,
      minutesLeft: minutes,
      energy,
    });
    setBusy(false);
    if (outcome.kind === 'limit') {
      setNotice(aiCopy.busy_limit);
      return;
    }
    if (outcome.kind !== 'ok') {
      setNotice(aiCopy.busy_error);
      return;
    }
    setById(outcome.byId);
    setPlan(outcome.plan);
    if (outcome.plan.fallback) setNotice(aiCopy.busy_fallback);
  }

  async function apply() {
    if (!plan || applying) return;
    setApplying(true);
    try {
      await onApply(plan, byId);
      trackAi('ai_result_accepted', 'busy_gym');
      onClose();
    } catch {
      setNotice(aiCopy.busy_error);
    } finally {
      setApplying(false);
    }
  }

  function keepOriginal() {
    if (plan) trackAi('ai_result_rejected', 'busy_gym');
    onClose();
  }

  const remainingById = new Map(remaining.map((item) => [item.exercise.id, item]));

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={keepOriginal}>
      <Pressable style={styles.backdrop} onPress={keepOriginal}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colours.surface,
              borderRadius: radius.lg,
              paddingBottom: Math.max(20, insets.bottom),
            },
            shadow,
          ]}
          onPress={() => {}}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}>
            <AppText variant="title3" style={{ color: colours.ink }}>
              {aiCopy.busy_title}
            </AppText>
            <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
              {aiCopy.busy_body}
            </AppText>
            <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
              {loggerCopy.today_only_note}
            </AppText>

            {plan ? (
              <>
                {notice ? (
                  <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
                    {notice}
                  </AppText>
                ) : null}
                <AppText variant="eyebrow" style={{ color: colours.accent }}>
                  {aiCopy.busy_before}
                </AppText>
                {remaining.map((item) => (
                  <AppText key={item.exercise.id} variant="body" style={{ color: colours.ink }}>
                    {item.exercise.name}
                    {` · ${item.sets} × ${item.rep_min}-${item.rep_max}`}
                  </AppText>
                ))}
                <AppText variant="eyebrow" style={{ color: colours.accent, marginTop: 8 }}>
                  {aiCopy.busy_after}
                </AppText>
                {plan.summary ? (
                  <AppText variant="body" style={{ color: colours.ink }}>
                    {plan.summary}
                  </AppText>
                ) : null}
                {plan.exercises.map((row) => {
                  const from = remainingById.get(row.replaces);
                  const toName = nameFor(row.exercise_id, byId);
                  const swapped = from && from.exercise.id !== row.exercise_id;
                  return (
                    <AppText key={`${row.replaces}:${row.exercise_id}`} variant="body" style={{ color: colours.ink }}>
                      {swapped
                        ? fillCopy(aiCopy.busy_swap_line, { from: from.exercise.name, to: toName })
                        : toName}
                      {` · ${row.sets} × ${row.rep_min}-${row.rep_max}`}
                    </AppText>
                  );
                })}
                {remaining
                  .filter((item) => !plan.exercises.some((row) => row.replaces === item.exercise.id))
                  .map((item) => (
                    <AppText key={`drop-${item.exercise.id}`} variant="bodySm" style={{ color: colours.inkMuted }}>
                      {fillCopy(aiCopy.busy_dropped, { name: item.exercise.name })}
                    </AppText>
                  ))}
                <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 8 }}>
                  {aiCopy.busy_ai_label}
                </AppText>
                <ButtonRow>
                  <SecondaryButton
                    label={aiCopy.busy_keep}
                    onPress={keepOriginal}
                    style={styles.flex}
                  />
                  <PrimaryButton
                    label={aiCopy.busy_use}
                    onPress={() => void apply()}
                    loading={applying}
                    style={styles.flex}
                  />
                </ButtonRow>
              </>
            ) : (
              <>
                <AppText variant="eyebrow" style={{ color: colours.accent }}>
                  {aiCopy.busy_equipment}
                </AppText>
                <View style={styles.chips}>
                  {equipment.map((item) => (
                    <Chip
                      key={item}
                      label={busyGymEquipmentLabel(item)}
                      selected={unavailable.includes(item)}
                      onPress={() => toggleEquipment(item)}
                      size="lg"
                    />
                  ))}
                </View>
                <AppText variant="eyebrow" style={{ color: colours.accent }}>
                  {aiCopy.busy_minutes}
                </AppText>
                <View style={styles.chips}>
                  {BUSY_GYM_MINUTES.map((value) => (
                    <Chip
                      key={value}
                      label={fillCopy(aiCopy.busy_minutes_label, { minutes: value })}
                      selected={minutes === value}
                      onPress={() => {
                        setMinutes(value);
                        setPlan(null);
                      }}
                      size="lg"
                    />
                  ))}
                </View>
                <AppText variant="eyebrow" style={{ color: colours.accent }}>
                  {aiCopy.busy_energy}
                </AppText>
                <View style={styles.chips}>
                  {BUSY_GYM_ENERGY.map((value) => (
                    <Chip
                      key={value}
                      label={
                        value === 'low'
                          ? aiCopy.busy_energy_low
                          : value === 'high'
                            ? aiCopy.busy_energy_high
                            : aiCopy.busy_energy_normal
                      }
                      selected={energy === value}
                      onPress={() => {
                        setEnergy(value);
                        setPlan(null);
                      }}
                      size="lg"
                    />
                  ))}
                </View>
                {notice ? (
                  <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
                    {notice}
                  </AppText>
                ) : null}
                <PrimaryButton
                  label={busy ? aiCopy.busy_checking : aiCopy.busy_submit}
                  onPress={() => void submit()}
                  loading={busy}
                  disabled={remaining.length === 0}
                />
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(44, 24, 16, 0.4)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    maxHeight: '88%',
    padding: 20,
  },
  scroll: {
    gap: 10,
    paddingBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  flex: {
    flex: 1,
  },
});
