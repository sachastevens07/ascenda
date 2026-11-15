import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { showDialog } from '@/components/Dialog';
import { AppText, EmptyState } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import {
  deleteCoachPreference,
  fetchCoachPreferences,
  preferenceLabel,
  type CoachPreference,
} from '@/lib/coachPreferences';
import { exerciseNameFromSlug } from '@/lib/onboardingAnswers';

export default function CoachPreferencesScreen() {
  const { colours, spacing, radius } = useTheme();
  const [prefs, setPrefs] = useState<CoachPreference[]>([]);

  const load = useCallback(() => {
    fetchCoachPreferences().then(setPrefs).catch(() => setPrefs([]));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <Stack.Screen options={{ title: 'Coach preferences' }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.md }}>
        <AppText variant="body" style={{ color: colours.inkMuted }}>
          Coach uses these when it reworks a session or builds a new one. Remove any you no longer want.
        </AppText>
        {prefs.length === 0 ? (
          <EmptyState
            title="No saved preferences"
            body="When you ask Coach to skip an exercise or a piece of kit, it will show up here."
          />
        ) : (
          prefs.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => {
                showDialog('Remove this preference?', 'Coach will stop using it after you remove it.', [
                  {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => {
                      void deleteCoachPreference(item.id).then(load);
                    },
                  },
                  { text: 'Keep it', style: 'cancel' },
                ]);
              }}
              style={[styles.row, { backgroundColor: colours.surface, borderRadius: radius.md }]}>
              <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                {preferenceLabel(item, item.exercise_id ? exerciseNameFromSlug(item.exercise_id) : undefined)}
              </AppText>
              <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 4 }}>
                Tap to remove
              </AppText>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  row: { padding: 14 },
});
