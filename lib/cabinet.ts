/**
 * lib/cabinet.ts
 *
 * Reading, writing and migrating the user's cabinet.
 *
 * The cabinet is the app's one piece of genuinely precious user state, and it lives in two
 * places: localStorage (always, so guests and offline users keep theirs) and `profiles.cabinet`
 * (when signed in, so it follows them between devices). This module owns that duality so no
 * component has to think about it.
 *
 * MIGRATION
 * Cabinets used to hold display strings — "Gin", "Lime Juice", "Angostura Bitters". Matching
 * now works on canonical slugs. `readLocalCabinet` upgrades any legacy entry it finds through
 * the taxonomy resolver and writes the result back, so an existing user's bar survives the
 * change instead of silently matching nothing.
 *
 * Usage:
 *     const cabinet = readLocalCabinet();
 *     await saveCabinet(nextCabinet, session?.user.id ?? null);
 */

import { supabase, isSupabaseConfigured } from './supabase/client';
import { resolveIngredient, getIngredient } from './domain/ingredient-taxonomy';

const STORAGE_KEY = 'liquid-lore-cabinet';
/** Bumped when the stored format changes, so a migration runs exactly once. */
const VERSION_KEY = 'liquid-lore-cabinet-version';
const CURRENT_VERSION = '2';

/**
 * Coerce a stored list into canonical slugs.
 *
 * Handles all three shapes we might find: current slugs, legacy display names, and the
 * occasional unresolvable string. Unresolvable entries are dropped — keeping them would
 * mean a cabinet row that can never match anything and can never be explained to the user.
 */
export function normalizeCabinet(entries: unknown): string[] {
  if (!Array.isArray(entries)) return [];

  const slugs = new Set<string>();
  for (const entry of entries) {
    if (typeof entry !== 'string' || !entry) continue;

    // Already canonical.
    if (getIngredient(entry)) {
      slugs.add(entry);
      continue;
    }

    // Legacy display name — resolve it the same way recipe ingredients are resolved.
    const resolved = resolveIngredient(entry);
    if (resolved) slugs.add(resolved);
  }

  return Array.from(slugs);
}

/** Read the cabinet from this browser, migrating the legacy format in place if needed. */
export function readLocalCabinet(): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    const normalized = normalizeCabinet(parsed);

    const needsUpgrade = window.localStorage.getItem(VERSION_KEY) !== CURRENT_VERSION;
    if (needsUpgrade) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      window.localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
    }

    return normalized;
  } catch {
    // Corrupt JSON in localStorage shouldn't cost the user their session.
    return [];
  }
}

export function writeLocalCabinet(cabinet: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cabinet));
    window.localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
  } catch {
    // Private browsing or a full quota. The in-memory cabinet still works for this session.
  }
}

/**
 * Pull the signed-in user's cabinet from Supabase.
 *
 * Returns: the cloud cabinet, or `null` if there isn't one (new account, offline, or
 * Supabase unconfigured) — distinct from `[]`, which is a deliberately emptied cabinet.
 */
export async function fetchRemoteCabinet(userId: string): Promise<string[] | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('cabinet')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data || !Array.isArray(data.cabinet)) return null;
    return normalizeCabinet(data.cabinet);
  } catch {
    return null;
  }
}

/**
 * Persist the cabinet locally, and to the cloud when signed in.
 *
 * Local write happens first and unconditionally: the network is the unreliable half, and
 * a user who loses connectivity mid-edit should still have their bar when they come back.
 *
 * Returns: whether the cloud write succeeded. `false` with a `userId` means the change is
 * local-only for now — worth surfacing rather than pretending it synced.
 */
export async function saveCabinet(cabinet: string[], userId: string | null): Promise<boolean> {
  writeLocalCabinet(cabinet);

  if (!userId || !isSupabaseConfigured) return false;

  try {
    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      cabinet,
      updated_at: new Date().toISOString(),
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Reconcile the local and cloud cabinets at sign-in.
 *
 * Unions them rather than picking a winner. Someone who stocked their bar as a guest and
 * then signed in should not lose that work, and someone signing in on a new device should
 * not have their cloud cabinet overwritten by an empty local one — a union is the only
 * option that is never destructive.
 */
export function mergeCabinets(local: string[], remote: string[] | null): string[] {
  if (!remote) return local;
  return Array.from(new Set([...remote, ...local]));
}
