import { router, useLocalSearchParams, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, Chip, ChipScroller, DetailLayout, EmptyState, IconButton } from '@/components/ui';
import { dietaryLabel, recipeMetaLine } from '@/components/ui/Food';
import { useTheme } from '@/constants/theme';
import { foodCopy } from '@/lib/copy';
import { mealTypeName, recipeBySlug } from '@/lib/food';

export default function FoodRecipeScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colours, spacing } = useTheme();
  const recipe = recipeBySlug(slug);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/food' as Href);
  }

  if (!recipe) {
    return (
      <View style={[styles.screen, { backgroundColor: colours.bg }]}>
        <View style={styles.missingBar}>
          <IconButton icon="chevron-back" variant="muted" accessibilityLabel="Back" onPress={goBack} />
        </View>
        <EmptyState
          icon="restaurant-outline"
          title={foodCopy.recipe_missing_title}
          body={foodCopy.recipe_missing_body}
        />
      </View>
    );
  }

  return (
    <DetailLayout
      cover={null}
      coverSlug={recipe.coverImageSlug}
      letter={recipe.title.slice(0, 1)}
      title={recipe.title}
      eyebrow={mealTypeName(recipe.mealType)}
      onBack={goBack}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md }}>
        <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
          {recipeMetaLine(recipe)}
        </AppText>
        {recipe.summary ? (
          <AppText variant="body" style={{ color: colours.ink }}>
            {recipe.summary}
          </AppText>
        ) : null}
        {recipe.dietaryTags.length > 0 ? (
          <ChipScroller>
            {recipe.dietaryTags.map((tag) => (
              <Chip key={tag} label={dietaryLabel(tag)} />
            ))}
          </ChipScroller>
        ) : null}
      </View>
    </DetailLayout>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  missingBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});
