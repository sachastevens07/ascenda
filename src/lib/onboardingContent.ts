/**
 * Onboarding v2 screens and rule expressions from content/onboarding/onboarding.json.
 * Bundled. content:sync does not write this file into the database.
 */
import onboarding from '../../content/onboarding/onboarding.json';

import { GOAL_LABELS, type Goal } from '@/lib/goals';
import type { OnboardingDraft, Weekday } from '@/lib/onboardingAnswers';
import { formatPreferredDays } from '@/lib/onboardingAnswers';

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export type OnboardingOption = {
  value: string;
  label: string;
  icon?: string;
  sub?: string;
  insight?: string;
  insight_source?: string;
  stat_value?: string;
  image_slug?: string;
  exclusive?: boolean;
};

export type BlockedValue = {
  inline_message_title: string;
  inline_message: string;
  continue_disabled: boolean;
};

export type InsightStat = {
  value: string;
  text: string;
  source: string;
};

export type OnboardingScreen = {
  id: string;
  type: string;
  title: string;
  body: string;
  helper: string;
  eyebrow: string;
  why_we_ask: string;
  placeholder: string;
  button: string;
  primary_button: string;
  secondary_link: string;
  skip_label: string;
  image_slug: string | null;
  stores_to: string;
  options: OnboardingOption[];
  stops: OnboardingOption[];
  min: number | null;
  max: number | null;
  defaultValue: string | number | null;
  max_length: number | null;
  required: boolean;
  blocked: Record<string, BlockedValue>;
  body_by_main_goal: Record<string, string>;
  milestone_preview: { title: string; template: string } | null;
  show_if: string | null;
  alt_title: string;
  alt_body: string;
  extra_if: Record<string, string>;
  privacy_note: string;
  unit_options: string[];
  exact_count_from: string | null;
  suggest_defaults: Record<string, Weekday[]>;
  duration_seconds: number;
  steps: string[];
  why_title: string;
  week_title: string;
  week_template: string;
  week_extra: string;
  timeline_title: string;
  estimate_label: string;
  alternatives_title: string;
  alternatives_count: number;
  stat: InsightStat | null;
  extra_stats: InsightStat[];
  stat_min_value: number | null;
};

export type WhyLine = { if: string; text: string };
export type RecommendRule = { if: string; recommend: string; alternatives: string[] };

function parseOption(raw: unknown): OnboardingOption | null {
  const item = asRecord(raw);
  const value = String(item.value ?? '');
  const label = text(item.label);
  if (!label) return null;
  return {
    value,
    label,
    icon: text(item.icon) || undefined,
    sub: text(item.sub) || undefined,
    image_slug: text(item.image_slug) || undefined,
    exclusive: item.exclusive === true,
    insight: text(item.insight) || undefined,
    insight_source: text(item.insight_source) || undefined,
    stat_value: text(item.stat_value) || undefined,
  };
}

function parseStat(raw: unknown): InsightStat | null {
  const row = asRecord(raw);
  if (!text(row.value)) return null;
  return { value: text(row.value), text: text(row.text), source: text(row.source) };
}

