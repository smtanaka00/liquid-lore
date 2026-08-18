/**
 * lib/supabase/server.ts
 *
 * Server-only Supabase clients, for API routes and `getServerSideProps`.
 *
 * Two flavours:
 *   - `getServerClient()`  — anon key, Row Level Security enforced. The default.
 *   - `getAdminClient()`   — service-role key, RLS bypassed. Seeding and trusted writes only.
 *
 * Both return `null` rather than throwing when their credentials are absent, so the data
 * layer can fall through to the local seed instead of failing the request.
 *
 * SAFETY: this module must never be imported from a component. The service-role key is
 * read from a non-`NEXT_PUBLIC_` variable, so it is undefined in the browser bundle; the
 * guard below turns an accidental client import into a loud error rather than a silent leak.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function assertServerOnly(caller: string): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      `${caller} was called in the browser. lib/supabase/server.ts is server-only — ` +
      `use lib/supabase/client.ts from components.`
    );
  }
}

let cachedServer: SupabaseClient | null = null;
let cachedAdmin: SupabaseClient | null = null;

/**
 * Anon-key client for server-side reads.
 *
 * Returns: a `SupabaseClient`, or `null` if the project is not configured.
 */
export function getServerClient(): SupabaseClient | null {
  assertServerOnly('getServerClient');
  if (!supabaseUrl || !anonKey) return null;
  if (!cachedServer) {
    cachedServer = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedServer;
}

/**
 * Service-role client. Bypasses RLS entirely — use only for trusted, non-user-driven
 * work such as `npm run db:seed`.
 *
 * Returns: a `SupabaseClient`, or `null` if `SUPABASE_SERVICE_ROLE_KEY` is unset.
 */
export function getAdminClient(): SupabaseClient | null {
  assertServerOnly('getAdminClient');
  if (!supabaseUrl || !serviceRoleKey) return null;
  if (!cachedAdmin) {
    cachedAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedAdmin;
}

/** Whether server-side cloud reads are possible at all. */
export const isServerSupabaseConfigured = Boolean(supabaseUrl && anonKey);
