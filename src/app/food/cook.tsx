import Ionicons from '@expo/vector-icons/Ionicons';
import { Camera } from 'expo-camera';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Stack, router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ScrollViewInstance,
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
  ingredientKeysFromText,
  rankRecipesForIngredients,
  topCookMatches,
  type CookMatch,
} from '@/lib/foodCook';
import { availableFilters, mealTypeName, type RecipeFilter } from '@/lib/food';
import { useFoodFavourites } from '@/lib/foodFavourites';
import { ensureSubscribed, useSubscriptionGate } from '@/lib/paywall';
import { readCookCameraPhotos, writeCookCameraPhotos } from '@/lib/cookCameraSession';
import { addMissingIngredientsToShoppingList } from '@/lib/shoppingList';
import { lookupCookIngredients, type CookImage } from '@/lib/whatCanICook';

type Mode = 'type' | 'tick' | 'photos';

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.2,
  exif: false,
  base64: false,
  allowsEditing: false,
  allowsMultipleSelection: true,
};

const MAX_PHOTOS = 4;
const MAX_BASE64_CHARS = 2_000_000;
const FEATURE = 'what_can_i_cook' as const;
const MODES: { id: Mode; label: string }[] = [
  { id: 'type', label: aiCopy.cook_mode_type },
  { id: 'tick', label: aiCopy.cook_mode_tick },
  { id: 'photos', label: aiCopy.cook_mode_photos },
];

async function readImageBase64(uri: string): Promise<string> {
  const value = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  return value.replace(/\s/g, '');
}

function photoUri(photo: CookImage): string {
  return photo.uri || `data:${photo.mediaType};base64,${photo.base64}`;
}

