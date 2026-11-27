import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * RevenueCat webhook. The only writer of public.subscriptions.
 * Set REVENUECAT_WEBHOOK_SECRET to the same Authorization value as the
 * RevenueCat dashboard. verify_jwt is off: this is not a user JWT.
 * Set REVENUECAT_SECRET_API_KEY (v1 secret) so each event re-reads her current
 * entitlement from RevenueCat (events can arrive late or out of order), and so X6
 * can extend a paid renewal or grant a promotional month. Never logs product payloads or customer info.
 */

const ENTITLEMENT = 'ascenda_pro';
const EXTEND_DAYS = 30;
const MAX_REWARDS_PER_YEAR = 2;
const RC_API = 'https://api.revenuecat.com/v1';
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
  original_transaction_id?: string;
  transaction_id?: string;
};

type Admin = ReturnType<typeof createClient>;

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

// Backup check if an event arrives without entitlement ids. The evoluma_ ids are the live
// products; the ascenda_ ids were created in a stray App Store Connect app and are unused.
const PRODUCT_IDS = ['evoluma_annual', 'evoluma_monthly', 'ascenda_annual', 'ascenda_monthly'];

function coversEntitlement(event: RcEvent): boolean {
  if (event.entitlement_id === ENTITLEMENT) return true;
  if (Array.isArray(event.entitlement_ids) && event.entitlement_ids.includes(ENTITLEMENT)) {
    return true;
  }
  const product = event.new_product_id ?? event.product_id ?? '';
  return PRODUCT_IDS.includes(product);
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

function transactionId(event: RcEvent): string | null {
  const value = event.original_transaction_id ?? event.transaction_id;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function rcPost(path: string, body: Record<string, unknown>): Promise<boolean> {
  const key = (Deno.env.get('REVENUECAT_SECRET_API_KEY') ?? '').trim();
  if (!key) {
    console.log('revenuecat-webhook missing secret api key');
    return false;
  }
  const res = await fetch(`${RC_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.log('revenuecat-webhook rc api failed');
    return false;
  }
  return true;
}

type Snapshot = { status: Status; product: string | null; expires: string | null };

type RcEntitlement = {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  product_identifier?: string;
};

type RcSubscription = {
  period_type?: string;
  billing_issues_detected_at?: string | null;
};

/**
 * Current state of her `ascenda_pro` entitlement, read from RevenueCat rather than
 * from the event. Webhooks can arrive late or out of order (for example an old Test
 * Store purchase expiring after a real one started), so the latest event is not
 * always the truth. Null when the secret key is missing or the call fails; the
 * caller then falls back to the event.
 */
async function fetchSnapshot(userId: string): Promise<Snapshot | null> {
  const key = (Deno.env.get('REVENUECAT_SECRET_API_KEY') ?? '').trim();
  if (!key || !isUuid(userId)) return null;
  try {
    const res = await fetch(`${RC_API}/subscribers/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      console.log('revenuecat-webhook subscriber fetch failed');
      return null;
    }
    const body = (await res.json()) as {
      subscriber?: {
        entitlements?: Record<string, RcEntitlement>;
        subscriptions?: Record<string, RcSubscription>;
      };
    };
    const ent = body.subscriber?.entitlements?.[ENTITLEMENT];
    if (!ent) return { status: 'expired', product: null, expires: null };
    const product = ent.product_identifier ?? null;
    const now = Date.now();
    const expiresMs = ent.expires_date ? Date.parse(ent.expires_date) : Number.POSITIVE_INFINITY;
    const graceMs = ent.grace_period_expires_date ? Date.parse(ent.grace_period_expires_date) : 0;
    const expires = ent.expires_date ?? null;
    if (expiresMs <= now && graceMs <= now) return { status: 'expired', product, expires };
    const sub = product ? body.subscriber?.subscriptions?.[product] : undefined;
    if (expiresMs <= now || sub?.billing_issues_detected_at) {
      return { status: 'grace', product, expires };
    }
    if ((sub?.period_type ?? '').toLowerCase() === 'trial') {
      return { status: 'trial', product, expires };
    }
    return { status: 'active', product, expires };
  } catch {
    console.log('revenuecat-webhook subscriber fetch failed');
    return null;
  }
}

async function rewardsThisYear(admin: Admin, referrerId: string): Promise<number> {
  const start = `${new Date().getUTCFullYear()}-01-01T00:00:00.000Z`;
  const { count, error } = await admin
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_id', referrerId)
    .eq('status', 'rewarded')
    .gte('rewarded_at', start);
  if (error) return MAX_REWARDS_PER_YEAR;
  return count ?? 0;
}

async function tryRewardReferrer(admin: Admin, referrerId: string): Promise<void> {
  if (!isUuid(referrerId)) return;
  const used = await rewardsThisYear(admin, referrerId);
  if (used >= MAX_REWARDS_PER_YEAR) return;

  const { data: queued, error: queuedError } = await admin
    .from('referrals')
    .select('id')
    .eq('referrer_id', referrerId)
    .eq('status', 'subscribed')
    .order('created_at', { ascending: true })
    .limit(MAX_REWARDS_PER_YEAR - used);
  if (queuedError || !queued || queued.length === 0) return;

  const { data: sub } = await admin
    .from('subscriptions')
    .select('status, original_transaction_id')
    .eq('user_id', referrerId)
    .maybeSingle();
  const status = (sub as { status?: string } | null)?.status ?? '';
  if (status === 'trial') return;

  const originalTx = (sub as { original_transaction_id?: string | null } | null)
    ?.original_transaction_id;

  for (const row of queued) {
    let granted = false;
    if (status === 'active' && originalTx) {
      granted = await rcPost(
        `/subscribers/${encodeURIComponent(referrerId)}/subscriptions/${encodeURIComponent(originalTx)}/extend`,
        { extend_by_days: EXTEND_DAYS, extend_reason_code: 1 }
      );
    } else if (status !== 'active') {
      granted = await rcPost(
        `/subscribers/${encodeURIComponent(referrerId)}/entitlements/${ENTITLEMENT}/promotional`,
        { duration: 'monthly' }
      );
    }
    if (!granted) return;
    await admin
      .from('referrals')
      .update({ status: 'rewarded', rewarded_at: new Date().toISOString() })
      .eq('id', (row as { id: string }).id);
  }
}

async function handleReferrals(admin: Admin, event: RcEvent, status: Status): Promise<void> {
  const type = (event.type ?? '').toUpperCase();
  if (type === 'TRANSFER' || type === 'TEMPORARY_ENTITLEMENT_GRANT') return;
  const userId = event.app_user_id ?? '';
  if (!isUuid(userId)) return;

  if (status === 'trial') {
    await admin
      .from('referrals')
      .update({ status: 'trial' })
      .eq('invitee_id', userId)
      .in('status', ['invited']);
    return;
  }

  if (status === 'active') {
    await admin
      .from('referrals')
      .update({ status: 'subscribed' })
      .eq('invitee_id', userId)
      .in('status', ['invited', 'trial']);
    const { data: asInvitee } = await admin
      .from('referrals')
      .select('referrer_id')
      .eq('invitee_id', userId)
      .maybeSingle();
    const referrerId = (asInvitee as { referrer_id?: string } | null)?.referrer_id;
    if (referrerId) await tryRewardReferrer(admin, referrerId);
    await tryRewardReferrer(admin, userId);
  }
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

  async function write(
    userId: string,
    status: Status,
    product: string | null,
    expires: string | null,
    originalTx: string | null
  ) {
    if (!isUuid(userId)) return;
    const row: Record<string, unknown> = {
      user_id: userId,
      entitlement: ENTITLEMENT,
      status,
      product_id: product,
      expires_at: expires,
      updated_at: new Date().toISOString(),
    };
    if (originalTx) row.original_transaction_id = originalTx;
    let { error } = await admin.from('subscriptions').upsert(row, { onConflict: 'user_id' });
    if (error && /original_transaction_id/i.test(error.message ?? '')) {
      delete row.original_transaction_id;
      ({ error } = await admin.from('subscriptions').upsert(row, { onConflict: 'user_id' }));
    }
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
      if (fromId) {
        const from = await fetchSnapshot(fromId);
        await write(
          fromId,
          from?.status ?? 'expired',
          from ? from.product : productId(event),
          from ? from.expires : expiresAt(event),
          transactionId(event)
        );
      }
      if (toId) {
        const to = await fetchSnapshot(toId);
        await write(
          toId,
          to?.status ?? statusFromEvent(event),
          to ? to.product : productId(event),
          to ? to.expires : expiresAt(event),
          transactionId(event)
        );
      }
      return json({ ok: true });
    }

    const userId = event.app_user_id ?? '';
    const snapshot = await fetchSnapshot(userId);
    const status = snapshot?.status ?? statusFromEvent(event);
    await write(
      userId,
      status,
      snapshot ? snapshot.product : productId(event),
      snapshot ? snapshot.expires : expiresAt(event),
      transactionId(event)
    );
    try {
      await handleReferrals(admin, event, status);
    } catch {
      console.log('revenuecat-webhook referral reward skipped');
    }
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 500);
  }
});
