import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, useColorScheme, type TextStyle, type ViewStyle } from 'react-native';

import { fonts } from '@/constants/fonts';
import { appearanceLabels } from '@/lib/copy';

/**
 * Design tokens from DESIGN.md (approved).
 * Display serif is Fraunces; UI sans is Manrope. Each weight is a font family
 * name (see `fonts`). Do not set `fontWeight` on text: it breaks on Android.
 *
 * Kit screens use `useTheme()`. A few unrestyled screens still import the static
 * `colours` object and stay on the old cream palette until their design pass.
 */

export type Palette = {
  bg: string;
  surface: string;
  surfaceMuted: string;
  ink: string;
  inkMuted: string;
  /** Placeholders and disabled copy. */
  inkSubtle: string;
  brand: string;
  brandSoft: string;
  /** Coral. Small highlights only: eyebrows, streak flame, key numbers. */
  accent: string;
  /** Soft coral wash. Rest-week banner and similar highlights. */
  accentSoft: string;
  onAccent: string;
  onBrand: string;
  pro: string;
  onPro: string;
  danger: string;
  success: string;
  overlay: string;
  border: string;
};

export const light: Palette = {
  bg: '#F6F1EA',
  surface: '#FFFCF8',
  surfaceMuted: '#EDE6DC',
  ink: '#2C1810',
  inkMuted: '#7A6A60',
  inkSubtle: '#A2979B',
  brand: '#5C3A4E',
  brandSoft: '#E8D5DF',
  accent: '#E07A5F',
  accentSoft: '#F8E4DC',
  onAccent: '#FFFFFF',
  onBrand: '#FFFCF8',
  pro: '#C4A35A',
  onPro: '#FFF8E8',
  danger: '#B85C4A',
  success: '#6B8F71',
  overlay: 'rgba(44, 24, 16, 0.4)',
  border: '#E8DFD4',
};

export const dark: Palette = {
  bg: '#1A1412',
  surface: '#2A211C',
  surfaceMuted: '#3A2F28',
  ink: '#F6F1EA',
  inkMuted: '#B5A79C',
  inkSubtle: '#7E7378',
  brand: '#C4A0B4',
  brandSoft: '#3D2A35',
  accent: '#E07A5F',
  accentSoft: '#3A2A26',
  onAccent: '#FFFFFF',
  onBrand: '#1A1412',
  pro: '#C4A35A',
  onPro: '#1A1412',
  danger: '#E07A5F',
  success: '#8FBB96',
  overlay: 'rgba(0, 0, 0, 0.6)',
  border: '#3A2F28',
};

/** Current app palette. Keep these hex values until each screen is restyled. */
export type ThemeColours = {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  border: string;
  /** Personal-best trophies. */
  trophy: string;
  /** Destructive actions such as Discard. */
  danger: string;
};

export const colours: ThemeColours = {
  background: '#F7F4F0',
  surface: '#FFFFFF',
  text: '#1F1B24',
  textMuted: '#6B6570',
  accent: '#7A3E6B',
  accentSoft: '#F2E6EE',
  border: '#E6E0DA',
  trophy: '#C8901A',
  danger: '#A8443F',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

export type ShadowStyle = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>;

const lightShadow: ShadowStyle = {
  shadowColor: '#2C1810',
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.12,
  shadowRadius: 12,
  elevation: 3,
};

const darkShadow: ShadowStyle = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.45,
  shadowRadius: 12,
  elevation: 3,
};

const display: TextStyle = {
  fontFamily: fonts.display,
  fontSize: 34,
  lineHeight: 40,
  letterSpacing: -0.3,
};

const displaySm: TextStyle = {
  fontFamily: fonts.display,
  fontSize: 26,
  lineHeight: 32,
  letterSpacing: -0.3,
};

const title1: TextStyle = {
  fontFamily: fonts.bold,
  fontSize: 28,
  lineHeight: 34,
};

const title2: TextStyle = {
  fontFamily: fonts.bold,
  fontSize: 22,
  lineHeight: 28,
};

