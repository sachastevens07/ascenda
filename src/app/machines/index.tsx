import { router, type Href } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, IconButton, ListRow, PhotoFill, SectionHeader } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { aiCopy, machineCopy } from '@/lib/copy';
import {
  cardioMachineGuides,
  strengthMachineGuides,
  type MachineGuide,
} from '@/lib/machineGuides';
import { useSubscriptionGate } from '@/lib/paywall';

export default function MachineListScreen() {
  const insets = useSafeAreaInsets();
  const { colours, spacing } = useTheme();
  const allowed = useSubscriptionGate();
  const cardio = cardioMachineGuides();
  const strength = strengthMachineGuides();

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/programmes' as Href);
  }

  if (!allowed) {
    return <View style={[styles.screen, { backgroundColor: colours.bg }]} />;
  }

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg, paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <IconButton icon="chevron-back" accessibilityLabel="Back" onPress={goBack} />
        <IconButton
          icon="camera-outline"
          accessibilityLabel={aiCopy.scan_title}
          onPress={() => router.push('/machines/scan' as Href)}
        />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 32 }}>
        <SectionHeader title={machineCopy.browse} />
        <AppText variant="bodySm" style={{ color: colours.inkMuted, marginBottom: spacing.md }}>
          {machineCopy.learn_intro}
        </AppText>
        <MachineGroup label={machineCopy.cardio_group} guides={cardio} />
        <MachineGroup label={machineCopy.strength_group} guides={strength} />
      </ScrollView>
    </View>
  );
}

function MachineGroup({ label, guides }: { label: string; guides: MachineGuide[] }) {
  const { colours, radius } = useTheme();
  if (guides.length === 0) return null;
  return (
    <View style={{ marginBottom: 16 }}>
      <AppText variant="eyebrow" style={{ color: colours.accent, marginBottom: 8 }}>
        {label}
      </AppText>
      {guides.map((guide) => (
        <ListRow
          key={guide.id}
          title={guide.name}
          subtitle={guide.whereToFind}
          left={
            <View style={[styles.thumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}>
              <PhotoFill slug={guide.imageSlug} kind="equipment" label={guide.name} />
            </View>
          }
          onPress={() => router.push({ pathname: '/machines/[id]', params: { id: guide.id } } as Href)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  thumb: {
    width: 48,
    height: 48,
    overflow: 'hidden',
    position: 'relative',
  },
});
