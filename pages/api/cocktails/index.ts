/**
 * pages/api/cocktails/index.ts
 *
 * Browse and search the recipe library.
 *
 *   GET /api/cocktails?query=negroni
 *   GET /api/cocktails?classic=true&limit=6
 *   GET /api/cocktails?flavor=bitter&offset=20
 *
 * Returns summaries, never full recipes: a grid needs a name, a photo and some tags, and
 * sending steps and lore for 629 drinks is how the old build ended up shipping a 2 MB
 * payload to the browser.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getLibrary } from '../../../lib/data/repository';
import { searchLibrary, toSummary, flavorVocabulary } from '../../../lib/domain/matching';
import type { CocktailSummary } from '../../../lib/domain/types';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 24;

export interface CocktailsResponse {
  cocktails: CocktailSummary[];
  total: number;
  offset: number;
  limit: number;
  flavors: Array<{ tag: string; count: number }>;
  degraded: boolean;
}

/** Query params arrive as `string | string[]`; take the first value and be done. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function clampLimit(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CocktailsResponse | { error: string }>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data: library, source, notes } = await getLibrary();

  const query = first(req.query.query)?.trim();
  const flavor = first(req.query.flavor)?.trim().toLowerCase();
  const classicOnly = first(req.query.classic) === 'true';
  const limit = clampLimit(first(req.query.limit));
  const offset = Math.max(0, Number.parseInt(first(req.query.offset) ?? '0', 10) || 0);

  let results: CocktailSummary[] = query
    ? searchLibrary(library, query, MAX_LIMIT)
    : library.map(toSummary);

  if (classicOnly) results = results.filter(c => c.isClassic);
  if (flavor) results = results.filter(c => c.flavorProfiles.includes(flavor));

  // Search already ranks by relevance; leave that order alone and only sort browse results.
  if (!query) {
    results.sort((a, b) => {
      if (a.isClassic !== b.isClassic) return a.isClassic ? -1 : 1;
      if (a.hasLore !== b.hasLore) return a.hasLore ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  const total = results.length;
  const page = results.slice(offset, offset + limit);

  // The library changes only on re-seed, so it is safe to cache at the edge; the
  // stale-while-revalidate window keeps a cold instance from stalling a request.
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.setHeader('X-Liquid-Lore-Source', source);

  return res.status(200).json({
    cocktails: page,
    total,
    offset,
    limit,
    flavors: flavorVocabulary(library),
    degraded: notes.length > 0,
  });
}
