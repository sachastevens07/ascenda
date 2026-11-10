import Ionicons from '@expo/vector-icons/Ionicons';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { showDialog } from '@/components/Dialog';
import {
  AppText,
  Chip,
  ChipScroller,
  PrimaryButton,
  RecipeListRow,
  SafetyNotice,
  SecondaryButton,
  TextButton,
  filterLabel,
  openRecipe,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { trackAi } from '@/lib/analytics';
import { aiCopy, fillCopy, foodCopy } from '@/lib/copy';
import {
  COOK_INGREDIENTS,
  rankRecipesForIngredients,
  topCookMatches,
  type CookMatch,
} from '@/lib/foodCook';
import { availableFilters, mealTypeName, type RecipeFilter } from '@/lib/food';
import { useFoodFavourites } from '@/lib/foodFavourites';
import { ensureSubscribed, useSubscriptionGate } from '@/lib/paywall';
import { addMissingIngredientsToShoppingList } from '@/lib/shoppingList';
import { lookupCookIngredients } from '@/lib/whatCanICook';

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.2,
  exif: false,
  base64: false,
  allowsEditing: false,
};

const MAX_BASE64_CHARS = 2_000_000;
const FEATURE = 'what_can_i_cook' as const;

async function readImageBase64(uri: string): Promise<string> {
  const value = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  return value.replace(/\s/g, '');
}

