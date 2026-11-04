import {
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
  Fraunces_600SemiBold,
} from '@expo-google-fonts/fraunces';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';

/**
 * Loaded by `useFonts` in the root layout. Keys are the React Native
 * `fontFamily` names. Each weight is its own family so Android does not
 * fake bold or italic with `fontWeight`.
 */
export const fontAssets = {
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
  Fraunces_600SemiBold,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
};

export const fonts = {
  display: 'Fraunces_400Regular',
  displayItalic: 'Fraunces_400Regular_Italic',
  displaySemibold: 'Fraunces_600SemiBold',
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extraBold: 'Manrope_800ExtraBold',
} as const;
