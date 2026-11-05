export const SESSION_TYPES = ['strength', 'cardio', 'recovery'] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const BLOCK_TYPES = ['warmup', 'strength', 'cardio', 'cooldown', 'stretch'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const CARDIO_STYLES = ['steady', 'intervals', 'finisher'] as const;
export type CardioStyle = (typeof CARDIO_STYLES)[number];

export function sessionTypeFromSource(source: string | null | undefined): SessionType {
  return source === 'stretch' ? 'recovery' : 'strength';
}

export function parseSessionType(value: unknown, fallback: SessionType = 'strength'): SessionType {
  return value === 'strength' || value === 'cardio' || value === 'recovery' ? value : fallback;
}
