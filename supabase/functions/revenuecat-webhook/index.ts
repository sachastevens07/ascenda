import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * RevenueCat webhook. The only writer of public.subscriptions.
 * Set REVENUECAT_WEBHOOK_SECRET to the same Authorization value as the
 * RevenueCat dashboard. verify_jwt is off: this is not a user JWT.
 * Never logs product payloads or customer info.
 */

const ENTITLEMENT = 'ascenda_pro';
const STATUSES = ['trial', 'active', 'grace', 'expired'] as const;
type Status = (typeof STATUSES)[number];

type RcEvent = {
  type?: string;
  app_user_id?: string;
  transferred_from?: string[];
  transferred_to?: string[];
  product_id?: string;
  new_product_id?: string;
  period_type?: string;
  expiration_at_ms?: number | null;
  entitlement_ids?: string[] | null;
  entitlement_id?: string | null;
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: { ok: boolean }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function authorised(req: Request): boolean {
  const secret = (Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '').trim();
  if (!secret) return false;
  const header = req.headers.get('Authorization') ?? '';
  return header === secret || header === `Bearer ${secret}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function coversEntitlement(event: RcEvent): boolean {
  if (event.entitlement_id === ENTITLEMENT) return true;
  if (Array.isArray(event.entitlement_ids) && event.entitlement_ids.includes(ENTITLEMENT)) {
    return true;
  }
  const product = event.new_product_id ?? event.product_id ?? '';
  return product === 'ascenda_annual' || product === 'ascenda_monthly';
}

function statusFromEvent(event: RcEvent): Status {
  const type = (event.type ?? '').toUpperCase();
  if (type === 'BILLING_ISSUE') return 'grace';
  if (type === 'EXPIRATION' || type === 'REFUND') return 'expired';
  if ((event.period_type ?? '').toUpperCase() === 'TRIAL') return 'trial';
  return 'active';
}

function expiresAt(event: RcEvent): string | null {
  const ms = event.expiration_at_ms;
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}

function productId(event: RcEvent): string | null {
  const value = event.new_product_id ?? event.product_id;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') return json({ ok: false }, 405);
  if (!authorised(req)) return json({ ok: false }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) {
    console.log('revenuecat-webhook misconfigured');
    return json({ ok: false }, 503);
  }

  let event: RcEvent = {};
  try {
    const body = (await req.json()) as { event?: RcEvent };
    event = body.event ?? {};
  } catch {
    return json({ ok: false }, 400);
  }

  if (!coversEntitlement(event) && (event.type ?? '').toUpperCase() !== 'TRANSFER') {
    return json({ ok: true });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function write(userId: string, status: Status, product: string | null, expires: string | null) {
    if (!isUuid(userId)) return;
    const { error } = await admin.from('subscriptions').upsert(
      {
        user_id: userId,
        entitlement: ENTITLEMENT,
        status,
        product_id: product,
        expires_at: expires,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    if (error) {
      console.log('revenuecat-webhook write failed');
      throw error;
    }
  }

  try {
    const type = (event.type ?? '').toUpperCase();
    if (type === 'TRANSFER') {
      const fromId = event.transferred_from?.find((id) => isUuid(id));
      const toId = event.transferred_to?.find((id) => isUuid(id)) ?? event.app_user_id;
      if (fromId) await write(fromId, 'expired', productId(event), expiresAt(event));
      if (toId) await write(toId, statusFromEvent(event), productId(event), expiresAt(event));
      return json({ ok: true });
    }

    const userId = event.app_user_id ?? '';
    await write(userId, statusFromEvent(event), productId(event), expiresAt(event));
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 500);
  }
});
