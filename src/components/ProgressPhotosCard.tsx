import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { AppText, DestructiveTextButton, SecondaryButton, TextButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { fillCopy, progressPhotosCopy as copy } from '@/lib/copy';
import { formatShortDate, parseDate } from '@/lib/progress';
import type { ProgressPhoto } from '@/lib/progressPhotos';

type Props = {
  photos: ProgressPhoto[];
  error: string | null;
  shown: boolean;
  busy: boolean;
  onShow: () => void;
  onHide: () => void;
  onPick: (source: 'camera' | 'library') => void;
  onDelete: (photo: ProgressPhoto) => void;
  onDeleteAll: (photos: ProgressPhoto[]) => void;
};

const DAY = 24 * 60 * 60 * 1000;

function byDate(a: ProgressPhoto, b: ProgressPhoto): number {
  const diff = parseDate(a.taken_on).getTime() - parseDate(b.taken_on).getTime();
  return diff !== 0 ? diff : a.created_at.localeCompare(b.created_at);
}

/** "6 weeks apart". Whole days, then weeks from 14 days, then months from 60 days. */
export function describeGap(older: ProgressPhoto, newer: ProgressPhoto): string {
  const days = Math.round(
    Math.abs(parseDate(newer.taken_on).getTime() - parseDate(older.taken_on).getTime()) / DAY
  );
  if (days === 0) return copy.same_day;
  if (days < 14) return days === 1 ? copy.one_day_apart : fillCopy(copy.days_apart, { count: days });
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return weeks === 1 ? copy.one_week_apart : fillCopy(copy.weeks_apart, { count: weeks });
  }
  const months = Math.round(days / 30.4);
  return months === 1 ? copy.one_month_apart : fillCopy(copy.months_apart, { count: months });
}

function DatePill({ label }: { label: string }) {
  return (
    <View style={styles.datePill}>
      <AppText variant="caption" style={styles.datePillText}>
        {label}
      </AppText>
    </View>
  );
}

function Photo({ photo, style }: { photo: ProgressPhoto; style: object }) {
  const { colours } = useTheme();
  return photo.url ? (
    <Image source={{ uri: photo.url }} style={[style, { backgroundColor: colours.surfaceMuted }]} />
  ) : (
    <View style={[style, { backgroundColor: colours.surfaceMuted }]} />
  );
}

