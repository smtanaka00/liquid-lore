/**
 * lib/domain/community.ts
 *
 * The shape of a user-published recipe, and the pure functions that turn an untrusted
 * `custom_recipes` row into it.
 *
 * Library recipes come out of a build script that validates them; community recipes come
 * out of a form and can be edited by hand in the Supabase dashboard. Every field here is
 * therefore treated as "might be the wrong type" and coerced, so one malformed row renders
 * as a thin card instead of crashing the Lounge for everybody.
 *
 * Pure and dependency-free: no Supabase, no React. Server and browser both import it.
 *
 * Usage:
 *     const recipe = normalizeCommunityRecipe(row);
 *     const term   = sanitizeSearchTerm(req.query.query);
 */

// ── types ─────────────────────────────────────────────────────────────────────

export interface CommunityIngredient {
  name: string;
  measure: string;
}

/**
 * A recipe published through the Creator Studio.
 *
 * `author` is resolved at normalization time and is never a raw UUID: the Lounge used to
 * print `creator_id` when the profile join was missing, which read as a bug to users.
 * `authorId` keeps the UUID available for links without ever putting it on screen.
 */
export interface CommunityRecipe {
  id: string;
  name: string;
  story: string | null;
  ingredients: CommunityIngredient[];
  instructions: string[];
  glass: string | null;
  garnish: string | null;
  imageUrl: string | null;
  likesCount: number;
  authorId: string | null;
  author: string;
  createdAt: string | null;
}

/** What the Lounge feed endpoint returns. */
export interface CommunityFeed {
  recipes: CommunityRecipe[];
  /** Rows matching the query across all pages, not just this one. */
  total: number;
  offset: number;
  limit: number;
  /** True when another page exists — the UI shows "Load more" off this, not off arithmetic. */
  hasMore: boolean;
  /** False when Supabase is unconfigured or unreachable; the feed is empty *because* of that. */
  available: boolean;
}

/** Shown when a recipe's profile row is missing or has no username. */
export const ANONYMOUS_AUTHOR = 'a mixologist';

// ── coercion helpers ──────────────────────────────────────────────────────────

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(item => item.length > 0);
}

/**
 * `ingredients` is jsonb, so it can legally hold anything. Rows are kept only when they
 * have a name — a measure without an ingredient is not a line a reader can act on.
 */
function asIngredients(value: unknown): CommunityIngredient[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return [];
    const name = asText((entry as Record<string, unknown>).name);
    if (!name) return [];
    return [{ name, measure: asText((entry as Record<string, unknown>).measure) ?? '' }];
  });
}

/**
 * Resolve the display name from whatever the profile join returned.
 *
 * PostgREST returns an embedded one-to-one either as an object or, depending on how it
 * infers the relationship, as a single-element array. Handle both rather than betting on
 * one and printing "a mixologist" for every recipe if the inference changes.
 */
export function resolveAuthor(profiles: unknown): string {
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  if (!profile || typeof profile !== 'object') return ANONYMOUS_AUTHOR;
  return asText((profile as Record<string, unknown>).username) ?? ANONYMOUS_AUTHOR;
}

// ── normalization ─────────────────────────────────────────────────────────────

/**
 * Map one `custom_recipes` row onto `CommunityRecipe`.
 *
 * Args:
 *     row: a row from `custom_recipes`, optionally with `profiles` embedded.
 *
 * Returns: a fully-populated `CommunityRecipe`. Never throws and never returns null —
 * a row missing every optional field still yields a renderable recipe with an empty
 * ingredient list. Only `id` and `name` are load-bearing, and both fall back to a
 * placeholder rather than `undefined` reaching the UI.
 */
export function normalizeCommunityRecipe(row: Record<string, unknown>): CommunityRecipe {
  return {
    id: asText(row.id) ?? '',
    name: asText(row.name) ?? 'Untitled creation',
    story: asText(row.story),
    ingredients: asIngredients(row.ingredients),
    instructions: asStringArray(row.instructions),
    glass: asText(row.glass),
    garnish: asText(row.garnish),
    imageUrl: asText(row.image_url),
    likesCount: Number.isFinite(row.likes_count) ? Math.max(0, Number(row.likes_count)) : 0,
    authorId: asText(row.creator_id),
    author: resolveAuthor(row.profiles),
    createdAt: asText(row.created_at),
  };
}

// ── search ────────────────────────────────────────────────────────────────────

/** Longer than any drink name a user should be typing; bounds the query we send on. */
const MAX_SEARCH_LENGTH = 80;

/**
 * Clean a user-typed search term for use in a PostgREST `or=(...)` filter.
 *
 * PostgREST parses that filter as a comma-separated list with parentheses for grouping and
 * `*` as the wildcard, so those characters in raw input change the *structure* of the
 * filter rather than being matched literally. They are stripped, not escaped: a drink name
 * containing them is not a search anyone is making, and dropping them keeps the filter we
 * build unambiguous.
 *
 * Args:
 *     raw: whatever arrived on the query string.
 *
 * Returns: a safe term, or `''` when there is nothing searchable — callers treat empty as
 * "no filter" and return the unfiltered feed.
 */
export function sanitizeSearchTerm(raw: unknown): string {
  if (typeof raw !== 'string') return '';

  return raw
    .replace(/[,()*\\%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SEARCH_LENGTH);
}
