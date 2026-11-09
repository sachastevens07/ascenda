export const SESSION_TYPES = ['strength', 'cardio', 'recovery'] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const BLOCK_TYPES = ['warmup', 'strength', 'cardio', 'cooldown', 'stretch'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const CARDIO_STYLES = ['steady', 'intervals', 'finisher'] as const;
export type CardioStyle = (typeof CARDIO_STYLES)[number];

/** Stored on sessions.exercise_swaps so the player can restore without extra columns. */
export const CARDIO_SLUG_KEY = '_cardio_slug';

export function parseCardioStyle(value: unknown): CardioStyle | null {
  return value === 'steady' || value === 'intervals' || value === 'finisher' ? value : null;
}

export function sessionTypeFromSource(source: string | null | undefined): SessionType {
  if (source === 'stretch') return 'recovery';
  if (source === 'cardio') return 'cardio';
  return 'strength';
}

export function isCardioSession(session: {
  source?: string | null;
  type?: string | null;
  exercise_swaps?: Record<string, string> | null;
}): boolean {
  if (session.source === 'cardio' || session.type === 'cardio') return true;
  return Boolean(session.exercise_swaps?.[CARDIO_SLUG_KEY]);
}

export function parseSessionType(value: unknown, fallback: SessionType = 'strength'): SessionType {
  return value === 'strength' || value === 'cardio' || value === 'recovery' ? value : fallback;
}
