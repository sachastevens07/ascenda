/**
 * F4: one recipe suggestion from content/food/collections.json training_suggestions.
 * Never framed as a requirement or a reward. Copy comes from that file.
 */
import collectionsFile from '../../content/food/collections.json';

import { collectionBySlug, recipesInCollection, type Recipe } from '@/lib/food';
import type { SessionType } from '@/lib/sessionTypes';

export type FuelDayInput = {
  iso: string;
  title: string | null;
  completed: boolean;
  kind: string;
  isStretch?: boolean;
  plan?: { reminder_time?: string | null; session_kind?: SessionType | null } | null;
};

export type FuelSuggestion = {
  copy: string;
  collectionSlug: string;
  collectionName: string;
  recipe: Recipe;
  placement: 'after_session' | 'before_session';
};

type TrainingRule = {
  if: string;
  collection: string;
  copy: string;
  placement?: string;
};

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

const RULES: TrainingRule[] = asArray(asRecord(asRecord(collectionsFile).training_suggestions).rules).flatMap(
  (item) => {
    const row = asRecord(item);
    const ifText = text(row.if);
    const collection = text(row.collection);
    const copy = text(row.copy);
    if (!ifText || !collection || !copy) return [];
    const placement = text(row.placement);
    const rule: TrainingRule = { if: ifText, collection, copy };
    if (placement) rule.placement = placement;
    return [rule];
  }
);

function hashIndex(salt: string, length: number): number {
  if (length <= 0) return 0;
  let n = 0;
  for (let i = 0; i < salt.length; i += 1) n = (n * 31 + salt.charCodeAt(i)) >>> 0;
  return n % length;
}

function pickRecipe(collectionSlug: string, salt: string): Recipe | null {
  const recipes = recipesInCollection(collectionSlug);
  if (recipes.length === 0) return null;
  return recipes[hashIndex(`${salt}:${collectionSlug}`, recipes.length)] ?? recipes[0] ?? null;
}

function isLowerGluteOrFullBody(name: string | null | undefined): boolean {
  const raw = name?.trim().toLowerCase() ?? '';
  return raw.startsWith('lower') || raw.startsWith('glute') || raw.startsWith('full body') || raw.startsWith('full-body');
}

function reminderMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function ruleMatches(
  rule: TrainingRule,
  input: {
    moment: 'before' | 'after';
    sessionType: SessionType | null;
    dayName: string | null;
    reminderTime: string | null;
    now: Date;
  }
): boolean {
  if (rule.if.includes("session.type == 'strength' and day.name starts with")) {
    return input.moment === 'after' && input.sessionType === 'strength' && isLowerGluteOrFullBody(input.dayName);
  }
  if (rule.if === "session.type == 'strength'") {
    return input.moment === 'after' && input.sessionType === 'strength';
  }
  if (rule.if.includes('planned_session.reminder_time >= 17:00')) {
    const minutes = reminderMinutes(input.reminderTime);
    return input.moment === 'before' && minutes != null && minutes >= 17 * 60 && input.now.getHours() < 15;
  }
  if (rule.if.includes("session.type in ['cardio','recovery']")) {
    return input.moment === 'after' && (input.sessionType === 'cardio' || input.sessionType === 'recovery');
  }
  return false;
}

function suggestionFromRule(rule: TrainingRule, salt: string): FuelSuggestion | null {
  const recipe = pickRecipe(rule.collection, salt);
  if (!recipe) return null;
  const collection = collectionBySlug(rule.collection);
  return {
    copy: rule.copy,
    collectionSlug: rule.collection,
    collectionName: collection?.name ?? rule.collection,
    recipe,
    placement: rule.placement === 'home_hero_before_session' ? 'before_session' : 'after_session',
  };
}

export function pickFuelSuggestion(input: {
  moment: 'before' | 'after';
  sessionType: SessionType | null;
  dayName: string | null;
  reminderTime: string | null;
  now?: Date;
  salt?: string;
}): FuelSuggestion | null {
  const now = input.now ?? new Date();
  const salt = input.salt ?? now.toISOString().slice(0, 10);
  for (const rule of RULES) {
    if (!ruleMatches(rule, { ...input, now })) continue;
    const suggestion = suggestionFromRule(rule, salt);
    if (suggestion) return suggestion;
  }
  return null;
}

function isPlannedKind(kind: string): boolean {
  return kind === 'routine' || kind === 'custom' || kind === 'cardio' || kind === 'recovery';
}

export function sessionTypeFromPlannerDay(day: FuelDayInput | null): SessionType | null {
  if (!day || !isPlannedKind(day.kind)) return null;
  if (day.kind === 'cardio' || day.plan?.session_kind === 'cardio') return 'cardio';
  if (day.kind === 'recovery' || day.plan?.session_kind === 'recovery' || day.isStretch) return 'recovery';
  return day.plan?.session_kind ?? 'strength';
}

/** One suggestion for today: after a finished session, or a later-meal idea if one is planned. */
export function pickTodaysFuelSuggestion(
  today: FuelDayInput | null,
  now = new Date()
): FuelSuggestion | null {
  if (!today || !isPlannedKind(today.kind)) return null;
  const sessionType = sessionTypeFromPlannerDay(today);
  const dayName = today.title;
  const reminderTime = today.plan?.reminder_time ?? null;
  const salt = today.iso;
  if (today.completed) {
    return pickFuelSuggestion({
      moment: 'after',
      sessionType,
      dayName,
      reminderTime,
      now,
      salt,
    });
  }
  const before = pickFuelSuggestion({
    moment: 'before',
    sessionType,
    dayName,
    reminderTime,
    now,
    salt,
  });
  if (before) return before;
  return pickFuelSuggestion({
    moment: 'after',
    sessionType,
    dayName,
    reminderTime,
    now,
    salt,
  });
}
