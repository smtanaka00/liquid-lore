/**
 * lib/api-client.ts
 *
 * The browser's only route to recipe data. Components call these; they never import the
 * repository, the seed, or `@supabase/supabase-js` for recipes.
 *
 * Keeping this boundary is what stops the 1 MB library from creeping back into the client
 * bundle — an accidental `import seed from '.../cocktails.seed.json'` in a component would
 * undo the whole rewrite, so there is exactly one sanctioned path and this is it.
 *
 * Every function degrades rather than throwing: a failed request returns an empty result
 * so a page renders an empty state instead of a blank screen or an error boundary.
 *
 * Usage:
 *     const { cocktails } = await fetchCocktails({ classic: true, limit: 6 });
 *     const match = await fetchCabinetMatch(['gin', 'campari']);
 */

import type { CabinetMatch, Cocktail, CocktailSummary, IngredientCategory } from './domain/types';
import type { CommunityFeed } from './domain/community';

export interface CocktailListResult {
  cocktails: CocktailSummary[];
  total: number;
  flavors: Array<{ tag: string; count: number }>;
  degraded: boolean;
}

export interface IngredientOption {
  slug: string;
  label: string;
  category: IngredientCategory;
  recipes: number;
}

export interface IngredientCatalogue {
  groups: Array<{ category: IngredientCategory; items: IngredientOption[] }>;
  essentials: IngredientOption[];
  degraded: boolean;
}

export interface CabinetMatchResult extends CabinetMatch {
  cabinetSize: number;
  unknown: string[];
  degraded: boolean;
}

const EMPTY_LIST: CocktailListResult = { cocktails: [], total: 0, flavors: [], degraded: true };
const EMPTY_MATCH: CabinetMatchResult = {
  ready: [], nearMisses: [], reachable: [], maximizers: [],
  cabinetSize: 0, unknown: [], degraded: true,
};

async function getJson<T>(url: string, fallback: T, init?: RequestInit): Promise<T> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    // Offline, aborted, or a malformed body. The caller gets a usable empty value.
    return fallback;
  }
}

export interface CocktailQuery {
  query?: string;
  flavor?: string | null;
  classic?: boolean;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export async function fetchCocktails(options: CocktailQuery = {}): Promise<CocktailListResult> {
  const params = new URLSearchParams();
  if (options.query) params.set('query', options.query);
  if (options.flavor) params.set('flavor', options.flavor);
  if (options.classic) params.set('classic', 'true');
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));

  return getJson(`/api/cocktails?${params}`, EMPTY_LIST, { signal: options.signal });
}

/** Returns `null` when the recipe doesn't exist or the request failed. */
export async function fetchCocktail(idOrSlug: string): Promise<Cocktail | null> {
  const result = await getJson<{ cocktail: Cocktail } | null>(
    `/api/cocktails/${encodeURIComponent(idOrSlug)}`,
    null
  );
  return result?.cocktail ?? null;
}

export async function fetchIngredients(): Promise<IngredientCatalogue> {
  return getJson('/api/ingredients', { groups: [], essentials: [], degraded: true });
}

export async function fetchCabinetMatch(
  cabinet: string[],
  signal?: AbortSignal
): Promise<CabinetMatchResult> {
  if (cabinet.length === 0) return { ...EMPTY_MATCH, degraded: false };

  return getJson('/api/cabinet/match', EMPTY_MATCH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cabinet }),
    signal,
  });
}

export interface LoungeQuery {
  query?: string;
  creator?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

/**
 * One page of the community feed.
 *
 * A failed request degrades to `available: false`, which the Lounge already renders as
 * "the Lounge is offline" — the same state an unconfigured Supabase produces, and the
 * same thing is true from the user's side either way.
 */
export async function fetchLoungeFeed(options: LoungeQuery = {}): Promise<CommunityFeed> {
  const params = new URLSearchParams();
  if (options.query) params.set('query', options.query);
  if (options.creator) params.set('creator', options.creator);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));

  const empty: CommunityFeed = {
    recipes: [], total: 0, offset: options.offset ?? 0, limit: options.limit ?? 12,
    hasMore: false, available: false,
  };

  return getJson(`/api/lounge?${params}`, empty, { signal: options.signal });
}
