import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ExerciseLibrary } from '@/components/ExerciseLibrary';
import { useTabBarHeight } from '@/components/PillTabBar';
import { RoutineCatalogue } from '@/components/RoutineCatalogue';
import { colours } from '@/constants/theme';

const SECTIONS = [
  { id: 'routines', label: 'Routines' },
  { id: 'stretches', label: 'Stretches' },
  { id: 'exercises', label: 'Exercises' },
] as const;

type Section = (typeof SECTIONS)[number]['id'];

export default function ProgrammesScreen() {
  const tabBarHeight = useTabBarHeight();
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
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Programmes</Text>
        <View style={styles.tabRow} accessibilityRole="tablist">
          {SECTIONS.map((item) => {
            const selected = section === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setSection(item.id)}
                style={[styles.tabChip, selected && styles.tabChipOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected }}>
                <Text style={[styles.tabChipText, selected && styles.tabChipTextOn]}>{item.label}</Text>
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
    backgroundColor: colours.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colours.text,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabChip: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.surface,
  },
  tabChipOn: {
    backgroundColor: colours.accent,
  },
  tabChipText: {
    fontSize: 15,
    fontWeight: '700',
    color: colours.textMuted,
  },
  tabChipTextOn: {
    color: colours.surface,
  },
});
