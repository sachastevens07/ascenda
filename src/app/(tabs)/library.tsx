import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { FilterSheet, type FilterOption } from '@/components/FilterSheet';
import { useTabBarHeight } from '@/components/PillTabBar';
import { colours } from '@/constants/theme';
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

type LoadState = 'loading' | 'error' | 'ready';

const MUSCLE_OPTIONS: FilterOption<Muscle>[] = MUSCLES.map((value) => ({
  value,
  label: MUSCLE_LABELS[value],
}));

const EQUIPMENT_OPTIONS: FilterOption<Equipment>[] = EQUIPMENT.map((value) => ({
  value,
  label: EQUIPMENT_LABELS[value],
}));

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

export default function LibraryScreen() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const tabBarHeight = useTabBarHeight();

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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Library</Text>

        <View style={styles.search}>
          <Ionicons name="search" size={20} color={colours.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search exercises"
            placeholderTextColor={colours.textMuted}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {query !== '' && (
            <Pressable onPress={() => setQuery('')} hitSlop={12} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={20} color={colours.textMuted} />
            </Pressable>
          )}
        </View>

        <View style={styles.filters}>
          <FilterSheet
            label="Muscle"
            allLabel="All muscles"
            options={MUSCLE_OPTIONS}
            value={muscle}
            onChange={setMuscle}
          />
          <FilterSheet
            label="Equipment"
            allLabel="All equipment"
            options={EQUIPMENT_OPTIONS}
            value={equipment}
            onChange={setEquipment}
          />
        </View>
      </View>

      {loadState === 'loading' && (
        <View style={styles.centre}>
          <ActivityIndicator color={colours.accent} />
        </View>
      )}

      {loadState === 'error' && (
        <View style={styles.centre}>
          <Text style={styles.emptyTitle}>We couldn’t load the library</Text>
          <Text style={styles.emptyText}>Check your connection and try again.</Text>
          {__DEV__ && errorDetail && <Text style={styles.errorDetail}>{errorDetail}</Text>}
          <Pressable style={styles.retry} onPress={() => { setLoadState('loading'); load(); }}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {loadState === 'ready' && (
        <FlatList
          data={filtered}
          keyExtractor={(exercise) => exercise.id}
          contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 24 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshing={isRefreshing}
          onRefresh={refresh}
          ListHeaderComponent={
            <Text style={styles.count}>
              {filtered.length} {filtered.length === 1 ? 'exercise' : 'exercises'}
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No exercises match</Text>
              {hasFilters && (
                <Pressable style={styles.retry} onPress={clearFilters}>
                  <Text style={styles.retryText}>Clear filters</Text>
                </Pressable>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.id } })}
              accessibilityRole="button">
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardSubtitle}>
                  {MUSCLE_LABELS[item.primary_muscle]} · {EQUIPMENT_LABELS[item.equipment]}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colours.textMuted} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colours.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 32,
    gap: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colours.text,
    marginBottom: 4,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colours.border,
    backgroundColor: colours.surface,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    color: colours.text,
    paddingVertical: 12,
  },
  filters: {
    flexDirection: 'row',
    gap: 10,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 10,
  },
  count: {
    fontSize: 14,
    color: colours.textMuted,
    marginTop: 16,
    marginBottom: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: colours.surface,
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardText: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colours.text,
  },
  cardSubtitle: {
    fontSize: 15,
    color: colours.textMuted,
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
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colours.text,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colours.textMuted,
    textAlign: 'center',
    marginTop: 6,
  },
  errorDetail: {
    fontSize: 13,
    color: colours.textMuted,
    textAlign: 'center',
    marginTop: 12,
  },
  retry: {
    marginTop: 16,
    minHeight: 48,
    paddingHorizontal: 24,
    borderRadius: 999,
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
  },
  retryText: {
    fontSize: 16,
    fontWeight: '700',
    color: colours.accent,
  },
});
