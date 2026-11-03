import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/constants/theme';
import type { LegalSection } from '@/lib/legal';

export function LegalPage({ title, sections }: { title: string; sections: LegalSection[] }) {
  const insets = useSafeAreaInsets();
  const { colours, type, spacing } = useTheme();

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colours.bg }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32, gap: spacing.md }]}
      showsVerticalScrollIndicator={false}>
      <Stack.Screen
        options={{
          headerShown: true,
          title,
          headerBackTitle: 'Back',
          headerTintColor: colours.brand,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colours.bg },
          headerTitleStyle: { color: colours.ink },
        }}
      />
      <Text style={[type.title2, { color: colours.ink }]}>{title}</Text>
      {sections.map((section) => (
        <View key={section.heading ?? section.body} style={{ gap: 8 }}>
          {section.heading ? (
            <Text style={[type.title3, { color: colours.ink }]}>{section.heading}</Text>
          ) : null}
          <Text style={[type.body, { color: colours.ink }]}>{section.body}</Text>
        </View>
      ))}
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
