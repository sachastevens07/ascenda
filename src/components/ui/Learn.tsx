import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { PhotoFill } from '@/components/ui/Cards';
import { SectionHeader } from '@/components/ui/List';
import { useTheme } from '@/constants/theme';
import {
  LEARN_CATEGORY_COVERS,
  LEARN_CATEGORY_LABELS,
  fetchLearnArticles,
  fetchLearnLinks,
  formatReadMinutes,
  parseArticleBody,
  recordArticleOpened,
  relatedArticles,
  type LearnArticle,
  type LearnCategory,
} from '@/lib/learn';

export function openLearnArticle(article: LearnArticle): void {
  void recordArticleOpened(article.id);
  router.push({ pathname: '/learn/[id]', params: { id: article.id } } as Href);
}

export function ArticleCard({
  article,
  style,
  width,
  kindChip,
}: {
  article: LearnArticle;
  style?: StyleProp<ViewStyle>;
  width?: number;
  kindChip?: string;
}) {
  const { colours, radius, shadow } = useTheme();
  return (
    <Pressable
      onPress={() => openLearnArticle(article)}
      accessibilityRole="button"
      accessibilityLabel={article.title}
      style={({ pressed }) => [
        { width, borderRadius: radius.lg, backgroundColor: colours.surface },
        shadow,
        style,
        pressed && styles.pressed,
      ]}>
      <View style={{ borderRadius: radius.lg, overflow: 'hidden' }}>
        <View style={[styles.photo, { backgroundColor: colours.surfaceMuted }]}>
          <PhotoFill slug={article.cover_image_id} kind="people" label={article.title} />
          {kindChip ? (
            <View style={[styles.badge, { backgroundColor: colours.surface, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 4 }]}>
              <AppText variant="eyebrow" style={{ color: colours.brand }}>
                {kindChip}
              </AppText>
            </View>
          ) : null}
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
  const label = LEARN_CATEGORY_LABELS[category];
  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/learn/category/[category]', params: { category } } as Href)
      }
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tileWrap, style, pressed && styles.pressed]}>
      <View
        style={[
          styles.tile,
          { borderRadius: radius.lg, backgroundColor: colours.surfaceMuted },
        ]}>
        <PhotoFill slug={LEARN_CATEGORY_COVERS[category]} kind="people" label={label} />
        <View style={[styles.tileFade, { backgroundColor: colours.overlay }]} />
        <AppText variant="title3" style={[styles.tileLabel, { color: colours.onAccent }]} numberOfLines={2}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

function MarkdownText({ text, color }: { text: string; color: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((part) => part.length > 0);
  return (
    <AppText variant="body" style={{ color }}>
      {parts.map((part, index) => {
        const bold = part.startsWith('**') && part.endsWith('**') && part.length >= 4;
        const inner = bold ? part.slice(2, -2) : part;
        return (
          <AppText key={`${inner}-${index}`} variant={bold ? 'bodyStrong' : 'body'} style={{ color }}>
            {inner}
          </AppText>
        );
      })}
    </AppText>
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
              <MarkdownText text={block.text} color={colours.ink} />
            </View>
          );
        }
        if (block.type === 'list') {
          return (
            <View key={key} style={{ gap: 8 }}>
              {block.items.map((item) => (
                <View key={item} style={{ flexDirection: 'row', gap: 8 }}>
                  <AppText variant="body" style={{ color: colours.ink }}>
                    {'\u2022'}
                  </AppText>
                  <View style={{ flex: 1 }}>
                    <MarkdownText text={item} color={colours.ink} />
                  </View>
                </View>
              ))}
            </View>
          );
        }
        return <MarkdownText key={key} text={block.text} color={colours.ink} />;
      })}
    </View>
  );
}

export function RelatedLearn({
  routineId,
  routineSlug,
  exerciseId,
  exerciseSlug,
  category,
  excludeId,
  style,
}: {
  routineId?: string | null;
  routineSlug?: string | null;
  exerciseId?: string | null;
  exerciseSlug?: string | null;
  category?: LearnCategory;
  excludeId?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { width } = useWindowDimensions();
  const { colours, spacing } = useTheme();
  const [items, setItems] = useState<LearnArticle[]>([]);
  const cardWidth = Math.min(240, width * 0.62);

  useEffect(() => {
    let isCurrent = true;
    Promise.all([fetchLearnArticles(), fetchLearnLinks()])
      .then(([articles, links]) => {
        if (!isCurrent) return;
        if (category) {
          setItems(articles.filter((item) => item.category === category && item.id !== excludeId).slice(0, 4));
          return;
        }
        setItems(
          relatedArticles(articles, links, {
            routineId,
            routineSlug,
            exerciseId,
            exerciseSlug,
            excludeId,
            limit: 4,
          })
        );
      })
      .catch(() => {
        if (isCurrent) setItems([]);
      });
    return () => {
      isCurrent = false;
    };
  }, [routineId, routineSlug, exerciseId, exerciseSlug, category, excludeId]);

  if (items.length === 0) return null;

  return (
    <View style={style}>
      <SectionHeader title="From Learn" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.relatedCarousel}
        contentContainerStyle={[styles.relatedContent, { gap: spacing.md }]}>
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
    ...StyleSheet.absoluteFill,
  },
  badge: {
    position: 'absolute',
    top: 12,
    left: 12,
  },
  cardBody: {
    padding: 14,
    minHeight: 112,
  },
  tileWrap: {
    width: '48%',
    flexGrow: 1,
  },
  tile: {
    width: '100%',
    aspectRatio: 16 / 10,
    minHeight: 96,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  tileFade: {
    ...StyleSheet.absoluteFill,
    opacity: 0.45,
  },
  tileLabel: {
    padding: 12,
  },
  quote: {
    borderLeftWidth: 3,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  relatedCarousel: {
    marginHorizontal: -20,
    overflow: 'visible',
  },
  relatedContent: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  pressed: {
    opacity: 0.8,
  },
});
