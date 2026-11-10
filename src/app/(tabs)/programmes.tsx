import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CardioCatalogue } from '@/components/CardioCatalogue';
import { ExerciseLibrary } from '@/components/ExerciseLibrary';
import { useTabBarHeight } from '@/components/PillTabBar';
import { RoutineBrowse } from '@/components/RoutineBrowse';
import { RoutineCatalogue } from '@/components/RoutineCatalogue';
import { AppText, IconButton, TabAvatar } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { aiCopy, cardioCopy, programmesCopy } from '@/lib/copy';
import { ensureSubscribed } from '@/lib/paywall';

const SECTIONS = [
  { id: 'routines', label: 'Routines' },
  { id: 'cardio', label: cardioCopy.tab },
  { id: 'stretches', label: 'Stretches' },
  { id: 'exercises', label: 'Exercises' },
] as const;

type Section = (typeof SECTIONS)[number]['id'];

export default function ProgrammesScreen() {
  const tabBarHeight = useTabBarHeight();
  const { colours } = useTheme();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const requested = Array.isArray(params.section) ? params.section[0] : params.section;
  const [section, setSection] = useState<Section>(
    requested === 'stretches' || requested === 'exercises' || requested === 'routines' || requested === 'cardio'
      ? requested
      : 'routines'
  );

  useEffect(() => {
    if (
      requested === 'stretches' ||
      requested === 'exercises' ||
      requested === 'routines' ||
      requested === 'cardio'
    ) {
      setSection(requested);
    }
  }, [requested]);

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <TabAvatar />
          <AppText variant="title1" style={{ color: colours.ink, flex: 1 }}>{programmesCopy.tab_title}</AppText>
          <IconButton
            icon="camera-outline"
            accessibilityLabel={aiCopy.scan_title}
            onPress={() => {
              if (!ensureSubscribed()) return;
              router.push('/machines/scan' as Href);
            }}
          />
        </View>
        <View
          style={[styles.tabRow, { borderBottomColor: colours.border }]}
          accessibilityRole="tablist">
          {SECTIONS.map((item) => {
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
          onOpenStretches={() => setSection('stretches')}
          onOpenCardio={() => setSection('cardio')}
        />
      )}
      {section === 'cardio' && <CardioCatalogue bottomInset={tabBarHeight} />}
      {section === 'exercises' && <ExerciseLibrary title={null} bottomInset={tabBarHeight} />}
      {section === 'stretches' && (
        <RoutineCatalogue showTitle={false} bottomInset={tabBarHeight} routineType="stretch" />
      )}
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
