import { router } from 'expo-router';
import { Fragment, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import {
  AppText,
  Chip,
  ChipScroller,
  IconButton,
  PhotoFill,
  PrimaryButton,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { track } from '@/lib/analytics';
import {
  allEffortLabels,
  describeCardioError,
  effortLabel,
  logManualCardioSession,
  machineLabel,
  type CardioMachineId,
  type LoggedCardioMachineId,
} from '@/lib/cardio';
import {
  cardioBuilderSpec,
  cardioMinutesCountTowardWeek,
  justLogDateIsos,
  machineImageSlug,
} from '@/lib/cardioBuilderContent';
import { confirmFirstSessionSafety } from '@/lib/firstSession';
import { ensureSubscribed, useSubscriptionGate } from '@/lib/paywall';
import { formatShortDate, parseDate } from '@/lib/progress';

const spec = cardioBuilderSpec;
const logSpec = spec.justLogIt;

export default function JustLogScreen() {
  const allowed = useSubscriptionGate();
  const insets = useSafeAreaInsets();
  const { colours, spacing, radius } = useTheme();
  const dates = useMemo(() => justLogDateIsos(spec), []);
  const [machineId, setMachineId] = useState<LoggedCardioMachineId | null>(null);
  const [minutes, setMinutes] = useState(logSpec.minutes.default);
  const [effort, setEffort] = useState(logSpec.effortDefault);
  const [date, setDate] = useState(dates[0] ?? '');
  const [distance, setDistance] = useState('');
  const [effortOpen, setEffortOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!allowed) {
    return <View style={[styles.screen, { backgroundColor: colours.bg }]} />;
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/programmes');
  }

  async function handleSave() {
    if (!machineId || !date) return;
    if (!ensureSubscribed()) return;
    setSaving(true);
    try {
      const allowedSafety = await confirmFirstSessionSafety();
      if (!allowedSafety) return;
      const typed = distance.trim() ? Number(distance.replace(',', '.')) : null;
      const distanceKm = typed != null && Number.isFinite(typed) && typed >= 0 ? typed : null;
      await logManualCardioSession({
        machineId,
        minutes,
        effort,
        date,
        distanceKm,
      });
      track('cardio_logged_manually', { minutes });
      const counts = cardioMinutesCountTowardWeek(minutes, spec);
      goBack();
      showDialog(logSpec.savedToast, counts ? undefined : logSpec.shortNote);
    } catch (error) {
      showDialog(logSpec.title, describeCardioError(error));
    } finally {
      setSaving(false);
    }
  }

  const machines = spec.machinesOrder;
  const canSave = Boolean(machineId) && Boolean(date) && !saving;

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg, paddingTop: insets.top }]}>
      <View style={styles.top}>
        <IconButton icon="chevron-back" accessibilityLabel="Back" onPress={goBack} />
        <AppText variant="title2" style={{ color: colours.ink, flex: 1 }} numberOfLines={1}>
          {logSpec.title}
        </AppText>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: insets.bottom + 120,
            gap: spacing.lg,
          }}
          keyboardShouldPersistTaps="handled">
          <AppText variant="body" style={{ color: colours.inkMuted }}>
            {logSpec.sub}
          </AppText>

          <View>
            <AppText variant="title3" style={{ color: colours.ink, marginBottom: spacing.sm }}>
              {logSpec.machineLabel}
            </AppText>
            <View style={styles.machineGrid}>
              {machines.map((id, index) => {
                const selected = machineId === id;
                const oddLast = machines.length % 2 === 1 && index === machines.length - 1;
                return (
                  <Fragment key={id}>
                    {oddLast ? <View style={styles.machineSpacer} /> : null}
                    <MachineCell
                      id={id}
                      selected={selected}
                      onPress={() => setMachineId(id)}
                    />
                    {oddLast ? <View style={styles.machineSpacer} /> : null}
                  </Fragment>
                );
              })}
            </View>
            <Pressable
              onPress={() => setMachineId('other')}
              accessibilityRole="button"
              accessibilityState={{ selected: machineId === 'other' }}
              style={[
                styles.other,
                {
                  backgroundColor: machineId === 'other' ? colours.brandSoft : colours.surface,
                  borderRadius: radius.lg,
                  borderColor: machineId === 'other' ? colours.brand : 'transparent',
                },
              ]}>
              <AppText
                variant="bodyStrong"
                style={{ color: machineId === 'other' ? colours.brand : colours.ink, textAlign: 'center' }}>
                {logSpec.otherLabel}
              </AppText>
            </Pressable>
          </View>

          <StepperRow
            label={logSpec.minutesLabel}
            value={minutes}
            onMinus={() => setMinutes(Math.max(logSpec.minutes.min, minutes - 1))}
            onPlus={() => setMinutes(Math.min(logSpec.minutes.max, minutes + 1))}
          />
          {!cardioMinutesCountTowardWeek(minutes, spec) ? (
            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: -spacing.sm }}>
              {logSpec.shortNote}
            </AppText>
          ) : null}

          <View>
            <AppText variant="title3" style={{ color: colours.ink, marginBottom: spacing.sm }}>
              {logSpec.effortLabel}
            </AppText>
            <Pressable
              onPress={() => setEffortOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={effortLabel(effort)}
              style={[styles.effortCard, { backgroundColor: colours.surface, borderRadius: radius.lg }]}>
              <AppText variant="caption" style={{ color: colours.inkSubtle }}>
                {effort}
              </AppText>
              <AppText variant="body" style={{ color: colours.ink, flex: 1 }}>
                {effortLabel(effort)}
              </AppText>
            </Pressable>
          </View>

          <View>
            <AppText variant="title3" style={{ color: colours.ink, marginBottom: spacing.sm }}>
              {logSpec.dateLabel}
            </AppText>
            <ChipScroller>
              {dates.map((iso, index) => (
                <Chip
                  key={iso}
                  label={index === 0 ? 'Today' : formatShortDate(parseDate(iso))}
                  selected={date === iso}
                  onPress={() => setDate(iso)}
                />
              ))}
            </ChipScroller>
          </View>

          <View>
            <AppText variant="caption" style={{ color: colours.inkMuted, marginBottom: 6 }}>
              {logSpec.distanceLabel}
            </AppText>
            <TextInput
              value={distance}
              onChangeText={setDistance}
              keyboardType="decimal-pad"
              placeholder=""
              placeholderTextColor={colours.inkSubtle}
              accessibilityLabel={logSpec.distanceLabel}
              style={[
                styles.input,
                { color: colours.ink, backgroundColor: colours.surface, borderRadius: radius.md },
              ]}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
          label={saving ? 'Saving…' : logSpec.saveButton}
          loading={saving}
          disabled={!canSave}
          onPress={() => void handleSave()}
        />
      </View>

      <EffortPickerSheet
        visible={effortOpen}
        value={effort}
        onClose={() => setEffortOpen(false)}
        onPick={(value) => {
          setEffort(value);
          setEffortOpen(false);
        }}
      />
    </View>
  );
}

