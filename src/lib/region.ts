import { getLocales } from 'expo-localization';

/**
 * Her phone's region, used only for sensible defaults (weight unit, emergency number).
 * Read on the device; never stored or sent anywhere.
 */
export function phoneRegion(): string | null {
  try {
    return getLocales()[0]?.regionCode?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

function usesPounds(): boolean {
  try {
    const locale = getLocales()[0];
    if (locale?.measurementSystem === 'us') return true;
    // Liberia and Myanmar also use pounds day to day.
    return ['US', 'LR', 'MM'].includes(locale?.regionCode?.toUpperCase() ?? '');
  } catch {
    return false;
  }
}

/** lbs in the US, kg everywhere else (including the UK, where gyms use kg). */
export function regionDefaultWeightUnit(): 'kg' | 'lbs' {
  return usesPounds() ? 'lbs' : 'kg';
}

const EMERGENCY_NUMBERS: Record<string, string> = {
  US: '911',
  CA: '911',
  MX: '911',
  PR: '911',
  GB: '999',
  IE: '112',
  AU: '000',
  NZ: '111',
  ZA: '112',
  IN: '112',
  JP: '119',
  KR: '119',
  CN: '120',
  HK: '999',
  SG: '995',
  MY: '999',
  PH: '911',
  AE: '998',
  BR: '192',
  AR: '107',
};

const EU_112 = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'NO', 'IS', 'CH', 'LI',
]);

/** "911", "999", "112"... or null when we don't know her region. */
export function emergencyNumber(): string | null {
  const region = phoneRegion();
  if (!region) return null;
  if (EMERGENCY_NUMBERS[region]) return EMERGENCY_NUMBERS[region];
  if (EU_112.has(region)) return '112';
  return null;
}

/** "call 911" or "call your local emergency number". */
export function callEmergencyPhrase(): string {
  const number = emergencyNumber();
  return number ? `call ${number}` : 'call your local emergency number';
}
