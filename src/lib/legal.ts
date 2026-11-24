import { Linking } from 'react-native';

import privacy from '../../content/legal/privacy.json';

export const CONTACT_EMAIL = 'hello@evoluma.app';

export type LegalSection = {
  heading?: string;
  body: string;
};

export const TERMS_TITLE = 'Terms of use';

export const TERMS_SECTIONS: LegalSection[] = [
  {
    body: 'This is a plain-language draft until it is checked legally. Using Evoluma means you agree to these terms.',
  },
  {
    heading: 'Who it is for',
    body: 'Evoluma is for healthy adults aged 18 and over. It gives general fitness information and workout plans. It is not medical advice and does not replace advice from a doctor or other qualified health professional.',
  },
  {
    heading: 'Your account',
    body: 'You are responsible for keeping your sign-in details safe. You can delete your account at any time from Profile, Privacy. That removes the data stored with it.',
  },
  {
    heading: 'Subscriptions',
    body: 'Pro is billed through the App Store. You can cancel in your Apple subscription settings. Logging, history and export stay free if a subscription ends.',
  },
  {
    heading: 'Content',
    body: 'Routines, stretches, articles and suggested weights are general guidance, not a personal prescription. Train within your limits and stop if something feels wrong.',
  },
  {
    heading: 'Acceptable use',
    body: 'Do not try to access anyone else’s account or data, or use the app in a way that could harm other people.',
  },
  {
    heading: 'Contact',
    body: `Questions: ${CONTACT_EMAIL}.`,
  },
];

export const PRIVACY_TITLE = privacy.title;

export const PRIVACY_SECTIONS: LegalSection[] = privacy.sections.map((section) => ({
  heading: 'heading' in section ? section.heading : undefined,
  body: section.body,
}));

export async function openContactEmail(): Promise<boolean> {
  const url = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Evoluma')}`;
  const supported = await Linking.canOpenURL(url);
  if (!supported) return false;
  await Linking.openURL(url);
  return true;
}
