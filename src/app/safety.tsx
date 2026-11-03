import { Stack } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DisclaimerBody } from '@/components/ui/Disclaimer';
import { useTheme } from '@/constants/theme';

/** Full safety guidance. Keep the wording in `src/lib/disclaimer.ts`. */
export default function SafetyScreen() {
  const insets = useSafeAreaInsets();
  const { colours } = useTheme();

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colours.bg }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Safety and disclaimer',
          headerBackTitle: 'Back',
          headerTintColor: colours.brand,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colours.bg },
          headerTitleStyle: { color: colours.ink },
        }}
      />
      <DisclaimerBody />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
});
