import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { fonts } from '@/constants/fonts';
import { useTheme } from '@/constants/theme';
import type { LegalSection } from '@/lib/legal';

export function LegalPage({ title, sections }: { title: string; sections: LegalSection[] }) {
  const insets = useSafeAreaInsets();
  const { colours, spacing } = useTheme();

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
          headerTitleStyle: { color: colours.ink, fontFamily: fonts.bold },
        }}
      />
      <AppText variant="title2" style={{ color: colours.ink }}>
        {title}
      </AppText>
      {sections.map((section) => (
        <View key={section.heading ?? section.body} style={{ gap: 8 }}>
          {section.heading ? (
            <AppText variant="title3" style={{ color: colours.ink }}>
              {section.heading}
            </AppText>
          ) : null}
          <AppText variant="body" style={{ color: colours.ink }}>
            {section.body}
          </AppText>
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
