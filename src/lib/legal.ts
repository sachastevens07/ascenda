import { Linking } from 'react-native';

export const CONTACT_EMAIL = 'hello@ascenda.app';

export type LegalSection = {
  heading?: string;
  body: string;
};

export const TERMS_TITLE = 'Terms of use';

export const TERMS_SECTIONS: LegalSection[] = [
  {
    body: 'This is a plain-language draft until it is checked legally. Using Ascenda means you agree to these terms.',
  },
  {
    heading: 'Who it is for',
    body: 'Ascenda is for healthy adults aged 18 and over. It gives general fitness information and workout plans. It is not medical advice and does not replace advice from a doctor or other qualified health professional.',
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

export const PRIVACY_TITLE = 'Privacy policy';

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    body: 'This describes how Ascenda uses data today. It will be checked legally before the App Store listing goes live.',
  },
  {
    heading: 'What we store',
    body: 'Your email, onboarding answers, workout sessions and sets, optional bodyweight, optional progress photos, subscription status, reminder preferences, and a few display choices such as theme and units.',
  },
  {
    heading: 'What we do not store',
    body: 'We do not collect cycle data, calorie or macro targets, BMI or body-fat estimates. Progress photos are never sent to an AI service.',
  },
  {
    heading: 'Analytics',
    body: 'Named events such as finishing a session or opening the paywall may go to PostHog in the EU. We do not send health data, photos or free-text notes.',
  },
  {
    heading: 'Progress photos',
    body: 'Photos are off until you switch them on in Profile. They live in a private folder and are shown with short-lived links. You can delete one photo or all of them.',
  },
  {
    heading: 'Where data lives',
    body: 'App data is stored with Supabase in the UK or EU. Subscriptions use RevenueCat. You can export your workout history as a spreadsheet from Profile.',
  },
  {
    heading: 'Delete your data',
    body: `Profile, Privacy, Delete account removes your account and the data stored with it. You can also write to ${CONTACT_EMAIL}.`,
  },
];

export async function openContactEmail(): Promise<boolean> {
  const url = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Ascenda')}`;
  const supported = await Linking.canOpenURL(url);
  if (!supported) return false;
  await Linking.openURL(url);
  return true;
}
