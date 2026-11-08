import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { useTabBarHeight } from '@/components/PillTabBar';
import {
  AppText,
  ArticleCard,
  CategoryTile,
  HeroImage,
  ListRow,
  QuoteCard,
  SectionHeader,
  TabAvatar,
  openLearnArticle,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { homeCopy } from '@/lib/copy';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import {
  LEARN_CATEGORIES,
  LEARN_CATEGORY_LABELS,
  continueReadingArticle,
  featuredArticle,
  fetchLastOpenedArticleId,
  fetchLearnArticles,
  fetchReadArticleIds,
  formatReadMinutes,
  recommendArticles,
  type LearnArticle,
} from '@/lib/learn';
import {
  DAILY_QUOTES,
  fetchDailyQuotes,
  fetchHideQuote,
  pickDailyQuote,
  saveHideQuote,
  type DailyQuote,
} from '@/lib/quotes';

type LearnData = {
  articles: LearnArticle[];
  featured: LearnArticle | null;
  recommended: LearnArticle[];
  continueReading: LearnArticle | null;
  readIds: Set<string>;
  quotes: DailyQuote[];
};

export default function LearnScreen() {
  const tabBarHeight = useTabBarHeight();
  const { width } = useWindowDimensions();
  const { colours, radius } = useTheme();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const [data, setData] = useState<LearnData | null>(null);
  const [quoteHidden, setQuoteHidden] = useState(false);
  const cardWidth = width * 0.72;
  const tileWidth = Math.max(140, (width - 48 - 12) / 2);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      (async () => {
        const [articles, readIds, lastOpened, quotes, hideQuote] = await Promise.all([
          fetchLearnArticles(),
          fetchReadArticleIds(),
          fetchLastOpenedArticleId(),
          fetchDailyQuotes().catch(() => DAILY_QUOTES),
          fetchHideQuote().catch(() => false),
        ]);
        const featured = featuredArticle(articles, readIds);
        const recommended = recommendArticles(articles, answers, {
          excludeIds: featured ? [featured.id] : [],
          limit: 4,
        });
        if (!isCurrent) return;
        setQuoteHidden(hideQuote);
        setData({
          articles,
          featured,
          recommended,
          continueReading: continueReadingArticle(articles, lastOpened, readIds),
          readIds,
          quotes,
        });
      })().catch(() => {
        if (isCurrent) {
          setData({
            articles: [],
            featured: null,
            recommended: [],
            continueReading: null,
            readIds: new Set(),
            quotes: DAILY_QUOTES,
          });
        }
      });
      return () => {
        isCurrent = false;
      };
    }, [answers])
  );

  const featured = data?.featured ?? null;
  const continueReading = data?.continueReading ?? null;
  const quote = pickDailyQuote(data?.quotes ?? DAILY_QUOTES);
  const showQuote = !quoteHidden && Boolean(quote?.text);

  function hideQuote() {
    setQuoteHidden(true);
    saveHideQuote(true).catch(() => setQuoteHidden(false));
  }

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 24 }]}>
        <View style={styles.header}>
          <TabAvatar />
          <AppText variant="display" style={{ color: colours.ink, flex: 1 }}>Learn</AppText>
        </View>

        {showQuote && quote ? (
          <QuoteCard quote={quote} eyebrow={homeCopy.quote_eyebrow} onHide={hideQuote} />
        ) : null}

        {featured ? (
          <Pressable
            onPress={() => openLearnArticle(featured)}
            accessibilityRole="button"
            accessibilityLabel={featured.title}
            style={({ pressed }) => [{ borderRadius: radius.xl, overflow: 'hidden' }, pressed && styles.pressed]}>
            <HeroImage
              imageSlug={featured.cover_image_id}
              title={featured.title}
              eyebrow={LEARN_CATEGORY_LABELS[featured.category]}
              height={200}
            />
            <View style={[styles.heroMeta, { backgroundColor: colours.surface }]}>
              <AppText variant="caption" style={{ color: colours.inkMuted }}>
                {formatReadMinutes(featured.read_minutes)}
                {data?.readIds.has(featured.id) ? ' · Read' : ''}
              </AppText>
            </View>
          </Pressable>
        ) : null}

        {continueReading ? (
          <ListRow
            eyebrow="Continue reading"
            title={continueReading.title}
            subtitle={formatReadMinutes(continueReading.read_minutes)}
            onPress={() => openLearnArticle(continueReading)}
            style={{ borderRadius: radius.lg, overflow: 'hidden' }}
          />
        ) : null}

        <View>
          <SectionHeader title="Categories" />
          <View style={styles.tiles}>
            {LEARN_CATEGORIES.map((category) => (
              <CategoryTile key={category} category={category} style={{ width: tileWidth }} />
            ))}
          </View>
        </View>

        {data && data.recommended.length > 0 ? (
          <View>
            <SectionHeader title="Recommended for you" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carousel}
              style={styles.bleed}>
              {data.recommended.map((article) => (
                <ArticleCard key={article.id} article={article} width={cardWidth} />
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingTop: 12,
    gap: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroMeta: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  carousel: {
    gap: 12,
    paddingRight: 8,
  },
  bleed: {
    marginHorizontal: -4,
  },
  pressed: {
    opacity: 0.88,
  },
});
