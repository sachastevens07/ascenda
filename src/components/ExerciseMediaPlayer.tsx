import Ionicons from '@expo/vector-icons/Ionicons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, TextButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { mediaUnavailableCopy } from '@/lib/copy';
import { fetchExercise } from '@/lib/exercises';
import {
  getExerciseMedia,
  hasExerciseMediaMatch,
  type ExerciseMedia,
  type ExerciseMediaView,
} from '@/lib/getExerciseMedia';

function LoopingClip({
  uri,
  onError,
  contentFit = 'cover',
}: {
  uri: string;
  onError: () => void;
  contentFit?: 'cover' | 'contain';
}) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const sub = player.addListener('statusChange', (payload) => {
      if (payload.status === 'error') onErrorRef.current();
    });
    player.play();
    return () => {
      sub.remove();
      player.pause();
    };
  }, [player]);

  return (
    <VideoView
      player={player}
      nativeControls={false}
      contentFit={contentFit}
      style={StyleSheet.absoluteFill}
    />
  );
}

function CueList({ cues }: { cues: string[] }) {
  const { colours } = useTheme();
  if (cues.length === 0) return null;
  return (
    <View style={styles.cues}>
      {cues.map((cue, index) => (
        <View key={cue} style={styles.cueRow}>
          <AppText variant="bodySm" style={{ color: colours.brand, width: 18 }}>
            {index + 1}
          </AppText>
          <AppText variant="body" style={[styles.flex, { color: colours.ink }]}>
            {cue}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function AngleToggle({
  views,
  viewIndex,
  onChange,
}: {
  views: ExerciseMediaView[];
  viewIndex: number;
  onChange: (index: number) => void;
}) {
  const { colours, radius } = useTheme();
  const namedViews = views.filter((item) => item.label === 'front' || item.label === 'side');
  if (namedViews.length < 2) return null;
  return (
    <View style={styles.angles}>
      {namedViews.map((item, index) => {
        const selected = (views[viewIndex] ?? views[0])?.label === item.label;
        return (
          <Pressable
            key={item.label}
            onPress={() => {
              const next = views.findIndex((view) => view.label === item.label);
              onChange(next >= 0 ? next : index);
            }}
            style={[
              styles.angle,
              {
                borderRadius: radius.full,
                backgroundColor: selected ? colours.brandSoft : colours.surfaceMuted,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}>
            <AppText variant="bodySm" style={{ color: selected ? colours.brand : colours.inkMuted }}>
              {item.label === 'front' ? 'Front' : 'Side'}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ExerciseMediaPlayer({
  exerciseId,
  cues = [],
  width,
  height,
  fallback,
  expandable = false,
}: {
  exerciseId: string;
  cues?: string[];
  width: number;
  height: number;
  fallback?: ReactNode;
  expandable?: boolean;
}) {
  const { colours, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [media, setMedia] = useState<ExerciseMedia | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'empty'>(
    hasExerciseMediaMatch(exerciseId) ? 'loading' : 'empty'
  );
  const [viewIndex, setViewIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const matched = hasExerciseMediaMatch(exerciseId);

  useEffect(() => {
    let alive = true;
    setLoadState(hasExerciseMediaMatch(exerciseId) ? 'loading' : 'empty');
    setFailed(false);
    setViewIndex(0);
    setFullscreen(false);
    getExerciseMedia(exerciseId)
      .then((result) => {
        if (!alive) return;
        setMedia(result);
        setLoadState(result ? 'ready' : 'empty');
      })
      .catch(() => {
        if (!alive) return;
        setMedia(null);
        setLoadState('empty');
      });
    return () => {
      alive = false;
    };
  }, [exerciseId]);

  const views = media?.videos ?? [];
  const active: ExerciseMediaView | null = views[viewIndex] ?? views[0] ?? null;
  const showFallback = failed || loadState === 'empty' || (loadState === 'ready' && !media);
  const canExpand = expandable && loadState === 'ready' && !showFallback && Boolean(active);
  const showClip = Boolean(active) && !showFallback && !fullscreen;

  const frame = (
    <View
      style={[
        styles.frame,
        { width, height, borderRadius: radius.lg, backgroundColor: colours.surfaceMuted },
      ]}>
      {loadState === 'loading' ? (
        <View style={[StyleSheet.absoluteFill, styles.centre]}>
          {matched ? (
            <ActivityIndicator color={colours.brand} />
          ) : (
            fallback ?? <ActivityIndicator color={colours.brand} />
          )}
        </View>
      ) : null}

      {!showFallback && media?.thumbnailUrl && !showClip ? (
        <Image
          source={{ uri: media.thumbnailUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibilityLabel="Exercise demonstration"
        />
      ) : null}

      {showClip && active ? (
        <LoopingClip key={active.url} uri={active.url} onError={() => setFailed(true)} />
      ) : null}

      {showFallback ? fallback ?? null : null}
    </View>
  );

  return (
    <View style={{ width, gap: 10 }}>
      {canExpand ? (
        <Pressable
          onPress={() => setFullscreen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open demonstration full screen">
          {frame}
        </Pressable>
      ) : (
        frame
      )}

      {!failed ? <AngleToggle views={views} viewIndex={viewIndex} onChange={setViewIndex} /> : null}

      {failed || (loadState === 'empty' && !fallback) ? (
        <View style={[styles.fallbackCopy, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}>
          <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
            {mediaUnavailableCopy}
          </AppText>
          <CueList cues={cues} />
        </View>
      ) : null}

      <Modal
        visible={fullscreen && Boolean(active)}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setFullscreen(false)}>
        <View style={styles.fullscreen}>
          {active ? (
            <LoopingClip
              key={`full-${active.url}`}
              uri={active.url}
              contentFit="contain"
              onError={() => {
                setFailed(true);
                setFullscreen(false);
              }}
            />
          ) : null}
          <Pressable
            onPress={() => setFullscreen(false)}
            style={[styles.fullscreenClose, { top: insets.top + 8 }]}
            accessibilityRole="button"
            accessibilityLabel="Close full screen">
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
          <View style={[styles.fullscreenAngles, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <AngleToggle views={views} viewIndex={viewIndex} onChange={setViewIndex} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function ExerciseMediaSheet({
  exerciseId,
  name,
  visible,
  onClose,
  onOpenGuide,
}: {
  exerciseId: string;
  name: string;
  visible: boolean;
  onClose: () => void;
  onOpenGuide?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colours, spacing, radius } = useTheme();
  const [cues, setCues] = useState<string[]>([]);
  const width = 320;
  const height = Math.round((width * 6) / 5);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    fetchExercise(exerciseId)
      .then((exercise) => {
        if (alive) setCues(exercise?.cues ?? []);
      })
      .catch(() => {
        if (alive) setCues([]);
      });
    return () => {
      alive = false;
    };
  }, [exerciseId, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colours.surface,
              borderRadius: radius.lg,
              paddingBottom: Math.max(insets.bottom, spacing.md),
            },
          ]}
          onPress={() => {}}>
          <AppText variant="title3" style={{ color: colours.ink }}>
            {name}
          </AppText>
          {visible && exerciseId ? (
            <ExerciseMediaPlayer exerciseId={exerciseId} cues={cues} width={width} height={height} />
          ) : null}
          {onOpenGuide ? (
            <TextButton
              label="How to do it"
              onPress={() => {
                onClose();
                onOpenGuide();
              }}
            />
          ) : null}
          <TextButton label="Close" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centre: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  angles: {
    flexDirection: 'row',
    gap: 8,
  },
  angle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  fallbackCopy: {
    padding: 12,
    gap: 8,
  },
  cues: {
    gap: 8,
  },
  cueRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(44, 24, 16, 0.4)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    padding: 20,
    gap: 14,
    alignItems: 'center',
  },
  fullscreen: {
    flex: 1,
    backgroundColor: '#111111',
  },
  fullscreenClose: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenAngles: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    alignItems: 'center',
  },
});