export default function WhatCanICookScreen() {
  const { colours, radius, type } = useTheme();
  const allowed = useSubscriptionGate();
  const { isFavourite, toggle } = useFoodFavourites();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [mode, setMode] = useState<Mode>('type');
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [photos, setPhotos] = useState<CookImage[]>([]);
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

  useFocusEffect(
    useCallback(() => {
      setPhotos(readCookCameraPhotos());
      const frame = requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      });
      return () => cancelAnimationFrame(frame);
    }, [])
  );

  if (!allowed) return null;

  function clearResults() {
    setMatches(null);
    setNotice(null);
    setPeopleTip(false);
    setUnrecognised([]);
    setAddedSlugs([]);
    setFilters([]);
  }

  function changeMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    clearResults();
    if (next !== 'type') setTyped('');
    if (next !== 'tick') {
      setTicked([]);
      setQuery('');
    }
    if (next !== 'photos') {
      setPhotos([]);
      writeCookCameraPhotos([]);
    }
  }

  function toggleKey(key: string) {
    setTicked((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
    clearResults();
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

  async function runLookup(input: { text?: string; images?: CookImage[] }, keepPhotosOnFail = false) {
    if (!ensureSubscribed()) return;
    setBusy(true);
    clearResults();
    try {
      const outcome = await lookupCookIngredients(input);
      if (outcome.kind === 'ok') {
        setPhotos([]);
        writeCookCameraPhotos([]);
        setPeopleTip(outcome.peopleVisible);
        setUnrecognised(outcome.unrecognised);
        applyLocalRank(outcome.ingredientKeys);
        return;
      }
      if (!keepPhotosOnFail) {
        setPhotos([]);
        writeCookCameraPhotos([]);
      }
      if (outcome.kind === 'limit') {
        setNotice(aiCopy.cook_limit);
        return;
      }
      if (outcome.kind === 'timeout') {
        setNotice(aiCopy.cook_timeout);
        return;
      }
      setNotice(`${aiCopy.error} ${aiCopy.cook_fallback}`);
    } catch {
      if (!keepPhotosOnFail) {
        setPhotos([]);
        writeCookCameraPhotos([]);
      }
      setNotice(`${aiCopy.error} ${aiCopy.cook_fallback}`);
    } finally {
      setBusy(false);
    }
  }

  async function submitType() {
    Keyboard.dismiss();
    const text = typed.trim();
    if (!text) {
      showDialog(aiCopy.cook_title, aiCopy.cook_need_input);
      return;
    }
    const local = ingredientKeysFromText(text);
    if (local.keys.length > 0) {
      clearResults();
      setUnrecognised(local.unrecognised);
      applyLocalRank(local.keys);
      return;
    }
    await runLookup({ text });
  }

  async function submitTicks() {
    if (ticked.length === 0) {
      showDialog(aiCopy.cook_title, aiCopy.cook_need_input);
      return;
    }
    clearResults();
    applyLocalRank(ticked);
  }

  async function submitPhotos() {
    if (photos.length === 0) {
      showDialog(aiCopy.cook_title, aiCopy.cook_need_input);
      return;
    }
    await runLookup({ images: photos }, true);
  }

  async function addPhotoFromAsset(uri: string, mimeType?: string | null) {
    const mediaType: CookImage['mediaType'] = (mimeType ?? '').includes('png') ? 'image/png' : 'image/jpeg';
    const base64 = await readImageBase64(uri);
    if (base64.length < 100 || base64.length > MAX_BASE64_CHARS) {
      showDialog(aiCopy.cook_title, aiCopy.error);
      return false;
    }
    setPhotos((current) => {
      const next = current.length >= MAX_PHOTOS ? current : [...current, { base64, mediaType, uri }];
      writeCookCameraPhotos(next);
      return next;
    });
    return true;
  }

  async function openCamera() {
    if (!ensureSubscribed()) return;
    if (photos.length >= MAX_PHOTOS) {
      showDialog(aiCopy.cook_title, aiCopy.cook_photo_max);
      return;
    }
    try {
      const permission = Camera.requestCameraPermissionsAsync
        ? await Camera.requestCameraPermissionsAsync()
        : await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showDialog(
          'Camera is off',
          'Turn the permission on in your phone settings if you want to photograph your fridge.'
        );
        return;
      }
      writeCookCameraPhotos(photos);
      router.push('/cook-camera' as Href);
    } catch {
      showDialog(aiCopy.cook_title, aiCopy.error);
    }
  }

  async function pickLibrary() {
    if (!ensureSubscribed()) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      showDialog(aiCopy.cook_title, aiCopy.cook_photo_max);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showDialog(
        'Photos are off',
        'Turn the permission on in your phone settings if you want to photograph your fridge.'
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      ...PICKER_OPTIONS,
      selectionLimit: remaining,
    });
    if (result.canceled) return;
    try {
      for (const asset of result.assets) {
        if (!asset.uri) continue;
        await addPhotoFromAsset(asset.uri, asset.mimeType);
      }
      clearResults();
    } catch {
      showDialog(aiCopy.cook_title, aiCopy.error);
    }
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      writeCookCameraPhotos(next);
      return next;
    });
    clearResults();
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
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled>
        <View style={[styles.modes, { backgroundColor: colours.surfaceMuted, borderRadius: radius.full }]}>
          {MODES.map((option) => {
            const selected = option.id === mode;
            return (
              <Pressable
                key={option.id}
                onPress={() => changeMode(option.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[
                  styles.mode,
                  selected && { backgroundColor: colours.surface, borderRadius: radius.full },
                ]}>
                <AppText
                  variant="bodyStrong"
                  numberOfLines={1}
                  style={{ color: selected ? colours.ink : colours.inkMuted }}>
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {mode === 'type' ? (
          <View
            style={[
              styles.typeTile,
              {
                borderColor: colours.border,
                backgroundColor: colours.surface,
                borderRadius: radius.md,
              },
            ]}>
            <TextInput
              style={[styles.typed, type.body, { color: colours.ink }]}
              value={typed}
              onChangeText={(value) => {
                setTyped(value);
                clearResults();
              }}
              placeholder={aiCopy.cook_placeholder}
              placeholderTextColor={colours.inkMuted}
              autoCorrect={false}
              returnKeyType="go"
              blurOnSubmit
              onSubmitEditing={() => void submitType()}
              editable={!busy}
            />
            <Pressable
              onPress={() => void submitType()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={aiCopy.cook_enter}
              style={({ pressed }) => [
                styles.enter,
                { backgroundColor: colours.brand, borderRadius: radius.full },
                (pressed || busy) && styles.pressed,
              ]}>
              {busy ? (
                <ActivityIndicator color={colours.onBrand} size="small" />
              ) : (
                <Ionicons name="arrow-up" size={20} color={colours.onBrand} />
              )}
            </Pressable>
          </View>
        ) : null}

        {mode === 'tick' ? (
          <View style={styles.tickBlock}>
            <View
              style={[
                styles.dropdown,
                {
                  borderColor: colours.border,
                  backgroundColor: colours.surface,
                  borderRadius: radius.md,
                },
              ]}>
              <View style={[styles.search, { borderColor: colours.border }]}>
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
              <ScrollView
                style={styles.dropdownList}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled>
                {shownIngredients.map((item) => {
                  const selected = tickedSet.has(item.key);
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => toggleKey(item.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={({ pressed }) => [
                        styles.dropdownRow,
                        { borderBottomColor: colours.border },
                        pressed && styles.pressed,
                      ]}>
                      <AppText variant="body" style={{ color: colours.ink, flex: 1 }}>
                        {item.label}
                      </AppText>
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={selected ? colours.brand : colours.inkMuted}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            <PrimaryButton
              label={aiCopy.cook_find}
              onPress={() => void submitTicks()}
              loading={busy}
              disabled={busy}
            />
          </View>
        ) : null}

        {mode === 'photos' ? (
          <View style={styles.photoBlock}>
            <AppText variant="caption" style={{ color: colours.inkMuted }}>
              {aiCopy.cook_privacy}
            </AppText>
            <View style={styles.photoRow}>
              <SecondaryButton
                label={aiCopy.camera}
                appearance="outline"
                onPress={() => void openCamera()}
                style={styles.photoBtn}
              />
              <SecondaryButton
                label={aiCopy.library}
                appearance="outline"
                onPress={() => void pickLibrary()}
                style={styles.photoBtn}
              />
            </View>
            {photos.length > 0 ? (
              <View style={styles.photoList}>
                <AppText variant="bodySm" style={{ color: colours.brand }}>
                  {photos.length === 1
                    ? aiCopy.cook_photo_one
                    : fillCopy(aiCopy.cook_photo_attached, { count: photos.length })}
                </AppText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
                  {photos.map((photo, index) => (
                    <View key={`photo-${index}`} style={styles.thumbWrap}>
                      <Image source={{ uri: photoUri(photo) }} style={[styles.thumb, { borderRadius: radius.md }]} />
                      <Pressable
                        onPress={() => removePhoto(index)}
                        style={[styles.thumbRemove, { backgroundColor: colours.surface }]}
                        accessibilityLabel={aiCopy.cook_photo_remove}>
                        <Ionicons name="close" size={14} color={colours.ink} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            <PrimaryButton
              label={aiCopy.cook_find}
              onPress={() => void submitPhotos()}
              loading={busy}
              disabled={busy}
            />
          </View>
        ) : null}

        {busy && mode !== 'type' ? (
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
            {mode === 'photos' ? (
              <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 8 }}>
                {aiCopy.cook_ai_label}
              </AppText>
            ) : null}
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
  modes: {
    flexDirection: 'row',
    padding: 4,
    gap: 2,
  },
  mode: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  typeTile: {
    borderWidth: 1,
    minHeight: 88,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 52,
  },
  typed: {
    minHeight: 40,
    paddingRight: 8,
  },
  enter: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickBlock: {
    gap: 10,
  },
  dropdown: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    minHeight: 48,
    borderBottomWidth: 1,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
  },
  dropdownList: {
    maxHeight: 320,
  },
  dropdownRow: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  photoBlock: {
    gap: 10,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 8,
  },
  photoBtn: {
    flex: 1,
  },
  photoList: {
    gap: 8,
  },
  thumbs: {
    gap: 10,
    paddingVertical: 4,
  },
  thumbWrap: {
    position: 'relative',
  },
  thumb: {
    width: 88,
    height: 88,
    backgroundColor: '#ddd',
  },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
  pressed: {
    opacity: 0.85,
  },
});
