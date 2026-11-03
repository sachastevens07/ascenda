/** Bump this when the solicitor-approved wording changes. She is asked to accept again. */
export const DISCLAIMER_VERSION = 1;

export const DISCLAIMER_TITLE = 'Train safely with Ascenda';

export const DISCLAIMER_INTRO =
  'Ascenda gives general fitness information and workout plans for healthy adults aged 18 and over. It is not medical advice and does not replace advice from a doctor, physiotherapist or other qualified professional.';

export const DISCLAIMER_CHECK_HEADING =
  'Check with your GP or a qualified professional before you start if you:';

export const DISCLAIMER_CHECK_ITEMS = [
  'are pregnant, have given birth in the last year, or are trying to conceive',
  'have a heart condition, high blood pressure, diabetes, asthma or another long-term health condition',
  'have an injury, joint or back problem, or have had recent surgery',
  'take medication that affects your heart rate, blood pressure or balance',
  'have been told by a professional to limit exercise, or are unsure whether exercise is safe for you',
] as const;

export const DISCLAIMER_STOP_HEADING = 'Stop straight away and get medical help if you feel';

export const DISCLAIMER_STOP_BODY =
  'chest pain or tightness, severe breathlessness, dizziness or faintness, sudden or sharp pain, or anything that feels wrong. In an emergency, call 999 (or your local emergency number).';

export const DISCLAIMER_LIMITS_HEADING = 'Train within your limits.';

export const DISCLAIMER_LIMITS_BODY =
  'Warm up, use weights you can lift with good form, and never train through pain. Suggested weights are estimates based on what you log, not personal prescriptions. Exercise demos and tips are for guidance only; if you’re unsure how to do a movement, ask a qualified instructor at your gym.';

export const DISCLAIMER_CLOSE =
  'You choose how and when you train, and you’re responsible for doing so safely.';

export const DISCLAIMER_CHECKBOX_LABEL = 'I’ve read this and I’m 18 or over';

export const SAFETY_NOTICE_LABEL = 'Train within your limits. Read the safety guidance';

export const FIRST_SESSION_TITLE = 'Train within your limits';

export const FIRST_SESSION_BULLETS = [
  'This is general fitness information, not medical advice.',
  'Check with your GP first if you are pregnant, injured or have a health condition.',
  'Stop and get help if you feel chest pain, dizziness or sharp pain.',
  'Use weights you can lift with good form, and never train through pain.',
] as const;

export type DisclaimerFields = {
  disclaimer_version: number | null;
  disclaimer_accepted_at: string | null;
  /** False until supabase/disclaimer.sql has been run. */
  disclaimer_ready: boolean;
};

export function hasAcceptedCurrentDisclaimer(fields: DisclaimerFields | null | undefined): boolean {
  if (!fields?.disclaimer_ready) return true;
  return fields.disclaimer_version === DISCLAIMER_VERSION;
}

export function needsDisclaimerAcceptance(fields: DisclaimerFields | null | undefined): boolean {
  return !hasAcceptedCurrentDisclaimer(fields);
}
