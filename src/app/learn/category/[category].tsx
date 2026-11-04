import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ArticleCard } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import {
  LEARN_CATEGORY_LABELS,
  articlesInCategory,
  fetchLearnArticles,
  isLearnCategory,
  type LearnArticle,
} from '@/lib/learn';

export default function LearnCategoryScreen() {
  const { category: raw } = useLocalSearchParams<{ category: string }>();
  const { colours, type, spacing } = useTheme();
  const category = isLearnCategory(raw) ? raw : null;
  const [articles, setArticles] = useState<LearnArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;
    fetchLearnArticles()
      .then((list) => {
        if (!isCurrent) return;
        setArticles(category ? articlesInCategory(list, category) : []);
        setLoading(false);
      })
      .catch(() => {
        if (isCurrent) setLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [category]);

  const title = category ? LEARN_CATEGORY_LABELS[category] : 'Learn';

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <Stack.Screen options={{ title }} />
      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={colours.brand} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { gap: spacing.md }]}>
          <Text style={[type.body, { color: colours.inkMuted }]}>
            Short reads. Most are free. A few in-depth guides are Pro.
          </Text>
          {articles.length === 0 ? (
            <Text style={[type.body, { color: colours.inkMuted }]}>Nothing in this category yet.</Text>
          ) : (
            articles.map((article) => <ArticleCard key={article.id} article={article} />)
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
