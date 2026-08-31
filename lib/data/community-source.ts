/**
 * lib/data/community-source.ts
 *
 * Reads user-published content — recipes and the public profiles that author them —
 * out of Supabase.
 *
 * SERVER ONLY. Called from `pages/api/lounge.ts` and `getServerSideProps`.
 *
 * THE CONTRACT
 * Unlike the recipe library there is no local fallback — community recipes exist only in
 * the cloud, so "Supabase is unavailable" and "nobody has published anything" are genuinely
 * different states and the UI says different things about them. `available: false` means
 * the first; an empty list with `available: true` means the second.
 *
 * Nothing here throws. Any failure degrades to an unavailable feed.
 */

import { getServerClient } from '../supabase/server';
import {
  normalizeCommunityRecipe,
  normalizePublicProfile,
  type CommunityFeed,
  type CommunityRecipe,
  type PublicProfile,
} from '../domain/community';

/**
 * Explicit column list, plus the author's username through the
 * `custom_recipes_creator_profile_fkey` relationship added in `0004_community.sql`.
 * Without that FK PostgREST cannot resolve the embed and the Lounge has no author name.
 */
const COLUMNS = `
  id, creator_id, name, story, ingredients, instructions, glass, garnish,
  image_url, likes_count, created_at,
  profiles!custom_recipes_creator_profile_fkey (username)
`;

const MAX_LIMIT = 48;

/** The shape returned when the cloud cannot answer. Empty, but explicitly *unavailable*. */
function unavailableFeed(offset: number, limit: number): CommunityFeed {
  return { recipes: [], total: 0, offset, limit, hasMore: false, available: false };
}

export interface FeedQuery {
  /** Already sanitized by `sanitizeSearchTerm`. Empty means no filter. */
  search?: string;
  /** Restrict to one creator — used by profile pages. */
  creatorId?: string;
  limit?: number;
  offset?: number;
}

/**
 * One page of the Lounge feed, newest first.
 *
 * Counting is done by the database (`count: 'exact'`) rather than by fetching everything
 * and measuring it: the old feed pulled 60 rows with no count at all, so it could neither
 * paginate nor say how much more there was.
 *
 * Args:
 *     query: search term, optional creator filter, and the page window.
 *
 * Returns: a `CommunityFeed`. On any failure — unconfigured project, network error, RLS
 * denial — returns `available: false` with an empty list rather than throwing.
 */
export async function fetchCommunityFeed(query: FeedQuery = {}): Promise<CommunityFeed> {
  const limit = Math.min(Math.max(1, query.limit ?? 12), MAX_LIMIT);
  const offset = Math.max(0, query.offset ?? 0);

  const client = getServerClient();
  if (!client) return unavailableFeed(offset, limit);

  try {
    let request = client
      .from('custom_recipes')
      .select(COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (query.creatorId) request = request.eq('creator_id', query.creatorId);

    // Name and story both, so "smoky" finds a drink whose story mentions smoke even when
    // the name doesn't. `name` has a trigram index; `story` is a sequential scan the feed
    // is small enough to afford.
    if (query.search) {
      request = request.or(`name.ilike.%${query.search}%,story.ilike.%${query.search}%`);
    }

    const { data, error, count } = await request;
    if (error || !data) return unavailableFeed(offset, limit);

    const recipes = data.map(row => normalizeCommunityRecipe(row as Record<string, unknown>));
    const total = count ?? offset + recipes.length;

    return {
      recipes,
      total,
      offset,
      limit,
      hasMore: offset + recipes.length < total,
      available: true,
    };
  } catch {
    return unavailableFeed(offset, limit);
  }
}

/**
 * One community recipe by id.
 *
 * Returns: the recipe, or `null` when it does not exist *or* Supabase is unreachable.
 * Callers that need to tell those apart should check `isServerSupabaseConfigured` first;
 * the detail page treats both as "not found", which is the honest thing to show.
 */
export async function fetchCommunityRecipe(id: string): Promise<CommunityRecipe | null> {
  if (!id) return null;

  const client = getServerClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('custom_recipes')
      .select(COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    return normalizeCommunityRecipe(data as Record<string, unknown>);
  } catch {
    // An id that isn't a uuid makes Postgres raise rather than return no rows.
    return null;
  }
}

/**
 * One public profile by user id.
 *
 * Only the columns a stranger may see. `cabinet` is deliberately not among them: the
 * profile page loads it client-side for the owner, and it has no business in the HTML of
 * someone else's page or in a shared link preview.
 *
 * Returns: the profile, or `null` when it does not exist or Supabase is unreachable.
 */
export async function fetchPublicProfile(id: string): Promise<PublicProfile | null> {
  if (!id) return null;

  const client = getServerClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('profiles')
      .select('id, username, bio, avatar_url')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    return normalizePublicProfile(data as Record<string, unknown>);
  } catch {
    return null;
  }
}
