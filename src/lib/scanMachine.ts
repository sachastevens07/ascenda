import { trackAi } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';

export type ScanConfidence = 'high' | 'medium' | 'low';

export type ScanMatch = {
  machineId: string | null;
  confidence: ScanConfidence;
  alternatives: string[];
  isGymEquipment: boolean;
  peopleVisible: boolean;
};

export type ScanOutcome =
  | { kind: 'match'; result: ScanMatch }
  | { kind: 'limit' }
  | { kind: 'timeout' }
  | { kind: 'fallback' }
  | { kind: 'error' };

type FunctionOk = {
  ok: true;
  machine_id?: string | null;
  confidence?: string;
  alternatives?: unknown;
  is_gym_equipment?: boolean;
  people_visible?: boolean;
};

type FunctionFail = {
  ok?: false;
  reason?: string;
};

const FEATURE = 'scan_machine' as const;

function asMatch(body: FunctionOk): ScanMatch | null {
  const confidence = body.confidence;
  if (confidence !== 'high' && confidence !== 'medium' && confidence !== 'low') return null;
  if (typeof body.is_gym_equipment !== 'boolean') return null;
  if (typeof body.people_visible !== 'boolean') return null;
  const alternatives = Array.isArray(body.alternatives)
    ? body.alternatives.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
  return {
    machineId: typeof body.machine_id === 'string' ? body.machine_id : null,
    confidence,
    alternatives,
    isGymEquipment: body.is_gym_equipment,
    peopleVisible: body.people_visible,
  };
}

export async function scanMachinePhoto(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png'
): Promise<ScanOutcome> {
  const image = imageBase64.replace(/\s/g, '');
  if (image.length < 100) return { kind: 'error' };
  try {
    const { data, error } = await supabase.functions.invoke('scan-machine', {
      body: { action: 'scan', image_base64: image, media_type: mediaType },
    });
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 429) {
        trackAi('ai_limit_reached', FEATURE);
        return { kind: 'limit' };
      }
      if (status === 504) {
        trackAi('ai_fallback_used', FEATURE);
        return { kind: 'timeout' };
      }
      trackAi('ai_fallback_used', FEATURE);
      return { kind: 'fallback' };
    }
    const body = (data ?? {}) as FunctionOk | FunctionFail;
    if (body.ok === true) {
      const match = asMatch(body);
      if (!match) {
        trackAi('ai_fallback_used', FEATURE);
        return { kind: 'fallback' };
      }
      trackAi('ai_feature_used', FEATURE);
      return { kind: 'match', result: match };
    }
    if (body.reason === 'limit') {
      trackAi('ai_limit_reached', FEATURE);
      return { kind: 'limit' };
    }
    if (body.reason === 'timeout') {
      trackAi('ai_fallback_used', FEATURE);
      return { kind: 'timeout' };
    }
    if (body.reason === 'fallback' || body.reason === 'unavailable') {
      trackAi('ai_fallback_used', FEATURE);
      return { kind: 'fallback' };
    }
    return { kind: 'error' };
  } catch {
    trackAi('ai_fallback_used', FEATURE);
    return { kind: 'timeout' };
  }
}

export async function reportScanMiss(modelGuess: string | null): Promise<void> {
  trackAi('ai_result_rejected', FEATURE);
  try {
    await supabase.functions.invoke('scan-machine', {
      body: { action: 'miss', model_guess: modelGuess },
    });
  } catch {
    /* Miss logging must never block the browse fallback. */
  }
}

export function openScan(): '/machines/scan' {
  return '/machines/scan';
}
