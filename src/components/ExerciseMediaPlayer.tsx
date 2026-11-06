import Ionicons from '@expo/vector-icons/Ionicons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, TextButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { mediaUnavailableCopy } from '@/lib/copy';
import { fetchExercise } from '@/lib/exercises';
import { getExerciseMedia, type ExerciseMedia, type ExerciseMediaView } from '@/lib/getExerciseMedia';

function LoopingClip({ uri, onError }: { uri: string; onError: () => void }) {
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
      contentFit="contain"
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

export function ExerciseMediaPlayer({
  exerciseId,
  cues = [],
  width,
  height,
  fallback,
}: {
  exerciseId: string;
  cues?: string[];
  width: number;
  height: number;
  fallback?: ReactNode;
}) {
  const { colours, radius } = useTheme();
  const [media, setMedia] = useState<ExerciseMedia | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'empty'>('loading');
  const [playing, setPlaying] = useState(false);
  const [viewIndex, setViewIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoadState('loading');
    setPlaying(false);
    setFailed(false);
    setViewIndex(0);
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
  const namedViews = views.filter((item) => item.label === 'front' || item.label === 'side');
  const showAngles = namedViews.length > 1;

  return (
    <View style={{ width, gap: 10 }}>
      <View
        style={[
          styles.frame,
          { width, height, borderRadius: radius.lg, backgroundColor: colours.surfaceMuted },
        ]}>
        {loadState === 'loading' ? (
          <View style={[StyleSheet.absoluteFill, styles.centre]}>
            {fallback ?? <ActivityIndicator color={colours.brand} />}
          </View>
        ) : null}

        {!showFallback && media?.thumbnailUrl && !playing ? (
          <Image
            source={{ uri: media.thumbnailUrl }}
            style={{ width, height }}
            resizeMode="cover"
            accessibilityLabel="Exercise demonstration"
          />
        ) : null}

        {!showFallback && playing && active ? (
          <LoopingClip uri={active.url} onError={() => setFailed(true)} />
        ) : null}

        {showFallback ? fallback ?? null : null}

        {loadState === 'ready' && !failed && !playing ? (
          <Pressable
            onPress={() => {
              if (active) setPlaying(true);
              else setFailed(true);
            }}
            style={[styles.playHit, StyleSheet.absoluteFill]}
            accessibilityRole="button"
            accessibilityLabel="Play demonstration">
            <View style={[styles.play, { backgroundColor: colours.overlay, borderRadius: radius.full }]}>
              <Ionicons name="play" size={28} color={colours.onAccent} />
            </View>
          </Pressable>
        ) : null}
      </View>

      {showAngles && !failed ? (
        <View style={styles.angles}>
          {namedViews.map((item, index) => {
            const selected = (views[viewIndex] ?? views[0])?.label === item.label;
            return (
              <Pressable
                key={item.label}
                onPress={() => {
                  const next = views.findIndex((view) => view.label === item.label);
                  setViewIndex(next >= 0 ? next : index);
                  setPlaying(false);
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
      ) : null}

      {failed || (loadState === 'empty' && !fallback) ? (
        <View style={[styles.fallbackCopy, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}>
          <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
            {mediaUnavailableCopy}
          </AppText>
          <CueList cues={cues} />
        </View>
      ) : null}
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
  playHit: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
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
});
