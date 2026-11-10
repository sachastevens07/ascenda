import stretchFile from '../../content/stretches/stretch-routines.json';

import {
  contentPhaseForWeek,
  contentRoutine,
  type ContentRoutineOverlay,
  type ContentScheduleSlot,
  type ContentSupportDay,
} from '@/lib/contentRoutines';
import {
  CARDIO_PREFERENCES,
  defaultDaysFor,
  parseCardioPreference,
  parseOnboardingAnswers,
  WEEKDAYS,
  type CardioPreference,
  type Weekday,
} from '@/lib/onboardingAnswers';
import { supabase } from '@/lib/supabase';

export const SESSION_TYPE_COLOURS = {
  cardio: '#C8644F',
  recovery: '#4F8A86',
} as const;

export const OVERLAY_PLAN_PREFIX = 'overlay:';

export type PlacedSlot = {
  weekday: Weekday;
  type: 'strength' | 'cardio' | 'recovery' | 'rest';
  day_key: string | null;
  cardio_slug: string | null;
  stretch_slug: string | null;
  optional: boolean;
  name: string | null;
  minutes: number | null;
};

export type WeekPlanPrefs = {
  preferredDays: Weekday[];
  cardioPreference: CardioPreference;
};

type StretchMeta = { name: string; minutes: number };

const STRETCH_BY_SLUG = new Map<string, StretchMeta>();
const stretchRoot = stretchFile as { stretch_routines?: unknown[] };
for (const raw of stretchRoot.stretch_routines ?? []) {
  if (!raw || typeof raw !== 'object') continue;
  const row = raw as { slug?: unknown; name?: unknown; duration_minutes?: unknown };
  const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
  if (!slug) continue;
  const minutes =
    typeof row.duration_minutes === 'number' && Number.isFinite(row.duration_minutes)
      ? row.duration_minutes
      : 12;
  STRETCH_BY_SLUG.set(slug, {
    name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : slug,
    minutes,
  });
}

function isLowerOrFullFocus(focus: string): boolean {
  const text = focus.toLowerCase();
  if (/full body|full-body/.test(text)) return true;
  if (/\bupper\b/.test(text) && !/\blower\b/.test(text)) return false;
  return /leg|glute|squat|hinge|hip|lower/.test(text);
}

export function overlayPlanId(iso: string, type: 'cardio' | 'recovery'): string {
  return `${OVERLAY_PLAN_PREFIX}${iso}:${type}`;
}

export function isOverlayPlanId(id: string | null | undefined): boolean {
  return Boolean(id && id.startsWith(OVERLAY_PLAN_PREFIX));
}

export function stretchMeta(slug: string | null | undefined): StretchMeta | null {
  if (!slug) return null;
  return STRETCH_BY_SLUG.get(slug) ?? null;
}

export function pickScheduleTemplate(
  overlay: ContentRoutineOverlay,
  preference: CardioPreference
): ContentScheduleSlot[] {
  const schedule = overlay.weekly_schedule;
  if (overlay.cardio_balanced) {
    return (
      schedule.fine ??
      schedule.love ??
      schedule.avoid ??
      CARDIO_PREFERENCES.map((key) => schedule[key]).find((slots) => slots && slots.length > 0) ??
      []
    );
  }
  return schedule[preference] ?? schedule.fine ?? schedule.avoid ?? schedule.love ?? [];
}

function supportForWeek(
  days: ContentSupportDay[],
  key: string | null,
  weekNumber: number
): ContentSupportDay['by_week'][number] | null {
  if (!key) return null;
  const day = days.find((item) => item.key === key);
  if (!day) return null;
  return day.by_week.find((entry) => entry.weeks.includes(weekNumber)) ?? null;
}

function supportName(days: ContentSupportDay[], key: string | null): string | null {
  if (!key) return null;
  return days.find((item) => item.key === key)?.name ?? null;
}

