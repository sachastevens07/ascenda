import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colours } from '@/constants/theme';

type PlaceholderScreenProps = {
  title: string;
  description: string;
};

export function PlaceholderScreen({ title, description }: PlaceholderScreenProps) {
  return (
    <View style={styles.container}>
      <AppText variant="title1" style={{ color: colours.text, marginBottom: 8 }}>
        {title}
      </AppText>
      <AppText variant="body" style={{ color: colours.textMuted, textAlign: 'center' }}>
        {description}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colours.background,
  },
});
