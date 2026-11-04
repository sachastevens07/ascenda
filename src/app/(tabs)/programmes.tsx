import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ExerciseLibrary } from '@/components/ExerciseLibrary';
import { useTabBarHeight } from '@/components/PillTabBar';
import { RoutineCatalogue } from '@/components/RoutineCatalogue';
import { AppText, TabAvatar } from '@/components/ui';
import { useTheme } from '@/constants/theme';

const SECTIONS = [
  { id: 'routines', label: 'Routines' },
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
    requested === 'stretches' || requested === 'exercises' || requested === 'routines' ? requested : 'routines'
  );

  useEffect(() => {
    if (requested === 'stretches' || requested === 'exercises' || requested === 'routines') {
      setSection(requested);
    }
  }, [requested]);

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <TabAvatar />
          <AppText variant="title1" style={{ color: colours.ink, flex: 1 }}>Programmes</AppText>
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
                <AppText variant="title3" style={{ color: selected ? colours.ink : colours.inkMuted }}>
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
        <RoutineCatalogue showTitle={false} bottomInset={tabBarHeight} routineType="strength" />
      )}
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
