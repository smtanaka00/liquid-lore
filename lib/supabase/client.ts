/**
 * lib/supabase/client.ts
 *
 * The browser-side Supabase client, plus the flag that tells the rest of the app whether
 * cloud features are available at all.
 *
 * Liquid Lore must run with no backend configured — guest mode, the local recipe seed and
 * a localStorage cabinet are a supported way to use the product, not a broken state. So
 * this module never throws on import: with no credentials it builds a client against a
 * placeholder origin and reports `isSupabaseConfigured === false`, and callers skip cloud
 * work rather than crashing.
 *
 * Usage:
 *     import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
 *     if (isSupabaseConfigured) await supabase.auth.getSession();
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** True only when both public credentials are present. Gate every cloud call on this. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// createClient() validates its URL and throws on an empty string, which would take down
// the build and every page render. The placeholder keeps module load total; it is never
// reached because callers check isSupabaseConfigured first.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: isSupabaseConfigured,
      autoRefreshToken: isSupabaseConfigured,
      detectSessionInUrl: isSupabaseConfigured,
    },
  }
);
