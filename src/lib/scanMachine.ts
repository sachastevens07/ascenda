import { trackAi } from '@/lib/analytics';
import { aiLimitBypassPayload } from '@/lib/devFlags';
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

function stripDataUri(value: string): string {
  const match = value.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
  return (match?.[1] ?? value).replace(/\s/g, '');
}

async function readFailBody(
  data: unknown,
  response: Response | undefined
): Promise<FunctionFail | null> {
  if (data && typeof data === 'object' && 'reason' in data) {
    return data as FunctionFail;
  }
  if (!response) return null;
  try {
    const parsed: unknown = await response.clone().json();
    if (parsed && typeof parsed === 'object' && 'reason' in parsed) {
      return parsed as FunctionFail;
    }
  } catch {
    /* Gateway errors are not JSON. */
  }
  return null;
}

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
  const image = stripDataUri(imageBase64);
  if (image.length < 100) return { kind: 'error' };
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const { data, error, response } = await supabase.functions.invoke('scan-machine', {
      body: { action: 'scan', image_base64: image, media_type: mediaType, ...aiLimitBypassPayload() },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });
    const failBody = await readFailBody(data, response);
    if (__DEV__) {
      console.log('scan-machine', {
        chars: image.length,
        status: response?.status ?? null,
        error: error?.message ?? null,
        ok: failBody?.ok ?? (data as FunctionOk | null)?.ok ?? null,
        reason: failBody?.reason ?? null,
      });
    }
    if (error) {
      const status = response?.status;
      const reason = failBody?.reason;
      if (status === 429 || reason === 'limit') {
        trackAi('ai_limit_reached', FEATURE);
        return { kind: 'limit' };
      }
      if (status === 504 || reason === 'timeout') {
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