function parseScreen(raw: unknown): OnboardingScreen {
  const item = asRecord(raw);
  const validation = asRecord(item.validation);
  const blockedRaw = asRecord(item.blocked_values);
  const blocked: Record<string, BlockedValue> = {};
  for (const [key, value] of Object.entries(blockedRaw)) {
    const row = asRecord(value);
    blocked[key] = {
      inline_message_title: text(row.inline_message_title),
      inline_message: text(row.inline_message),
      continue_disabled: row.continue_disabled !== false,
    };
  }
  const extraRaw = asRecord(item.extra_if);
  const extra_if: Record<string, string> = {};
  for (const [key, value] of Object.entries(extraRaw)) extra_if[key] = text(value);
  const bodyByGoal: Record<string, string> = {};
  for (const [key, value] of Object.entries(asRecord(item.body_by_main_goal))) {
    bodyByGoal[key] = text(value);
  }
  const milestone = asRecord(item.milestone_preview);
  const suggest: Record<string, Weekday[]> = {};
  for (const [key, value] of Object.entries(asRecord(item.suggest_defaults))) {
    suggest[key] = asArray(value).map(String) as Weekday[];
  }
  const stat = asRecord(item.stat);
  return {
    id: text(item.id),
    type: text(item.type),
    title: text(item.title),
    body: text(item.body),
    helper: text(item.helper),
    eyebrow: text(item.eyebrow),
    why_we_ask: text(item.why_we_ask),
    placeholder: text(item.placeholder),
    button: text(item.button),
    primary_button: text(item.primary_button),
    secondary_link: text(item.secondary_link),
    skip_label: text(item.skip_label),
    image_slug: text(item.image_slug) || null,
    stores_to: text(item.stores_to),
    options: asArray(item.options).map(parseOption).filter((row): row is OnboardingOption => Boolean(row)),
    stops: asArray(item.stops).map(parseOption).filter((row): row is OnboardingOption => Boolean(row)),
    min: num(item.min) ?? num(validation.min),
    max: num(item.max) ?? num(validation.max_length) ?? num(validation.max),
    defaultValue:
      typeof item.default === 'string' || typeof item.default === 'number' ? item.default : null,
    max_length: num(validation.max_length),
    required: validation.required === true,
    blocked,
    body_by_main_goal: bodyByGoal,
    milestone_preview: text(milestone.template)
      ? { title: text(milestone.title), template: text(milestone.template) }
      : null,
    show_if: text(item.show_if) || null,
    alt_title: text(item.alt_title),
    alt_body: text(item.alt_body),
    extra_if,
    privacy_note: text(item.privacy_note),
    unit_options: asArray(item.unit_options).map(String),
    exact_count_from: text(item.exact_count_from) || null,
    suggest_defaults: suggest,
    duration_seconds: num(item.duration_seconds) ?? 3,
    steps: asArray(item.steps).map(text).filter(Boolean),
    why_title: text(item.why_title),
    week_title: text(item.week_title),
    week_template: text(item.week_template),
    week_extra: text(item.week_extra),
    timeline_title: text(item.timeline_title),
    estimate_label: text(item.estimate_label),
    alternatives_title: text(item.alternatives_title),
    alternatives_count: num(item.alternatives_count) ?? 2,
    stat: parseStat(stat),
    extra_stats: asArray(item.extra_stats)
      .map(parseStat)
      .filter((row): row is InsightStat => Boolean(row)),
    stat_min_value: num(item.stat_min_value),
  };
}

const ROOT = asRecord(onboarding);

export const ONBOARDING_SCREENS: OnboardingScreen[] = asArray(ROOT.screens).map(parseScreen);

export const WHY_LINES: WhyLine[] = asArray(ROOT.why_lines).map((raw) => {
  const item = asRecord(raw);
  return { if: text(item.if), text: text(item.text) };
});

const recommendation = asRecord(ROOT.recommendation);

export const RECOMMEND_RULES: RecommendRule[] = asArray(recommendation.rules).map((raw) => {
  const item = asRecord(raw);
  return {
    if: text(item.if),
    recommend: text(item.recommend),
    alternatives: asArray(item.alternatives).map(text).filter(Boolean),
  };
});

export const NEVER_AUTO_RECOMMEND = new Set(asArray(recommendation.never_auto_recommend).map(text));

export const STRENGTH_ESTIMATE_DISPLAY = text(asRecord(ROOT.strength_estimate).display);

export const QUESTION_SCREEN_IDS = ONBOARDING_SCREENS.filter(
  (screen) =>
    screen.type !== 'welcome' &&
    screen.type !== 'name_ack' &&
    screen.type !== 'building' &&
    screen.type !== 'plan_reveal' &&
    screen.type !== 'disclaimer' &&
    screen.type !== 'paywall'
).map((screen) => screen.id);

