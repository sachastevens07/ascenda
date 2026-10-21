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
