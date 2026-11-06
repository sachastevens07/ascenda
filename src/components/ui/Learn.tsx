import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { CoverPlaceholder } from '@/components/ui/Cards';
import { SectionHeader } from '@/components/ui/List';
import { useTheme } from '@/constants/theme';
import { trackLearnArticleOpened } from '@/lib/analytics';
import {
  LEARN_CATEGORY_COVERS,
  LEARN_CATEGORY_LABELS,
  articleImage,
  fetchLearnArticles,
  fetchLearnLinks,
  formatReadMinutes,
  learnImage,
  parseArticleBody,
  recordArticleOpened,
  relatedArticles,
  type LearnArticle,
  type LearnCategory,
} from '@/lib/learn';
export function openLearnArticle(article: LearnArticle): void {
  void recordArticleOpened(article.id);
  trackLearnArticleOpened(article.id);
  router.push({ pathname: '/learn/[id]', params: { id: article.id } } as Href);
}

export function ArticleCard({
  article,
  style,
  width,
}: {
  article: LearnArticle;
  style?: StyleProp<ViewStyle>;
  width?: number;
}) {
  const { colours, radius, shadow } = useTheme();
  const image = articleImage(article);
  return (
    <Pressable
      onPress={() => openLearnArticle(article)}
      accessibilityRole="button"
      accessibilityLabel={article.title}
      style={({ pressed }) => [style, pressed && styles.pressed]}>
      <View style={[{ backgroundColor: colours.surface, borderRadius: radius.lg, width }, shadow]}>
        <View style={[styles.photo, { backgroundColor: colours.surfaceMuted, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }]}>
          {image ? (
            <Image source={image} style={styles.fill} resizeMode="cover" />
          ) : (
            <CoverPlaceholder />
          )}
        </View>
        <View style={styles.cardBody}>
          <AppText variant="eyebrow" style={{ color: colours.accent }}>
            {LEARN_CATEGORY_LABELS[article.category]}
          </AppText>
          <AppText variant="title3" style={{ color: colours.ink, marginTop: 6 }} numberOfLines={2}>
            {article.title}
          </AppText>
          <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 6 }}>
            {formatReadMinutes(article.read_minutes)}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

export function CategoryTile({
  category,
  style,
}: {
  category: LearnCategory;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius } = useTheme();
  const image = learnImage(LEARN_CATEGORY_COVERS[category]);
  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/learn/category/[category]', params: { category } } as Href)
      }
      accessibilityRole="button"
      accessibilityLabel={LEARN_CATEGORY_LABELS[category]}
      style={({ pressed }) => [styles.tile, { borderRadius: radius.lg }, style, pressed && styles.pressed]}>
      {image ? (
        <Image source={image} style={styles.fill} resizeMode="cover" />
      ) : (
        <CoverPlaceholder />
      )}
      <View style={[styles.tileFade, { backgroundColor: colours.overlay }]}>
        <AppText variant="title3" style={{ color: colours.onAccent }} numberOfLines={2}>
          {LEARN_CATEGORY_LABELS[category]}
        </AppText>
      </View>
    </Pressable>
  );
}

export function ArticleBody({ markdown }: { markdown: string }) {
  const { colours, spacing } = useTheme();
  const blocks = parseArticleBody(markdown);
  return (
    <View style={{ gap: spacing.md }}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === 'heading') {
          return (
            <AppText key={key} variant="title2" style={{ color: colours.ink }}>
              {block.text}
            </AppText>
          );
        }
        if (block.type === 'quote') {
          return (
            <View
              key={key}
              style={[styles.quote, { borderLeftColor: colours.accent, backgroundColor: colours.accentSoft }]}>
              <AppText variant="body" style={{ color: colours.ink }}>
                {block.text}
              </AppText>
            </View>
          );
        }
        if (block.type === 'list') {
          return (
            <View key={key} style={{ gap: 8 }}>
              {block.items.map((item) => (
                <AppText key={item} variant="body" style={{ color: colours.ink }}>
                  {`\u2022 ${item}`}
                </AppText>
              ))}
            </View>
          );
        }
        return (
          <AppText key={key} variant="body" style={{ color: colours.ink }}>
            {block.text}
          </AppText>
        );
      })}
    </View>
  );
}

export function RelatedLearn({
  routineId,
  exerciseId,
  category,
  excludeId,
  style,
}: {
  routineId?: string | null;
  exerciseId?: string | null;
  category?: LearnCategory;
  excludeId?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { width } = useWindowDimensions();
  const { colours, spacing } = useTheme();
  const [items, setItems] = useState<LearnArticle[]>([]);
  const cardWidth = Math.min(260, width * 0.72);

  useEffect(() => {
    let isCurrent = true;
    Promise.all([fetchLearnArticles(), fetchLearnLinks()])
      .then(([articles, links]) => {
        if (!isCurrent) return;
        if (category) {
          setItems(articles.filter((item) => item.category === category && item.id !== excludeId).slice(0, 4));
          return;
        }
        setItems(relatedArticles(articles, links, { routineId, exerciseId, excludeId, limit: 4 }));
      })
      .catch(() => {
        if (isCurrent) setItems([]);
      });
    return () => {
      isCurrent = false;
    };
  }, [routineId, exerciseId, category, excludeId]);

  if (items.length === 0) return null;

  return (
    <View style={style}>
      <SectionHeader title="From Learn" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.md, paddingRight: 8 }}>
        {items.map((article) => (
          <ArticleCard key={article.id} article={article} width={cardWidth} />
        ))}
      </ScrollView>
      <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: spacing.sm }}>
        Short reads to sit beside the session.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: {
    aspectRatio: 16 / 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    top: 12,
    left: 12,
  },
  cardBody: {
    padding: 14,
  },
  tile: {
    aspectRatio: 16 / 10,
    overflow: 'hidden',
  },
  tileFade: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    padding: 12,
  },
  quote: {
    borderLeftWidth: 3,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  pressed: {
    opacity: 0.8,
  },
});
