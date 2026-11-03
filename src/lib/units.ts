import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type WeightUnit = 'kg' | 'lbs';

export const WEIGHT_UNITS: WeightUnit[] = ['kg', 'lbs'];
export const DEFAULT_WEIGHT_UNIT: WeightUnit = 'kg';

const UNIT_KEY = 'weight_unit';
const LBS_PER_KG = 2.2046226218;

let currentUnit: WeightUnit = DEFAULT_WEIGHT_UNIT;
const listeners = new Set<(unit: WeightUnit) => void>();

function isWeightUnit(value: string | null | undefined): value is WeightUnit {
  return value === 'kg' || value === 'lbs';
}

function setCurrentUnit(unit: WeightUnit) {
  currentUnit = unit;
  listeners.forEach((fn) => fn(unit));
}

export function getWeightUnit(): WeightUnit {
  return currentUnit;
}

export function unitLabel(unit: WeightUnit = currentUnit): string {
  return unit;
}

export function formatUnitName(unit: WeightUnit): string {
  return unit === 'lbs' ? 'Pounds (lbs)' : 'Kilograms (kg)';
}

export function kgToDisplay(kg: number, unit: WeightUnit = currentUnit): number {
  return unit === 'lbs' ? kg * LBS_PER_KG : kg;
}

export function displayToKg(value: number, unit: WeightUnit = currentUnit): number {
  return unit === 'lbs' ? value / LBS_PER_KG : value;
}

/** "20 kg", "44.1 lbs". Storage stays in kilograms. */
export function formatWeight(kg: number, unit: WeightUnit = currentUnit): string {
  const value = kgToDisplay(kg, unit);
  const rounded = unit === 'lbs' ? Number(value.toFixed(1)) : Number(value.toFixed(2));
  return `${rounded} ${unit}`;
}

export function formatWeightInput(kg: number | null, unit: WeightUnit = currentUnit): string {
  if (kg === null) return '';
  const value = kgToDisplay(kg, unit);
  return String(unit === 'lbs' ? Number(value.toFixed(1)) : Number(value.toFixed(2)));
}

export function parseDisplayWeight(text: string, unit: WeightUnit = currentUnit): number | null {
  const value = Number.parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) return null;
  return Number(displayToKg(value, unit).toFixed(4));
}

export function useWeightUnit(): WeightUnit {
  const [unit, setUnit] = useState(currentUnit);
  useEffect(() => {
    listeners.add(setUnit);
    return () => {
      listeners.delete(setUnit);
    };
  }, []);
  return unit;
}

function isMissingUnitColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  return /weight_unit/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`);
}

export async function hydrateWeightUnit(): Promise<WeightUnit> {
  const unit = await fetchWeightUnit();
  setCurrentUnit(unit);
  return unit;
}

export async function fetchWeightUnit(): Promise<WeightUnit> {
  try {
    const stored = await AsyncStorage.getItem(UNIT_KEY);
    const local = isWeightUnit(stored) ? stored : DEFAULT_WEIGHT_UNIT;
    const { data, error } = await supabase.from('profiles').select('weight_unit').maybeSingle();
    if (error) {
      setCurrentUnit(local);
      return local;
    }
    const remote = (data as { weight_unit?: string | null } | null)?.weight_unit;
    if (isWeightUnit(remote)) {
      setCurrentUnit(remote);
      return remote;
    }
    setCurrentUnit(local);
    return local;
  } catch {
    return currentUnit;
  }
}

export async function saveWeightUnit(unit: WeightUnit): Promise<void> {
  setCurrentUnit(unit);
  await AsyncStorage.setItem(UNIT_KEY, unit);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('profiles').update({ weight_unit: unit }).eq('user_id', user.id);
  if (error && !isMissingUnitColumn(error)) throw new Error(error.message);
}