function nextWeekday(day: Weekday, steps = 1): Weekday {
  const index = WEEKDAYS.indexOf(day);
  return WEEKDAYS[(index + steps + WEEKDAYS.length) % WEEKDAYS.length];
}

function previousWeekday(day: Weekday): Weekday {
  return nextWeekday(day, 6);
}

function takePreferredEmpty(free: Weekday[], preferred: Weekday[]): Weekday | null {
  const leftover = preferred.find((day) => free.includes(day));
  return leftover ?? free[0] ?? null;
}

function remapTemplate(
  template: ContentScheduleSlot[],
  preferredDays: Weekday[],
  focusByKey: Map<string, string>
): ContentScheduleSlot[] {
  const strengthSlots = template.filter((slot) => slot.type === 'strength');
  const assigned = new Map<Weekday, ContentScheduleSlot>();
  const unusedStrength = [...strengthSlots];

  for (const day of preferredDays) {
    const next = unusedStrength.shift();
    if (!next) break;
    assigned.set(day, { ...next, weekday: day });
  }

  for (const leftover of unusedStrength) {
    const fallback =
      !assigned.has(leftover.weekday) ? leftover.weekday : WEEKDAYS.find((day) => !assigned.has(day));
    if (!fallback) break;
    assigned.set(fallback, { ...leftover, weekday: fallback });
  }

  function freeDays(): Weekday[] {
    return WEEKDAYS.filter((day) => !assigned.has(day));
  }

  function isLowerDay(day: Weekday): boolean {
    const slot = assigned.get(day);
    if (!slot || slot.type !== 'strength' || !slot.day_key) return false;
    return isLowerOrFullFocus(focusByKey.get(slot.day_key) ?? '');
  }

  function placeSupport(slot: ContentScheduleSlot): boolean {
    const free = freeDays();
    if (free.length <= 1) return false;
    if (slot.type === 'recovery') {
      const afterLower = WEEKDAYS.filter((day) => isLowerDay(previousWeekday(day)) && free.includes(day));
      const pick = afterLower[0] ?? takePreferredEmpty(free, preferredDays);
      if (!pick) return false;
      assigned.set(pick, { ...slot, weekday: pick });
      return true;
    }
    const safe = free.filter((day) => !isLowerDay(nextWeekday(day)));
    const pick = takePreferredEmpty(safe.length > 0 ? safe : free, preferredDays);
    if (!pick) return false;
    assigned.set(pick, { ...slot, weekday: pick });
    return true;
  }

  for (const cardio of template.filter((slot) => slot.type === 'cardio' && !slot.optional)) {
    if (!placeSupport(cardio)) break;
  }
  for (const cardio of template.filter((slot) => slot.type === 'cardio' && slot.optional)) {
    if (!placeSupport(cardio)) break;
  }
  for (const recovery of template.filter((slot) => slot.type === 'recovery')) {
    if (!placeSupport(recovery)) break;
  }

  return WEEKDAYS.map((weekday) => {
    const slot = assigned.get(weekday);
    if (slot) return slot;
    return {
      weekday,
      type: 'rest' as const,
      day_key: null,
      support_key: null,
      optional: false,
      finisher: null,
      finisher_skip_weeks: [],
    };
  });
}

