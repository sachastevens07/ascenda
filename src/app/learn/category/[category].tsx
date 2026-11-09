import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, ArticleCard, ListRow, PhotoFill, SectionHeader } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { machineCopy } from '@/lib/copy';
import {
  LEARN_CATEGORY_LABELS,
  articlesInCategory,
  fetchLearnArticles,
  isLearnCategory,
  type LearnArticle,
} from '@/lib/learn';
import {
  cardioMachineGuides,
  strengthMachineGuides,
  type MachineGuide,
} from '@/lib/machineGuides';

export default function LearnCategoryScreen() {
  const { category: raw } = useLocalSearchParams<{ category: string }>();
  const { colours, spacing } = useTheme();
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
          {category === 'gym_confidence' ? <MachineGuidesBlock /> : null}
          <AppText variant="body" style={{ color: colours.inkMuted }}>
            Short reads to sit beside your training.
          </AppText>
          {articles.length === 0 ? (
            <AppText variant="body" style={{ color: colours.inkMuted }}>Nothing in this category yet.</AppText>
          ) : (
            articles.map((article) => <ArticleCard key={article.id} article={article} />)
          )}
        </ScrollView>
      )}
    </View>
  );
}

function MachineGuidesBlock() {
  const { colours } = useTheme();
  const cardio = cardioMachineGuides();
  const strength = strengthMachineGuides();
  return (
    <View>
      <SectionHeader title={machineCopy.learn_section} />
      <AppText variant="bodySm" style={{ color: colours.inkMuted, marginBottom: 8 }}>
        {machineCopy.learn_intro}
      </AppText>
      <MachineGroup label={machineCopy.cardio_group} guides={cardio} />
      <MachineGroup label={machineCopy.strength_group} guides={strength} />
    </View>
  );
}

function MachineGroup({ label, guides }: { label: string; guides: MachineGuide[] }) {
  const { colours, radius } = useTheme();
  if (guides.length === 0) return null;
  return (
    <View style={{ marginBottom: 12 }}>
      <AppText variant="eyebrow" style={{ color: colours.accent, marginBottom: 8 }}>
        {label}
      </AppText>
      {guides.map((guide) => (
        <ListRow
          key={guide.id}
          title={guide.name}
          subtitle={guide.whereToFind}
          left={
            <View style={[styles.thumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}>
              <PhotoFill slug={guide.imageSlug} kind="equipment" label={guide.name} />
            </View>
          }
          onPress={() => router.push({ pathname: '/machines/[id]', params: { id: guide.id } } as Href)}
        />
      ))}
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
  thumb: {
    width: 48,
    height: 48,
    overflow: 'hidden',
    position: 'relative',
  },
});
