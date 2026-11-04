import { Text as RNText, type TextProps } from 'react-native';

import { fonts } from '@/constants/fonts';
import { useTheme, type TypeVariant } from '@/constants/theme';

export type AppTextProps = TextProps & {
  variant?: TypeVariant;
  /** Fraunces italic. Only used on display / displaySm (quotes). */
  italic?: boolean;
};

/**
 * The only place font family, size and weight are applied.
 * Pass colour, alignment and spacing in `style`. Do not pass fontFamily,
 * fontSize or fontWeight: Android cannot pick a weight from fontWeight.
 */
export function AppText({ variant = 'body', italic = false, style, ...rest }: AppTextProps) {
  const { type } = useTheme();
  const italicFamily =
    italic && (variant === 'display' || variant === 'displaySm')
      ? { fontFamily: fonts.displayItalic }
      : null;
  return <RNText {...rest} style={[type[variant], italicFamily, style]} />;
}