export default function WhatCanICookScreen() {
  const { colours, radius, type } = useTheme();
  const allowed = useSubscriptionGate();
  const { isFavourite, toggle } = useFoodFavourites();
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [photo, setPhoto] = useState<{ base64: string; mediaType: 'image/jpeg' | 'image/png' } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [peopleTip, setPeopleTip] = useState(false);
  const [unrecognised, setUnrecognised] = useState<string[]>([]);
  const [matches, setMatches] = useState<CookMatch[] | null>(null);
  const [filters, setFilters] = useState<RecipeFilter[]>([]);
  const [addedSlugs, setAddedSlugs] = useState<string[]>([]);

  const tickedSet = useMemo(() => new Set(ticked), [ticked]);
  const ingredientQuery = query.trim().toLowerCase();
  const shownIngredients = useMemo(() => {
    const filtered = COOK_INGREDIENTS.filter((item) => {
      if (!ingredientQuery) return true;
      return (
        item.label.toLowerCase().includes(ingredientQuery) ||
        item.name.toLowerCase().includes(ingredientQuery) ||
        item.key.includes(ingredientQuery.replace(/\s+/g, '_'))
      );
    });
    return [...filtered].sort((a, b) => {
      const aOn = tickedSet.has(a.key) ? 0 : 1;
      const bOn = tickedSet.has(b.key) ? 0 : 1;
      if (aOn !== bOn) return aOn - bOn;
      return a.label.localeCompare(b.label);
    });
  }, [ingredientQuery, tickedSet]);

  const shownMatches = useMemo(() => {
    if (!matches) return [];
    return topCookMatches(matches, filters);
  }, [matches, filters]);
  const chips = useMemo(() => (matches ? availableFilters(matches.map((item) => item.recipe)) : []), [matches]);

  if (!allowed) return null;

  function toggleKey(key: string) {
    setTicked((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
    setMatches(null);
  }

  function toggleFilter(filter: RecipeFilter) {
    setFilters((current) =>
      current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter]
    );
  }

  function applyLocalRank(keys: string[], showEmpty = true) {
    const ranked = rankRecipesForIngredients(keys);
    setMatches(ranked);
    setFilters([]);
    if (ranked.length === 0 && showEmpty) setNotice(aiCopy.cook_empty);
  }

  async function findRecipes() {
    if (!ensureSubscribed()) return;
    const keys = ticked;
    const hasText = typed.trim().length > 0;
    const hasPhoto = Boolean(photo);
    setNotice(null);
    setPeopleTip(false);
    setUnrecognised([]);
    setAddedSlugs([]);
    if (!hasText && !hasPhoto) {
      if (keys.length === 0) {
        showDialog(aiCopy.cook_title, aiCopy.cook_need_input);
        return;
      }
      applyLocalRank(keys);
      return;
    }
    setBusy(true);
    setMatches(null);
    try {
      const outcome = await lookupCookIngredients({
        text: hasText ? typed.trim() : undefined,
        imageBase64: photo?.base64,
        mediaType: photo?.mediaType,
        extraKeys: keys,
      });
      setPhoto(null);
      if (outcome.kind === 'limit') {
        setNotice(aiCopy.cook_limit);
        if (keys.length > 0) applyLocalRank(keys, false);
        return;
      }
      if (outcome.kind === 'timeout') {
        setNotice(aiCopy.cook_timeout);
        if (keys.length > 0) applyLocalRank(keys, false);
        return;
      }
      if (outcome.kind !== 'ok') {
        setNotice(`${aiCopy.error} ${aiCopy.cook_fallback}`);
        if (keys.length > 0) applyLocalRank(keys, false);
        return;
      }
      setPeopleTip(outcome.peopleVisible);
      setUnrecognised(outcome.unrecognised);
      if (outcome.ingredientKeys.length > 0) {
        setTicked((current) => [...new Set([...current, ...outcome.ingredientKeys])]);
      }
      applyLocalRank(outcome.ingredientKeys);
    } catch {
      setPhoto(null);
      setNotice(`${aiCopy.error} ${aiCopy.cook_fallback}`);
      if (keys.length > 0) applyLocalRank(keys, false);
    } finally {
      setBusy(false);
    }
  }

  async function attachPhoto(fromCamera: boolean) {
    if (!ensureSubscribed()) return;
    try {
      if (fromCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          showDialog('Camera is off', 'Turn the permission on in your phone settings if you want to photograph your fridge.');
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          showDialog('Photos are off', 'Turn the permission on in your phone settings if you want to photograph your fridge.');
          return;
        }
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
        : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
      const asset = result.canceled ? null : result.assets[0];
      if (!asset?.uri) return;
      const mediaType = (asset.mimeType ?? '').includes('png') ? 'image/png' : 'image/jpeg';
      const base64 = (asset.base64 ?? '').replace(/\s/g, '') || (await readImageBase64(asset.uri));
      if (base64.length < 100 || base64.length > MAX_BASE64_CHARS) {
        showDialog(aiCopy.cook_title, aiCopy.error);
        return;
      }
      setPhoto({ base64, mediaType });
      setMatches(null);
    } catch {
      showDialog(aiCopy.cook_title, aiCopy.error);
    }
  }

  async function addMissing(match: CookMatch) {
    if (match.missing.length === 0) return;
    const result = await addMissingIngredientsToShoppingList(
      match.recipe,
      match.missing.map((item) => item.ingredientKey)
    );
    trackAi('ai_result_accepted', FEATURE);
    setAddedSlugs((current) => (current.includes(match.recipe.slug) ? current : [...current, match.recipe.slug]));
    showDialog(
      result === 'updated' ? foodCopy.list_updated_title : foodCopy.list_saved_title,
      result === 'updated' ? foodCopy.list_updated_body : foodCopy.list_saved_body
    );
  }

  function openMatch(match: CookMatch) {
    trackAi('ai_result_accepted', FEATURE);
    openRecipe(match.recipe.slug);
  }

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <Stack.Screen options={{ title: aiCopy.cook_title }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="body" style={{ color: colours.inkMuted }}>
          {aiCopy.cook_intro}
        </AppText>
        <AppText variant="caption" style={{ color: colours.inkMuted }}>
          {aiCopy.cook_privacy}
        </AppText>

        <View
          style={[
            styles.search,
            { borderColor: colours.border, backgroundColor: colours.surface, borderRadius: radius.md },
          ]}>
          <TextInput
            style={[styles.typed, type.body, { color: colours.ink }]}
            value={typed}
            onChangeText={(value) => {
              setTyped(value);
              setMatches(null);
            }}
            placeholder={aiCopy.cook_placeholder}
            placeholderTextColor={colours.inkMuted}
            multiline
            autoCorrect={false}
          />
        </View>

        <View style={styles.photoRow}>
          <SecondaryButton
            label={aiCopy.camera}
            appearance="outline"
            onPress={() => void attachPhoto(true)}
            style={styles.photoBtn}
          />
          <SecondaryButton
            label={aiCopy.library}
            appearance="outline"
            onPress={() => void attachPhoto(false)}
            style={styles.photoBtn}
          />
        </View>
        {photo ? (
          <View style={styles.photoChip}>
            <Ionicons name="camera-outline" size={16} color={colours.brand} />
            <AppText variant="bodySm" style={{ color: colours.brand, flex: 1 }}>
              {aiCopy.cook_photo_attached}
            </AppText>
            <Pressable onPress={() => setPhoto(null)} hitSlop={8} accessibilityLabel={aiCopy.cook_photo_remove}>
              <Ionicons name="close-circle" size={20} color={colours.inkMuted} />
            </Pressable>
          </View>
        ) : null}

        <AppText variant="title3" style={{ color: colours.ink, marginTop: 8 }}>
          {aiCopy.cook_tick}
        </AppText>
        <View
          style={[
            styles.search,
            { borderColor: colours.border, backgroundColor: colours.surface, borderRadius: radius.md },
          ]}>
          <Ionicons name="search" size={20} color={colours.inkMuted} />
          <TextInput
            style={[styles.input, type.bodyStrong, { color: colours.ink }]}
            value={query}
            onChangeText={setQuery}
            placeholder={aiCopy.cook_tick_search}
            placeholderTextColor={colours.inkMuted}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        {ticked.length > 0 ? (
          <AppText variant="caption" style={{ color: colours.inkMuted }}>
            {fillCopy(aiCopy.cook_ticked_count, { count: ticked.length })}
          </AppText>
        ) : null}
        <View style={styles.wrap}>
          {shownIngredients.map((item) => (
            <Chip
              key={item.key}
              label={item.label}
              selected={tickedSet.has(item.key)}
              onPress={() => toggleKey(item.key)}
            />
          ))}
        </View>

        <PrimaryButton
          label={aiCopy.cook_find}
          onPress={() => void findRecipes()}
          loading={busy}
          disabled={busy}
        />
        {busy ? (
          <View style={styles.checking}>
            <ActivityIndicator color={colours.brand} />
            <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
              {aiCopy.cook_checking}
            </AppText>
          </View>
        ) : null}

        {notice ? (
          <AppText variant="body" style={{ color: colours.ink }}>
            {notice}
          </AppText>
        ) : null}
        {peopleTip ? (
          <AppText variant="caption" style={{ color: colours.inkMuted }}>
            {aiCopy.cook_people_tip}
          </AppText>
        ) : null}
        {unrecognised.length > 0 ? (
          <AppText variant="caption" style={{ color: colours.inkMuted }}>
            {fillCopy(aiCopy.cook_unrecognised, { list: unrecognised.join(', ') })}
          </AppText>
        ) : null}

        {matches && shownMatches.length > 0 ? (
          <View style={styles.results}>
            <AppText variant="title3" style={{ color: colours.ink }}>
              {aiCopy.cook_results}
            </AppText>
            {chips.length > 0 ? (
              <ChipScroller contentContainerStyle={styles.chips}>
                {chips.map((filter) => (
                  <Chip
                    key={filter}
                    label={filterLabel(filter)}
                    selected={filters.includes(filter)}
                    onPress={() => toggleFilter(filter)}
                  />
                ))}
              </ChipScroller>
            ) : null}
            {shownMatches.map((match) => {
              const haveLine = fillCopy(aiCopy.cook_have, { have: match.have, need: match.need });
              const missingLine =
                match.missing.length > 0
                  ? fillCopy(aiCopy.cook_missing, {
                      list: match.missing.map((item) => item.name.split(',')[0]).join(', '),
                    })
                  : aiCopy.cook_complete;
              const added = addedSlugs.includes(match.recipe.slug);
              return (
                <View key={match.recipe.slug} style={styles.match}>
                  <RecipeListRow
                    recipe={match.recipe}
                    mealTypeName={mealTypeName(match.recipe.mealType)}
                    saved={isFavourite(match.recipe.slug)}
                    onToggleFavourite={() => void toggle(match.recipe.slug)}
                    detail={haveLine}
                    onPress={() => openMatch(match)}
                  />
                  <AppText variant="caption" style={{ color: colours.inkMuted, paddingHorizontal: 16, paddingTop: 8 }}>
                    {missingLine}
                  </AppText>
                  {match.missing.length > 0 ? (
                    <TextButton
                      label={added ? aiCopy.cook_added : aiCopy.cook_add_missing}
                      onPress={() => void addMissing(match)}
                      disabled={added}
                      style={styles.addMissing}
                    />
                  ) : null}
                </View>
              );
            })}
            <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 8 }}>
              {aiCopy.cook_ai_label}
            </AppText>
            <SafetyNotice />
          </View>
        ) : null}

        {matches && shownMatches.length === 0 && !notice ? (
          <AppText variant="body" style={{ color: colours.ink }}>
            {filters.length > 0 ? foodCopy.empty_search_body : aiCopy.cook_empty}
          </AppText>
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
    paddingTop: 8,
    paddingBottom: 48,
    gap: 12,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  typed: {
    flex: 1,
    paddingVertical: 10,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  input: {
    flex: 1,
    paddingVertical: 10,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 8,
  },
  photoBtn: {
    flex: 1,
  },
  photoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  checking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  results: {
    gap: 8,
    marginTop: 8,
  },
  chips: {
    paddingLeft: 0,
    paddingRight: 0,
  },
  match: {
    marginHorizontal: -24,
  },
  addMissing: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
});
