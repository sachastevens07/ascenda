import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, ChipScroller, PrimaryButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useDevTools } from '@/lib/devFlags';
import {
  EQUIPMENT,
  EQUIPMENT_LABELS,
  MUSCLES,
  MUSCLE_LABELS,
  fetchExercises,
  type Equipment,
  type Exercise,
  type Muscle,
} from '@/lib/exercises';
import { getExerciseImageSource } from '@/lib/exerciseMedia';

type LoadState = 'loading' | 'error' | 'ready';

function matchesSearch(exercise: Exercise, query: string): boolean {
  if (!query) return true;
  const muscles = [exercise.primary_muscle, ...exercise.secondary_muscles].map(
    (muscle) => MUSCLE_LABELS[muscle]
  );
  const haystack = [exercise.name, EQUIPMENT_LABELS[exercise.equipment], ...muscles]
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

export function ExerciseLibrary({
  title = 'Exercise library',
  bottomInset,
}: {
  title?: string | null;
  bottomInset?: number;
}) {
  const insets = useSafeAreaInsets();
  const paddingBottom = (bottomInset ?? insets.bottom) + 24;
  const { colours, radius, type } = useTheme();
  const { showDevTools } = useDevTools();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);

  const load = useCallback(async () => {
    try {
      setExercises(await fetchExercises());
      setLoadState('ready');
    } catch (error) {
      console.warn('Failed to load exercises', error);
      setErrorDetail((error as { message?: string } | null)?.message ?? String(error));
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }

  const filtered = useMemo(() => {
    const trimmed = query.trim();
    return exercises.filter(
      (exercise) =>
        (!muscle || exercise.primary_muscle === muscle) &&
        (!equipment || exercise.equipment === equipment) &&
        matchesSearch(exercise, trimmed)
    );
  }, [exercises, query, muscle, equipment]);

  const hasFilters = query.trim() !== '' || muscle !== null || equipment !== null;

  function clearFilters() {
    setQuery('');
    setMuscle(null);
    setEquipment(null);
  }

  return (
    <View style={[styles.container, { backgroundColor: colours.bg }]}>
      <View style={[styles.header, !title && styles.headerTight]}>
        {title ? <Text style={[type.display, { color: colours.ink }]}>{title}</Text> : null}

        <View
          style={[
            styles.search,
            { borderColor: colours.border, backgroundColor: colours.surface, borderRadius: radius.md },
          ]}>
          <Ionicons name="search" size={20} color={colours.inkMuted} />
          <TextInput
            style={[styles.searchInput, { color: colours.ink }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search exercises"
            placeholderTextColor={colours.inkMuted}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {query !== '' && (
            <Pressable onPress={() => setQuery('')} hitSlop={12} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={20} color={colours.inkMuted} />
            </Pressable>
          )}
        </View>

        <ChipScroller>
          <Chip label="All muscles" selected={muscle === null} onPress={() => setMuscle(null)} />
          {MUSCLES.map((value) => (
            <Chip
              key={value}
              label={MUSCLE_LABELS[value]}
              selected={muscle === value}
              onPress={() => setMuscle(muscle === value ? null : value)}
            />
          ))}
        </ChipScroller>
        <ChipScroller>
          <Chip label="All equipment" selected={equipment === null} onPress={() => setEquipment(null)} />
          {EQUIPMENT.map((value) => (
            <Chip
              key={value}
              label={EQUIPMENT_LABELS[value]}
              selected={equipment === value}
              onPress={() => setEquipment(equipment === value ? null : value)}
            />
          ))}
        </ChipScroller>
      </View>

      {loadState === 'loading' && (
        <View style={styles.centre}>
          <ActivityIndicator color={colours.brand} />
        </View>
      )}

      {loadState === 'error' && (
        <View style={styles.centre}>
          <Text style={[type.title3, { color: colours.ink, textAlign: 'center' }]}>We couldn’t load the library</Text>
          <Text style={[type.bodySm, { color: colours.inkMuted, textAlign: 'center', marginTop: 6 }]}>
            Check your connection and try again.
          </Text>
          {showDevTools && errorDetail ? (
            <Text style={[type.caption, { color: colours.inkMuted, textAlign: 'center', marginTop: 12 }]}>
              {errorDetail}
            </Text>
          ) : null}
          <PrimaryButton
            label="Try again"
            onPress={() => {
              setLoadState('loading');
              load();
            }}
            style={{ marginTop: 16, alignSelf: 'stretch' }}
          />
        </View>
      )}

      {loadState === 'ready' && (
        <FlatList
          data={filtered}
          keyExtractor={(exercise) => exercise.id}
          contentContainerStyle={[styles.list, { paddingBottom }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshing={isRefreshing}
          onRefresh={refresh}
          ListHeaderComponent={
            <Text style={[type.caption, { color: colours.inkMuted, marginTop: 8, marginBottom: 4 }]}>
              {filtered.length} {filtered.length === 1 ? 'exercise' : 'exercises'}
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[type.title3, { color: colours.ink, textAlign: 'center' }]}>No exercises match</Text>
              {hasFilters ? (
                <PrimaryButton label="Clear filters" onPress={clearFilters} style={{ marginTop: 16 }} />
              ) : null}
            </View>
          }
          renderItem={({ item }) => {
            const photo = getExerciseImageSource(item);
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.card,
                  { backgroundColor: colours.surface, borderRadius: radius.lg },
                  pressed && styles.cardPressed,
                ]}
                onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.id } })}
                accessibilityRole="button">
                <View style={[styles.thumb, { backgroundColor: colours.brandSoft, borderRadius: radius.md }]}>
                  {photo ? (
                    <Image
                      source={photo}
                      style={styles.thumbImage}
                      resizeMode="cover"
                      accessibilityLabel=""
                    />
                  ) : (
                    <View style={styles.thumbEmpty}>
                      <Ionicons name="barbell-outline" size={20} color={colours.brand} />
                    </View>
                  )}
                </View>
                <View style={styles.cardText}>
                  <Text style={[type.title3, { color: colours.ink }]}>{item.name}</Text>
                  <Text style={[type.bodySm, { color: colours.inkMuted }]}>
                    {MUSCLE_LABELS[item.primary_muscle]} · {EQUIPMENT_LABELS[item.equipment]}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colours.inkMuted} />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 12,
  },
  headerTight: {
    paddingTop: 4,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    paddingVertical: 12,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
  },
  thumb: {
    width: 56,
    height: 56,
    overflow: 'hidden',
  },
  thumbImage: {
    width: 56,
    height: 56,
  },
  thumbEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardText: {
    flex: 1,
    gap: 4,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 48,
  },
});