export type RuleContext = {
  main_goal: string | null;
  gym_experience: string | null;
  gym_comfort: number | null;
  days_per_week: number | null;
  session_minutes: number | null;
  cardio_preference: string | null;
  st_not_sure: number | null;
  st_watched: number | null;
  st_motivation: number | null;
  st_stopped: number | null;
  st_busy: number | null;
  routine?: {
    days_per_week: number;
    session_minutes: number;
    goal: string;
    secondary_goals: string[];
    cardio_balanced: boolean;
  } | null;
};

export function ruleContextFromDraft(
  draft: OnboardingDraft,
  routine?: RuleContext['routine']
): RuleContext {
  return {
    main_goal: draft.main_goals[0] ?? null,
    gym_experience: draft.gym_experience,
    gym_comfort: draft.gym_comfort,
    days_per_week: draft.days_per_week,
    session_minutes: draft.session_minutes,
    cardio_preference: draft.cardio_preference,
    st_not_sure: draft.statements.not_sure_what_to_do ?? null,
    st_watched: draft.statements.feel_watched ?? null,
    st_motivation: draft.statements.hard_to_stay_motivated ?? null,
    st_stopped: draft.statements.started_and_stopped ?? null,
    st_busy: draft.statements.gym_usually_busy ?? null,
    routine: routine ?? null,
  };
}

type Token =
  | { kind: 'ident'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'op'; value: string };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const src = source.trim();
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i += 1;
      let value = '';
      while (i < src.length && src[i] !== quote) {
        value += src[i];
        i += 1;
      }
      i += 1;
      tokens.push({ kind: 'string', value });
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let value = '';
      while (i < src.length && /[0-9.]/.test(src[i])) {
        value += src[i];
        i += 1;
      }
      tokens.push({ kind: 'number', value: Number(value) });
      continue;
    }
    if ('()[],'.includes(ch)) {
      tokens.push({ kind: 'op', value: ch });
      i += 1;
      continue;
    }
    if (ch === '=' || ch === '!' || ch === '<' || ch === '>') {
      let value = ch;
      i += 1;
      if (src[i] === '=') {
        value += '=';
        i += 1;
      }
      tokens.push({ kind: 'op', value });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let value = '';
      while (i < src.length && /[A-Za-z0-9_.]/.test(src[i])) {
        value += src[i];
        i += 1;
      }
      tokens.push({ kind: 'ident', value });
      continue;
    }
    i += 1;
  }
  return tokens;
}

type EvalValue = string | number | boolean | string[] | null;

function lookupIdent(name: string, ctx: RuleContext): EvalValue {
  if (name === 'true') return true;
  if (name === 'false') return false;
  if (name === 'main_goal') return ctx.main_goal;
  if (name === 'gym_experience') return ctx.gym_experience;
  if (name === 'gym_comfort') return ctx.gym_comfort;
  if (name === 'days_per_week') return ctx.days_per_week;
  if (name === 'session_minutes') return ctx.session_minutes;
  if (name === 'cardio_preference') return ctx.cardio_preference;
  if (name === 'st_not_sure') return ctx.st_not_sure;
  if (name === 'st_watched') return ctx.st_watched;
  if (name === 'st_motivation') return ctx.st_motivation;
  if (name === 'st_stopped') return ctx.st_stopped;
  if (name === 'st_busy') return ctx.st_busy;
  if (name === 'routine.days_per_week') return ctx.routine?.days_per_week ?? null;
  if (name === 'routine.session_minutes') return ctx.routine?.session_minutes ?? null;
  if (name === 'routine.goal') return ctx.routine?.goal ?? null;
  if (name === 'routine.secondary_goals') return ctx.routine?.secondary_goals ?? [];
  if (name === 'routine.cardio_balanced') return ctx.routine?.cardio_balanced ?? false;
  return null;
}

