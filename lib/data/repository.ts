/**
 * lib/data/repository.ts
 *
 * The single door onto recipe data. Supabase first, the local seed when Supabase can't
 * answer — and it always says which one it used.
 *
 * SERVER ONLY. Called from `pages/api/*` and `getServerSideProps`.
 *
 * THE CONTRACT
 * Every function returns `DataResult<T>` and never throws. `source` records where the
 * data came from and `notes` explains any degradation, so the UI can show "offline
 * library" instead of quietly serving stale content as though it were live. That is the
 * "tools degrade, the loop decides" rule from PROJECT_STRUCTURE.md applied to data access.
 *
 * CACHING
 * The library is immutable between deploys and re-reading it per request would mean a
 * ~630-row query on every page view, so it is held in module memory behind a TTL. Each
 * serverless instance warms its own copy; the TTL bounds how long a re-seed takes to
 * appear.
 */

import { fetchLibrary, fetchOne } from './supabase-source';
import { seedLibrary, seedFindOne } from './seed-source';
import type { Cocktail, DataResult, DataSourceName } from '../domain/types';

/** How long a fetched library stays warm. Long enough to matter, short enough that a
 *  `npm run db:seed` shows up without a redeploy. */
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  library: Cocktail[];
  source: DataSourceName;
  expiresAt: number;
}

let cache: CacheEntry | null = null;

/** Drop the cache. Exposed for tests and for a future revalidation webhook. */
export function invalidateLibraryCache(): void {
  cache = null;
}

/**
 * The whole recipe library.
 *
 * Returns: `DataResult<Cocktail[]>`. `data` is never empty — the seed is always present —
 * so callers do not need an empty-library branch.
 */
export async function getLibrary(): Promise<DataResult<Cocktail[]>> {
  const now = Date.now();

  if (cache && cache.expiresAt > now) {
    return {
      data: cache.library,
      source: cache.source,
      notes: cache.source === 'seed' ? ['Serving the bundled library; Supabase is unavailable.'] : [],
    };
  }

  const remote = await fetchLibrary();

  if (remote && remote.length > 0) {
    cache = { library: remote, source: 'supabase', expiresAt: now + CACHE_TTL_MS };
    return { data: remote, source: 'supabase', notes: [] };
  }

  const local = seedLibrary();
  // Cached with the same TTL: without it, a Supabase outage would mean a failed round
  // trip on every single request while it lasts.
  cache = { library: local, source: 'seed', expiresAt: now + CACHE_TTL_MS };

  return {
    data: local,
    source: 'seed',
    notes: ['Serving the bundled library; Supabase is unconfigured or unreachable.'],
  };
}

/**
 * One recipe by id or slug.
 *
 * Falls back to the seed both when Supabase is down and when Supabase simply doesn't have
 * the recipe — a project seeded from an older library should still resolve links that the
 * current build knows about.
 *
 * Returns: `DataResult<Cocktail | null>`; `data` is `null` only when neither source has it.
 */
export async function getCocktail(idOrSlug: string): Promise<DataResult<Cocktail | null>> {
  if (!idOrSlug) return { data: null, source: 'seed', notes: ['No identifier supplied.'] };

  const remote = await fetchOne(idOrSlug);
  if (remote) return { data: remote, source: 'supabase', notes: [] };

  const local = seedFindOne(idOrSlug);
  if (local) {
    return {
      data: local,
      source: 'seed',
      notes: ['Served from the bundled library.'],
    };
  }

  return { data: null, source: 'seed', notes: [`No recipe matches "${idOrSlug}".`] };
}
