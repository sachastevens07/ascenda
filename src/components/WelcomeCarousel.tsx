import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { EvolumaMark } from '@/components/EvolumaMark';
import { AppText, PhotoFill } from '@/components/ui';
import { fonts } from '@/constants/fonts';
import { useTheme } from '@/constants/theme';
import { fillCopy, welcomeCopy as copy } from '@/lib/copy';

type Slide = { image: string; title: string; body: string };

const SLIDES = copy.slides as Slide[];
const AUTO_ADVANCE_MS = 5000;

/**
 * Signed-out welcome screen: full-bleed photo carousel (swipe or auto-advance every 5 s),
 * title and line per slide, dots, then "Get started" and "Log in". Honest copy only.
 */
export function WelcomeCarousel({
  onGetStarted,
  onLogIn,
}: {
  onGetStarted: () => void;
  onLogIn: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colours } = useTheme();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => {
      const next = (index + 1) % SLIDES.length;
      listRef.current?.scrollToOffset({ offset: next * width, animated: true });
      setIndex(next);
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [index, paused, width]);

  function onScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(next);
    setPaused(false);
  }

  const slide = SLIDES[index] ?? SLIDES[0];

  return (
    <View style={[styles.screen, { backgroundColor: '#1A1214' }]}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.image}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => setPaused(true)}
        onMomentumScrollEnd={onScrollEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={{ width, height }}>
            <PhotoFill slug={item.image} label={item.title} />
          </View>
        )}
        style={StyleSheet.absoluteFill}
      />

      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="welcomeTop" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000" stopOpacity="0.45" />
            <Stop offset="0.22" stopColor="#000" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="welcomeBottom" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.38" stopColor="#1A1214" stopOpacity="0" />
            <Stop offset="0.68" stopColor="#1A1214" stopOpacity="0.72" />
            <Stop offset="1" stopColor="#1A1214" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#welcomeTop)" />
        <Rect width="100%" height="100%" fill="url(#welcomeBottom)" />
      </Svg>

      <View style={[styles.top, { paddingTop: insets.top + 14 }]} pointerEvents="none">
        <EvolumaMark size={44} color="#FFFFFF" />
        <AppText style={styles.wordmark} accessibilityRole="header">
          {copy.wordmark}
        </AppText>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]} pointerEvents="box-none">
        <View pointerEvents="none" style={styles.textBlock}>
          <AppText style={styles.title} accessibilityLiveRegion="polite">
            {slide.title}
          </AppText>
          <AppText variant="body" style={styles.body}>
            {slide.body}
          </AppText>
        </View>

        <View style={styles.dots}>
          {SLIDES.map((item, i) => (
            <Pressable
              key={item.image}
              hitSlop={8}
              onPress={() => {
                listRef.current?.scrollToOffset({ offset: i * width, animated: true });
                setIndex(i);
              }}
              accessibilityRole="button"
              accessibilityLabel={fillCopy(copy.a11y_slide, { index: i + 1, count: SLIDES.length })}
              style={[
                styles.dot,
                i === index ? styles.dotActive : null,
              ]}
            />
          ))}
        </View>

        <Pressable
          onPress={onGetStarted}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colours.brand, opacity: pressed ? 0.85 : 1 },
          ]}>
          <AppText variant="bodyStrong" style={[styles.primaryText, { color: '#FFFCF8' }]}>
            {copy.get_started}
          </AppText>
        </Pressable>

        <Pressable onPress={onLogIn} accessibilityRole="button" style={styles.logIn} hitSlop={8}>
          <AppText variant="body" style={styles.logInText}>
            {copy.have_account}{' '}
            <AppText variant="bodyStrong" style={styles.logInLink}>
              {copy.log_in}
            </AppText>
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  wordmark: {
    fontFamily: fonts.displaySemibold,
    fontSize: 30,
    lineHeight: 36,
    marginTop: 4,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
  },
  textBlock: {
    alignItems: 'center',
    minHeight: 132,
    justifyContent: 'flex-end',
  },
  title: {
    fontFamily: fonts.displaySemibold,
    fontSize: 32,
    lineHeight: 38,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  body: {
    color: 'rgba(255,255,255,0.86)',
    textAlign: 'center',
    marginTop: 10,
    maxWidth: 340,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 22,
    marginBottom: 26,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    width: 22,
    backgroundColor: '#FFFFFF',
  },
  primary: {
    minHeight: 58,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontSize: 17,
  },
  logIn: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  logInText: {
    color: 'rgba(255,255,255,0.86)',
  },
  logInLink: {
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },
});
