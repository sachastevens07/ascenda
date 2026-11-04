import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ProBadge } from '@/components/ui/Badges';
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
import { openPaywall } from '@/lib/paywall';
import { useSubscription } from '@/lib/subscription';

export function openLearnArticle(article: LearnArticle, isPro: boolean): void {
  if (article.is_pro && !isPro) {
    openPaywall('learn');
    return;
  }
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
  const { colours, radius, shadow, type } = useTheme();
  const { isPro } = useSubscription();
  const image = articleImage(article);
  return (
    <Pressable
      onPress={() => openLearnArticle(article, isPro)}
      accessibilityRole="button"
      accessibilityLabel={article.title}
      style={({ pressed }) => [style, pressed && styles.pressed]}>
      <View style={[{ backgroundColor: colours.surface, borderRadius: radius.lg, width }, shadow]}>
        <View style={[styles.photo, { backgroundColor: colours.surfaceMuted, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }]}>
          {image ? (
            <Image source={image} style={styles.fill} resizeMode="cover" />
          ) : (
            <Text style={[type.title, { color: colours.brand }]}>{article.title.slice(0, 1)}</Text>
          )}
          {article.is_pro ? (
            <View style={styles.badge}>
              <ProBadge locked={!isPro} compact />
            </View>
          ) : null}
        </View>
        <View style={styles.cardBody}>
          <Text style={[type.eyebrow, { color: colours.accent }]}>{LEARN_CATEGORY_LABELS[article.category]}</Text>
          <Text style={[type.title3, { color: colours.ink, marginTop: 6 }]} numberOfLines={2}>
            {article.title}
          </Text>
          <Text style={[type.caption, { color: colours.inkMuted, marginTop: 6 }]}>
            {formatReadMinutes(article.read_minutes)}
          </Text>
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
  const { colours, radius, type } = useTheme();
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
        <View style={[styles.fill, { backgroundColor: colours.brandSoft }]} />
      )}
      <View style={[styles.tileFade, { backgroundColor: colours.overlay }]}>
        <Text style={[type.title3, { color: colours.onAccent }]} numberOfLines={2}>
          {LEARN_CATEGORY_LABELS[category]}
        </Text>
      </View>
    </Pressable>
  );
}

export function ArticleBody({ markdown }: { markdown: string }) {
  const { colours, type, spacing } = useTheme();
  const blocks = parseArticleBody(markdown);
  return (
    <View style={{ gap: spacing.md }}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === 'heading') {
          return (
            <Text key={key} style={[type.title2, { color: colours.ink }]}>
              {block.text}
            </Text>
          );
        }
        if (block.type === 'quote') {
          return (
            <View
              key={key}
              style={[styles.quote, { borderLeftColor: colours.accent, backgroundColor: colours.accentSoft }]}>
              <Text style={[styles.articleText, { color: colours.ink }]}>{block.text}</Text>
            </View>
          );
        }
        if (block.type === 'list') {
          return (
            <View key={key} style={{ gap: 8 }}>
              {block.items.map((item) => (
                <Text key={item} style={[styles.articleText, { color: colours.ink }]}>
                  {`\u2022 ${item}`}
                </Text>
              ))}
            </View>
          );
        }
        return (
          <Text key={key} style={[styles.articleText, { color: colours.ink }]}>
            {block.text}
          </Text>
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
  const { colours, type, spacing } = useTheme();
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
      <Text style={[type.caption, { color: colours.inkMuted, marginTop: spacing.sm }]}>
        Short reads to sit beside the session.
      </Text>
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
  articleText: {
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '400',
  },
  pressed: {
    opacity: 0.8,
  },
});