/** Soft dark fade at the bottom of a photo so the date pill always reads. */
function BottomFade({ id }: { id: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <Stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * H7 progress photos card on Activity → Progress. Hidden behind "Show photos".
 * Two photos side by side (first and latest by default), a grid where tapping
 * picks the pair, and an Edit mode for deleting. Never used in shares or AI.
 */
export function ProgressPhotosCard({
  photos,
  error,
  shown,
  busy,
  onShow,
  onHide,
  onPick,
  onDelete,
  onDeleteAll,
}: Props) {
  const { colours, radius, shadow } = useTheme();
  const sorted = useMemo(() => [...photos].sort(byDate), [photos]);
  const [picked, setPicked] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);

  // Keep the pair valid as photos come and go; default to first and latest.
  useEffect(() => {
    setPicked((current) => {
      const kept = current.filter((id) => sorted.some((photo) => photo.id === id));
      if (kept.length === 2) return kept;
      if (sorted.length < 2) return kept;
      return [sorted[0].id, sorted[sorted.length - 1].id];
    });
  }, [sorted]);

  useEffect(() => {
    if (sorted.length === 0 || !shown) setEditing(false);
  }, [sorted.length, shown]);

  const pair = sorted.filter((photo) => picked.includes(photo.id));
  const [older, newer] = pair.length === 2 ? pair : [null, null];

  function toggle(photo: ProgressPhoto) {
    setPicked((current) => {
      if (current.includes(photo.id)) return current.filter((id) => id !== photo.id);
      return current.length >= 2 ? [current[1], photo.id] : [...current, photo.id];
    });
  }

  const card = [
    styles.card,
    { backgroundColor: colours.surface, borderRadius: radius.xl },
    shadow,
  ];

  return (
    <View style={card}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: colours.brandSoft }]}>
          <Ionicons name="lock-closed" size={16} color={colours.brand} />
        </View>
        <View style={styles.flex}>
          <AppText variant="title3" style={{ color: colours.ink }}>
            {copy.title}
          </AppText>
          <AppText variant="caption" style={{ color: colours.inkMuted }}>
            {copy.subtitle}
          </AppText>
        </View>
        {shown ? <TextButton label={copy.hide_short} onPress={onHide} style={styles.headerAction} /> : null}
      </View>

      {!shown ? (
        <SecondaryButton label={copy.show} onPress={onShow} />
      ) : (
        <>
          {error ? (
            <AppText variant="caption" style={{ color: colours.inkMuted }}>
              {error}
            </AppText>
          ) : null}

          {sorted.length === 0 ? (
            <View style={[styles.empty, { borderColor: colours.border, borderRadius: radius.lg }]}>
              <Ionicons name="images-outline" size={28} color={colours.inkMuted} />
              <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                {copy.empty_title}
              </AppText>
              <AppText variant="bodySm" style={{ color: colours.inkMuted, textAlign: 'center' }}>
                {copy.empty_body}
              </AppText>
            </View>
          ) : null}

          {older && newer && !editing ? (
            <View style={styles.compare}>
              <View style={styles.compareRow}>
                {[older, newer].map((photo, index) => (
                  <View
                    key={photo.id}
                    style={[styles.compareCell, { borderRadius: radius.lg }]}>
                    <Photo photo={photo} style={styles.fill} />
                    <BottomFade id={`photoFade${index}`} />
                    <DatePill label={formatShortDate(parseDate(photo.taken_on))} />
                  </View>
                ))}
              </View>
              <View style={[styles.gapPill, { backgroundColor: colours.brandSoft }]}>
                <Ionicons name="swap-horizontal" size={14} color={colours.brand} />
                <AppText variant="caption" style={{ color: colours.brand, fontWeight: '600' }}>
                  {describeGap(older, newer)}
                </AppText>
              </View>
            </View>
          ) : null}

          {sorted.length === 1 && !editing ? (
            <View style={[styles.single, { borderRadius: radius.lg }]}>
              <Photo photo={sorted[0]} style={styles.fill} />
              <BottomFade id="photoFadeSingle" />
              <DatePill label={formatShortDate(parseDate(sorted[0].taken_on))} />
            </View>
          ) : null}

          {sorted.length > 0 ? (
            <>
              <View style={styles.gridHeader}>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                    {copy.all_photos}
                  </AppText>
                  <AppText variant="caption" style={{ color: colours.inkMuted }}>
                    {editing
                      ? copy.delete_body
                      : sorted.length === 1
                        ? copy.one_photo_hint
                        : copy.compare_hint}
                  </AppText>
                </View>
                <TextButton
                  label={editing ? copy.done : copy.edit}
                  onPress={() => setEditing((value) => !value)}
                  style={styles.headerAction}
                />
              </View>
              <View style={styles.grid}>
                {[...sorted].reverse().map((photo) => {
                  const order = pair.findIndex((item) => item.id === photo.id);
                  const selected = !editing && order >= 0 && sorted.length > 1;
                  const date = formatShortDate(parseDate(photo.taken_on));
                  return (
                    <Pressable
                      key={photo.id}
                      onPress={() => (editing ? onDelete(photo) : sorted.length > 1 && toggle(photo))}
                      accessibilityRole="button"
                      accessibilityLabel={fillCopy(
                        editing ? copy.a11y_delete : selected ? copy.a11y_selected : copy.a11y_select,
                        { date }
                      )}
                      style={({ pressed }) => [
                        styles.thumb,
                        {
                          borderRadius: radius.md,
                          borderColor: selected ? colours.brand : 'transparent',
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}>
                      <View style={[styles.thumbInner, { borderRadius: radius.md - 2 }]}>
                        <Photo photo={photo} style={styles.fill} />
                        <BottomFade id={`thumbFade${photo.id}`} />
                        <AppText variant="caption" style={styles.thumbDate} numberOfLines={1}>
                          {date}
                        </AppText>
                      </View>
                      {selected ? (
                        <View style={[styles.badge, { backgroundColor: colours.brand }]}>
                          <AppText variant="caption" style={{ color: colours.onBrand, fontWeight: '700' }}>
                            {order + 1}
                          </AppText>
                        </View>
                      ) : null}
                      {editing ? (
                        <View style={[styles.badge, { backgroundColor: colours.danger }]}>
                          <Ionicons name="trash" size={12} color="#fff" />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {editing ? (
            <DestructiveTextButton label={copy.delete_all} onPress={() => onDeleteAll(sorted)} />
          ) : (
            <View style={styles.actions}>
              <SecondaryButton
                label={copy.camera}
                appearance="outline"
                onPress={() => onPick('camera')}
                disabled={busy}
                style={styles.action}
              />
              <SecondaryButton
                label={copy.library}
                appearance="outline"
                onPress={() => onPick('library')}
                disabled={busy}
                style={styles.action}
              />
            </View>
          )}
          {busy ? <ActivityIndicator color={colours.brand} /> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 14,
  },
  flex: {
    flex: 1,
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAction: {
    minHeight: 36,
    paddingHorizontal: 0,
  },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 6,
  },
  compare: {
    alignItems: 'center',
  },
  compareRow: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'stretch',
  },
  compareCell: {
    flex: 1,
    aspectRatio: 3 / 4,
    overflow: 'hidden',
  },
  single: {
    width: '60%',
    aspectRatio: 3 / 4,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  datePill: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  datePillText: {
    color: '#fff',
    fontWeight: '600',
  },
  gapPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 10,
  },
  gridHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  thumb: {
    width: '31%',
    aspectRatio: 3 / 4,
    borderWidth: 2,
    padding: 0,
  },
  thumbInner: {
    flex: 1,
    overflow: 'hidden',
  },
  thumbDate: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 5,
    color: '#fff',
    fontWeight: '600',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  action: {
    flex: 1,
    minHeight: 48,
  },
});
