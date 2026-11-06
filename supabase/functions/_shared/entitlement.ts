import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * True when the signed-in user has trial, active or grace `ascenda_pro`.
 * `unknown` means the SQL function is not there yet (paste supabase/subscriptions_p1.sql).
 */
export async function userHasAscendaPro(
  client: SupabaseClient
): Promise<boolean | 'unknown'> {
  const { data, error } = await client.rpc('has_ascenda_pro');
  if (error) {
    const detail = `${error.code ?? ''} ${error.message ?? ''}`;
    if (/has_ascenda_pro|PGRST202|42883|does not exist/i.test(detail)) return 'unknown';
    return false;
  }
  return data === true;
}