const title3: TextStyle = {
  fontFamily: fonts.semibold,
  fontSize: 18,
  lineHeight: 24,
};

const body: TextStyle = {
  fontFamily: fonts.regular,
  fontSize: 16,
  lineHeight: 24,
};

const bodyStrong: TextStyle = {
  fontFamily: fonts.semibold,
  fontSize: 16,
  lineHeight: 24,
};

const bodySm: TextStyle = {
  fontFamily: fonts.regular,
  fontSize: 14,
  lineHeight: 20,
};

const caption: TextStyle = {
  fontFamily: fonts.medium,
  fontSize: 12,
  lineHeight: 16,
};

const eyebrow: TextStyle = {
  fontFamily: fonts.bold,
  fontSize: 11,
  lineHeight: 14,
  letterSpacing: 1.4,
  textTransform: 'uppercase',
};

const number: TextStyle = {
  fontFamily: fonts.bold,
  fontSize: 32,
  lineHeight: 36,
  fontVariant: ['tabular-nums'],
};

/** Type tokens from DESIGN.md 3.2. Apply via `AppText`, not `fontWeight`. */
export const type = {
  display,
  displaySm,
  title1,
  title2,
  /** Same as title2; kept for screens already using `type.title`. */
  title: title2,
  title3,
  body,
  bodyStrong,
  bodySm,
  caption,
  eyebrow,
  number,
  /** Same as bodyStrong; kept for buttons already using `type.button`. */
  button: bodyStrong,
} as const;

export type TypeVariant = keyof typeof type;

export type ColorSchemeName = 'light' | 'dark';
export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_PREFERENCE_LABELS: Record<ThemePreference, string> = appearanceLabels;

const THEME_STORAGE_KEY = 'theme_preference';

export function parseThemePreference(value: unknown): ThemePreference | null {
  return THEME_PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : null;
}

export type Theme = {
  scheme: ColorSchemeName;
  preference: ThemePreference;
  /** True once AsyncStorage has been read. Cloud sync waits for this. */
  hasHydrated: boolean;
  /** True once AsyncStorage has a saved choice. Cloud sync only fills an empty device. */
  hasLocalPreference: boolean;
  setPreference: (value: ThemePreference) => void;
  colours: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  shadow: ShadowStyle;
  type: typeof type;
};

const defaultTheme: Theme = {
  scheme: 'light',
  preference: 'light',
  hasHydrated: false,
  hasLocalPreference: false,
  setPreference: () => {},
  colours: light,
  spacing,
  radius,
  shadow: lightShadow,
  type,
};

const ThemeContext = createContext<Theme>(defaultTheme);

function resolveScheme(preference: ThemePreference, system: ColorSchemeName | null | undefined): ColorSchemeName {
  if (preference === 'system') return system === 'dark' ? 'dark' : 'light';
  return preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('light');
  const [hasLocalPreference, setHasLocalPreference] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((value) => {
        const stored = parseThemePreference(value);
        if (stored) {
          setPreferenceState(stored);
          setHasLocalPreference(true);
        }
      })
      .catch(() => {})
      .finally(() => setHasHydrated(true));
  }, []);

  useEffect(() => {
    if (typeof Appearance.setColorScheme !== 'function') return;
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);

  const setPreference = useCallback((value: ThemePreference) => {
    setPreferenceState(value);
    setHasLocalPreference(true);
    AsyncStorage.setItem(THEME_STORAGE_KEY, value).catch(() => {});
  }, []);

  const scheme = resolveScheme(preference, system);
  const value = useMemo<Theme>(
    () => ({
      scheme,
      preference,
      hasHydrated,
      hasLocalPreference,
      setPreference,
      colours: scheme === 'dark' ? dark : light,
      spacing,
      radius,
      shadow: scheme === 'dark' ? darkShadow : lightShadow,
      type,
    }),
    [scheme, preference, hasHydrated, hasLocalPreference, setPreference]
  );
  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