function isTruthy(value: EvalValue): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

function compare(left: EvalValue, op: string, right: EvalValue): boolean {
  if (op === 'in') {
    const list = Array.isArray(right) ? right : [];
    return list.map(String).includes(String(left ?? ''));
  }
  if (op === '==') return left === right || String(left) === String(right);
  if (op === '!=') return left !== right && String(left) !== String(right);
  const a = typeof left === 'number' ? left : Number(left);
  const b = typeof right === 'number' ? right : Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (op === '<=') return a <= b;
  if (op === '>=') return a >= b;
  if (op === '<') return a < b;
  if (op === '>') return a > b;
  return false;
}

class Parser {
  tokens: Token[];
  i = 0;
  ctx: RuleContext;

  constructor(tokens: Token[], ctx: RuleContext) {
    this.tokens = tokens;
    this.ctx = ctx;
  }

  peek(): Token | null {
    return this.tokens[this.i] ?? null;
  }

  take(): Token | null {
    const token = this.peek();
    if (token) this.i += 1;
    return token;
  }

  matchOp(value: string): boolean {
    const token = this.peek();
    if (token?.kind === 'op' && token.value === value) {
      this.i += 1;
      return true;
    }
    return false;
  }

  matchIdent(value: string): boolean {
    const token = this.peek();
    if (token?.kind === 'ident' && token.value.toLowerCase() === value) {
      this.i += 1;
      return true;
    }
    return false;
  }

  parseOr(): boolean {
    let value = this.parseAnd();
    while (this.matchIdent('or')) value = this.parseAnd() || value;
    return value;
  }

  parseAnd(): boolean {
    let value = this.parseNot();
    while (this.matchIdent('and')) value = this.parseNot() && value;
    return value;
  }

  parseNot(): boolean {
    if (this.matchIdent('not')) return !this.parseNot();
    return this.parseAtom();
  }

  parseAtom(): boolean {
    if (this.matchOp('(')) {
      const value = this.parseOr();
      this.matchOp(')');
      return value;
    }
    const left = this.parseValue();
    const opToken = this.peek();
    if (opToken?.kind === 'ident' && opToken.value === 'in') {
      this.take();
      return compare(left, 'in', this.parseValue());
    }
    if (opToken?.kind === 'op' && ['==', '!=', '<=', '>=', '<', '>'].includes(opToken.value)) {
      this.take();
      return compare(left, opToken.value, this.parseValue());
    }
    return isTruthy(left);
  }

  parseValue(): EvalValue {
    const token = this.take();
    if (!token) return null;
    if (token.kind === 'number') return token.value;
    if (token.kind === 'string') return token.value;
    if (token.kind === 'op' && token.value === '[') {
      const items: string[] = [];
      while (this.peek() && !this.matchOp(']')) {
        const item = this.parseValue();
        if (item != null) items.push(String(item));
        this.matchOp(',');
      }
      return items;
    }
    if (token.kind === 'ident') return lookupIdent(token.value, this.ctx);
    return null;
  }
}

export function evalCondition(expression: string, ctx: RuleContext): boolean {
  const src = expression.trim();
  if (!src) return false;
  try {
    return new Parser(tokenize(src), ctx).parseOr();
  } catch {
    return false;
  }
}

export function fillTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, key: string) => {
    const value = vars[key];
    return value == null ? '' : String(value);
  });
}

export function draftPlaceholders(
  draft: OnboardingDraft,
  extra: Record<string, string | number | null | undefined> = {}
): Record<string, string | number | null | undefined> {
  const main = draft.main_goals[0] as Goal | undefined;
  return {
    name: draft.display_name.trim(),
    days_per_week: draft.days_per_week,
    preferred_days_text: formatPreferredDays(draft.preferred_days),
    main_goal_label: main ? GOAL_LABELS[main] : '',
    ...extra,
  };
}
