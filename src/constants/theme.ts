import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Design tokens from DESIGN.md (approved).
 * Serif display (Fraunces / DM Serif Display) and Inter are not bundled yet.
 * Ask before adding a font package. Until then, type styles use the system sans.
 *
 * Existing screens keep importing `colours` (the current palette) so this step
 * does not restyle them. New UI in `src/components/ui` uses `useTheme()`.
 */

export type Palette = {
  bg: string;
  surface: string;
  surfaceMuted: string;
  ink: string;
  inkMuted: string;
  brand: string;
  brandSoft: string;
  /** Coral. Small highlights and the Start-session CTA, never large fills. */
  accent: string;
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
  brand: '#5C3A4E',
  brandSoft: '#E8D5DF',
  accent: '#E07A5F',
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
  brand: '#C4A0B4',
  brandSoft: '#3D2A35',
  accent: '#E07A5F',
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
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 12,
  elevation: 3,
};

const darkShadow: ShadowStyle = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.4,
  shadowRadius: 12,
  elevation: 3,
};

/** System sans until a font package is approved. */
export const type = {
  display: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 40,
  } satisfies TextStyle,
  title: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  } satisfies TextStyle,
  body: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  } satisfies TextStyle,
  caption: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  } satisfies TextStyle,
  button: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  } satisfies TextStyle,
};

export type ColorSchemeName = 'light' | 'dark';

export type Theme = {
  scheme: ColorSchemeName;
  colours: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  shadow: ShadowStyle;
  type: typeof type;
};

const defaultTheme: Theme = {
  scheme: 'light',
  colours: light,
  spacing,
  radius,
  shadow: lightShadow,
  type,
};

const ThemeContext = createContext<Theme>(defaultTheme);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const scheme: ColorSchemeName = system === 'dark' ? 'dark' : 'light';
  const value = useMemo<Theme>(
    () => ({
      scheme,
      colours: scheme === 'dark' ? dark : light,
      spacing,
      radius,
      shadow: scheme === 'dark' ? darkShadow : lightShadow,
      type,
    }),
    [scheme]
  );
  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
