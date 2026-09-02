/**
 * lib/collections.ts
 *
 * The two lists a user keeps: favourites ("go-to") and the wishlist ("must-try").
 *
 * Both live in the `favorites` table, distinguished by `list`, with `unique (user_id,
 * drink_id)` making a drink's status single-valued — so moving a drink from the wishlist to
 * the favourites is one upsert, and nothing ever appears in both sections of a profile.
 * This module owns that fact so no component has to know the table's shape.
 *
 * Every function degrades: a failed write returns `false`, a failed read returns an empty
 * list. Saving a drink is not worth an error boundary.
 *
 * Usage:
 *     const saved = await fetchCollections(userId);
 *     await saveToList(userId, drink.id, 'library', 'wishlist');
 */

import { supabase, isSupabaseConfigured } from './supabase/client';

// ── types ─────────────────────────────────────────────────────────────────────

/** Which of the user's two lists a drink is on. */
export type CollectionList = 'favorite' | 'wishlist';

/** Whether the id points at the curated library or a community recipe. */
export type DrinkKind = 'library' | 'custom';

export interface SavedDrink {
  drinkId: string;
  kind: DrinkKind;
  list: CollectionList;
}

export const LIST_LABELS: Record<CollectionList, string> = {
  favorite: 'Curated Favorites',
  wishlist: 'The Wishlist',
};

// ── pure helpers ──────────────────────────────────────────────────────────────

/**
 * Map a `favorites` row onto `SavedDrink`.
 *
 * Rows predate the `list` column, so a missing or unrecognised value means "favourite" —
 * the default the migration applies, and the only reading that doesn't silently move a
 * user's existing saves into a list they never chose.
 *
 * Returns: a `SavedDrink`, or `null` when the row has no usable `drink_id`.
 */
export function normalizeSavedDrink(row: Record<string, unknown>): SavedDrink | null {
  const drinkId = typeof row.drink_id === 'string' ? row.drink_id.trim() : '';
  if (!drinkId) return null;

  return {
    drinkId,
    kind: row.kind === 'custom' ? 'custom' : 'library',
    list: row.list === 'wishlist' ? 'wishlist' : 'favorite',
  };
}

/** Split saved drinks by list, preserving the order they arrived in. */
export function partitionByList(saved: SavedDrink[]): Record<CollectionList, SavedDrink[]> {
  return {
    favorite: saved.filter(s => s.list === 'favorite'),
    wishlist: saved.filter(s => s.list === 'wishlist'),
  };
}

/** Which list a drink is on, or `null` if it is on neither. */
export function listContaining(saved: SavedDrink[], drinkId: string): CollectionList | null {
  return saved.find(s => s.drinkId === drinkId)?.list ?? null;
}

// ── reads and writes ──────────────────────────────────────────────────────────

/**
 * Every drink this user has saved, on either list.
 *
 * Returns: the saved drinks, or `[]` when Supabase is unconfigured or the read fails.
 * An empty list and a failed read are deliberately the same to the caller: neither is
 * worth interrupting a page for.
 */
export async function fetchCollections(userId: string): Promise<SavedDrink[]> {
  if (!userId || !isSupabaseConfigured) return [];

  try {
    const { data, error } = await supabase
      .from('favorites')
      .select('drink_id, kind, list')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data.map(row => normalizeSavedDrink(row as Record<string, unknown>)).filter(Boolean) as SavedDrink[];
  } catch {
    return [];
  }
}

/**
 * Put a drink on one of the lists, moving it if it is already on the other.
 *
 * Upserts on `(user_id, drink_id)` rather than inserting: a drink the user wishlisted and
 * has now made should become a favourite, not a duplicate row that fails the unique
 * constraint and surfaces as "already saved".
 *
 * Returns: whether the write landed.
 */
export async function saveToList(
  userId: string,
  drinkId: string,
  kind: DrinkKind,
  list: CollectionList
): Promise<boolean> {
  if (!userId || !drinkId || !isSupabaseConfigured) return false;

  try {
    const { error } = await supabase
      .from('favorites')
      .upsert({ user_id: userId, drink_id: drinkId, kind, list }, { onConflict: 'user_id,drink_id' });
    return !error;
  } catch {
    return false;
  }
}

/** Take a drink off both lists. Returns whether the delete landed. */
export async function removeFromCollections(userId: string, drinkId: string): Promise<boolean> {
  if (!userId || !drinkId || !isSupabaseConfigured) return false;

  try {
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('drink_id', drinkId);
    return !error;
  } catch {
    return false;
  }
}