export function slotsForWeek(input: {
  overlay: ContentRoutineOverlay;
  weekNumber: number;
  preferredDays: Weekday[];
  cardioPreference: CardioPreference;
}): PlacedSlot[] {
  const template = pickScheduleTemplate(input.overlay, input.cardioPreference);
  if (template.length === 0) return [];

  const phase = contentPhaseForWeek(input.overlay, input.weekNumber);
  const focusByKey = new Map<string, string>();
  for (const day of phase?.days ?? input.overlay.phases.flatMap((item) => item.days)) {
    if (day.key) focusByKey.set(day.key, day.focus);
  }

  const laidOut = remapTemplate(template, input.preferredDays, focusByKey);
  return WEEKDAYS.map((weekday) => {
    const slot = laidOut.find((item) => item.weekday === weekday) ?? {
      weekday,
      type: 'rest' as const,
      day_key: null,
      support_key: null,
      optional: false,
      finisher: null,
      finisher_skip_weeks: [],
    };
    const support = supportForWeek(input.overlay.support_days, slot.support_key, input.weekNumber);
    if (slot.type === 'cardio' || slot.type === 'recovery') {
      const cardioSlug = support?.cardio_session ?? null;
      const stretchSlug = support?.stretch_routine ?? null;
      if (!cardioSlug && !stretchSlug) {
        return {
          weekday,
          type: 'rest',
          day_key: null,
          cardio_slug: null,
          stretch_slug: null,
          optional: false,
          name: null,
          minutes: null,
        };
      }
      const stretch = stretchMeta(stretchSlug);
      return {
        weekday,
        type: slot.type,
        day_key: null,
        cardio_slug: cardioSlug,
        stretch_slug: stretchSlug,
        optional: slot.optional,
        name: stretch?.name ?? supportName(input.overlay.support_days, slot.support_key),
        minutes: stretch?.minutes ?? null,
      };
    }
    if (slot.type === 'strength') {
      return {
        weekday,
        type: 'strength',
        day_key: slot.day_key,
        cardio_slug: null,
        stretch_slug: null,
        optional: false,
        name: null,
        minutes: input.overlay.session_minutes || null,
      };
    }
    return {
      weekday,
      type: 'rest',
      day_key: null,
      cardio_slug: null,
      stretch_slug: null,
      optional: false,
      name: null,
      minutes: null,
    };
  });
}

export function describeScheduledWeek(overlay: ContentRoutineOverlay): string {
  return (
    overlay.schedule_label ||
    `${overlay.days_per_week} strength days a week, plus optional cardio and stretching`
  );
}

export function overlayForRoutine(
  slug: string | null | undefined,
  id?: string | null
): ContentRoutineOverlay | null {
  if (slug && contentRoutine(slug)) return contentRoutine(slug);
  if (id && contentRoutine(id)) return contentRoutine(id);
  return null;
}

export async function fetchWeekPlanPrefs(): Promise<WeekPlanPrefs> {
  const { data, error } = await supabase
    .from('profiles')
    .select('cardio_preference, onboarding_answers, days_per_week')
    .maybeSingle();
  if (error && /cardio_preference|onboarding_answers|days_per_week/i.test(error.message)) {
    const fallback = await supabase.from('profiles').select('onboarding_answers').maybeSingle();
    const extras = parseOnboardingAnswers(fallback.data?.onboarding_answers);
    const preferred = (extras.preferred_days ?? []).filter((day): day is Weekday =>
      (WEEKDAYS as readonly string[]).includes(day)
    );
    return {
      preferredDays: preferred.length > 0 ? preferred : defaultDaysFor(3),
      cardioPreference: 'fine',
    };
  }
  const extras = parseOnboardingAnswers(data?.onboarding_answers);
  const days = Number(data?.days_per_week);
  const count = (days >= 2 && days <= 5 ? days : 3) as 2 | 3 | 4 | 5;
  const preferred = (extras.preferred_days ?? []).filter((day): day is Weekday =>
    (WEEKDAYS as readonly string[]).includes(day)
  );
  return {
    preferredDays: preferred.length === count ? preferred : defaultDaysFor(count),
    cardioPreference: parseCardioPreference(data?.cardio_preference) ?? 'fine',
  };
}

export async function fetchRoutineIdBySlug(slug: string): Promise<string | null> {
  const { data, error } = await supabase.from('routines').select('id').eq('slug', slug).maybeSingle();
  if (!error && data?.id) return data.id as string;
  const byId = await supabase.from('routines').select('id').eq('id', slug).maybeSingle();
  if (!byId.error && byId.data?.id) return byId.data.id as string;
  return null;
}
