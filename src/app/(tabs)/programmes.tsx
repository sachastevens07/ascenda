import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardioCatalogue } from '@/components/CardioCatalogue';
import { ExerciseLibrary } from '@/components/ExerciseLibrary';
import { useTabBarHeight } from '@/components/PillTabBar';
import { RoutineBrowse } from '@/components/RoutineBrowse';
import { RoutineCatalogue } from '@/components/RoutineCatalogue';
import { AppText, CoachButton, IconButton, TabAvatar } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { isFeatureEnabled, useFeature } from '@/config/features';
import { cardioCopy, programmesCopy } from '@/lib/copy';

const ALL_SECTIONS = [
  { id: 'routines', label: 'Routines' },
  { id: 'cardio', label: cardioCopy.tab },
  { id: 'stretches', label: 'Stretches' },
  { id: 'exercises', label: 'Exercises' },
] as const;

type Section = (typeof ALL_SECTIONS)[number]['id'];

function visibleSections(): (typeof ALL_SECTIONS)[number][] {
  if (isFeatureEnabled('stretches')) return [...ALL_SECTIONS];
  return ALL_SECTIONS.filter((item) => item.id !== 'stretches');
}

export default function ProgrammesScreen() {
  const tabBarHeight = useTabBarHeight();
  const insets = useSafeAreaInsets();
  const { colours } = useTheme();
  const stretchesOn = useFeature('stretches');
  const sections = visibleSections();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const requested = Array.isArray(params.section) ? params.section[0] : params.section;
  const [section, setSection] = useState<Section>(() => {
    if (requested === 'stretches' && !isFeatureEnabled('stretches')) return 'routines';
    if (requested === 'stretches' || requested === 'exercises' || requested === 'routines' || requested === 'cardio') {
      return requested;
    }
    return 'routines';
  });

  useEffect(() => {
    if (requested === 'stretches' && !stretchesOn) {
      setSection('routines');
      return;
    }
    if (
      requested === 'stretches' ||
      requested === 'exercises' ||
      requested === 'routines' ||
      requested === 'cardio'
    ) {
      setSection(requested);
    }
  }, [requested, stretchesOn]);

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.titleRow}>
          <TabAvatar />
          <AppText variant="title1" style={{ color: colours.ink, flex: 1 }}>{programmesCopy.tab_title}</AppText>
          <CoachButton />
        </View>
        <View
          style={[styles.tabRow, { borderBottomColor: colours.border }]}
          accessibilityRole="tablist">
          {sections.map((item) => {
            const selected = section === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setSection(item.id)}
                style={styles.tab}
                accessibilityRole="tab"
                accessibilityState={{ selected }}>
                <AppText variant="bodySm" style={{ color: selected ? colours.ink : colours.inkMuted }}>
                  {item.label}
                </AppText>
                <View
                  style={[
                    styles.underline,
                    { backgroundColor: selected ? colours.brand : 'transparent' },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      </View>

      {section === 'routines' && (
        <RoutineBrowse
          bottomInset={tabBarHeight}
          onOpenStretches={stretchesOn ? () => setSection('stretches') : undefined}
          onOpenCardio={() => setSection('cardio')}
        />
      )}
      {section === 'cardio' && <CardioCatalogue bottomInset={tabBarHeight} />}
      {section === 'exercises' && <ExerciseLibrary title={null} bottomInset={tabBarHeight} />}
      {section === 'stretches' && stretchesOn ? (
        <RoutineCatalogue showTitle={false} bottomInset={tabBarHeight} routineType="stretch" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tabRow: {
    flexDirection: 'row',
    marginTop: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 10,
  },
  underline: {
    marginTop: 10,
    height: 2,
    alignSelf: 'stretch',
    borderRadius: 999,
  },
});
