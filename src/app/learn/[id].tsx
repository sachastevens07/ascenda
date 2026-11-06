import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  AppText,
  ArticleBody,
  HeroImage,
  PrimaryButton,
  RelatedLearn,
  SafetyNotice,
  SecondaryButton,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import {
  LEARN_CATEGORY_LABELS,
  articleImage,
  fetchLearnArticle,
  fetchReadArticleIds,
  formatReadMinutes,
  markArticleRead,
  recordArticleOpened,
  type LearnArticle,
} from '@/lib/learn';
import { trackLearnArticleOpened } from '@/lib/analytics';

type LoadState = 'loading' | 'missing' | 'ready';

export default function LearnArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colours, spacing, radius } = useTheme();
  const [article, setArticle] = useState<LearnArticle | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [isRead, setIsRead] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    fetchLearnArticle(id)
      .then((next) => {
        if (!isCurrent) return;
        setArticle(next);
        setLoadState(next ? 'ready' : 'missing');
        if (next) {
          void recordArticleOpened(next.id);
          trackLearnArticleOpened(next.id);
        }
      })
      .catch(() => {
        if (isCurrent) setLoadState('missing');
      });
    fetchReadArticleIds()
      .then((ids) => {
        if (isCurrent && id) setIsRead(ids.has(id));
      })
      .catch(() => {});
    return () => {
      isCurrent = false;
    };
  }, [id]);

  if (loadState !== 'ready' || !article) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg }]}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.brand} />
        ) : (
          <AppText variant="body" style={{ color: colours.inkMuted, textAlign: 'center' }}>
            We could not find that article.
          </AppText>
        )}
      </View>
    );
  }

  async function handleRead() {
    const articleId = article?.id;
    if (!articleId) return;
    setIsSaving(true);
    try {
      await markArticleRead(articleId);
      setIsRead(true);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colours.bg }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <HeroImage
        image={articleImage(article)}
        title={article.title}
        eyebrow={LEARN_CATEGORY_LABELS[article.category]}
        height={220}
      />
      <View style={styles.body}>
        <View style={styles.meta}>
          <AppText variant="caption" style={{ color: colours.inkMuted }}>
            {LEARN_CATEGORY_LABELS[article.category]} · {formatReadMinutes(article.read_minutes)}
          </AppText>
        </View>
        <AppText variant="body" style={{ color: colours.inkMuted }}>{article.summary}</AppText>

        <ArticleBody markdown={article.body_markdown} />

        {article.sources.length > 0 ? (
          <View style={{ gap: 8, marginTop: spacing.lg }}>
            <AppText variant="title3" style={{ color: colours.ink }}>Sources</AppText>
            {article.sources.map((source) => (
              <Pressable
                key={source.url}
                onPress={() => void Linking.openURL(source.url)}
                accessibilityRole="link"
                accessibilityLabel={source.label}>
                <AppText variant="bodySm" style={{ color: colours.brand }}>{source.label}</AppText>
              </Pressable>
            ))}
          </View>
        ) : null}

        <SecondaryButton
          label={isRead ? 'Marked as read' : isSaving ? 'Saving…' : 'Mark as read'}
          onPress={() => void handleRead()}
          disabled={isRead || isSaving}
          style={{ marginTop: spacing.lg }}
        />

        <RelatedLearn
          category={article.category}
          excludeId={article.id}
          style={{ marginTop: spacing.lg }}
        />
        <SafetyNotice style={{ marginTop: spacing.lg }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 40,
  },
  body: {
    padding: 24,
    gap: 16,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  lock: {
    padding: 16,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