function MachineCell({
  id,
  selected,
  onPress,
}: {
  id: CardioMachineId;
  selected: boolean;
  onPress: () => void;
}) {
  const { colours, radius } = useTheme();
  const label = machineLabel(id);
  return (
    <Pressable
      onPress={onPress}
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
  );
}

function StepperRow({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: number;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const { colours, radius } = useTheme();
  return (
    <View style={styles.stepper}>
      <AppText variant="bodyStrong" style={{ color: colours.ink, flex: 1 }}>
        {label}
      </AppText>
      <Pressable
        onPress={onMinus}
        accessibilityRole="button"
        accessibilityLabel={`Fewer ${label}`}
        style={[styles.stepperBtn, { backgroundColor: colours.surfaceMuted, borderRadius: radius.full }]}>
        <AppText variant="title3" style={{ color: colours.brand }}>
          −
        </AppText>
      </Pressable>
      <AppText variant="title3" style={{ color: colours.ink, minWidth: 36, textAlign: 'center' }}>
        {value}
      </AppText>
      <Pressable
        onPress={onPlus}
        accessibilityRole="button"
        accessibilityLabel={`More ${label}`}
        style={[styles.stepperBtn, { backgroundColor: colours.surfaceMuted, borderRadius: radius.full }]}>
        <AppText variant="title3" style={{ color: colours.brand }}>
          +
        </AppText>
      </Pressable>
    </View>
  );
}

function EffortPickerSheet({
  visible,
  value,
  onClose,
  onPick,
}: {
  visible: boolean;
  value: number;
  onClose: () => void;
  onPick: (value: number) => void;
}) {
  const { colours, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colours.bg,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              paddingBottom: insets.bottom + 16,
            },
          ]}>
          <AppText variant="title2" style={{ color: colours.ink, paddingHorizontal: 24, paddingTop: 20 }}>
            {logSpec.effortLabel}
          </AppText>
          <ScrollView contentContainerStyle={{ padding: 24, gap: spacing.sm }}>
            {allEffortLabels().map((item) => {
              const selected = item.value === value;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => onPick(item.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.effortRow,
                    {
                      backgroundColor: selected ? colours.brandSoft : colours.surface,
                      borderRadius: radius.lg,
                    },
                  ]}>
                  <AppText variant="caption" style={{ color: colours.inkSubtle, width: 24 }}>
                    {item.value}
                  </AppText>
                  <AppText variant="body" style={{ color: colours.ink, flex: 1 }}>
                    {item.label}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
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
  other: {
    paddingVertical: 14,
    borderWidth: 2,
    marginTop: 2,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  effortCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  modalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    maxHeight: '80%',
  },
  effortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
});
