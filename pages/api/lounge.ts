/**
 * pages/api/lounge.ts
 *
 * The Lounge feed: community recipes, newest first, paged and searchable.
 *
 *   GET /api/lounge
 *   GET /api/lounge?query=mezcal&limit=12&offset=12
 *   GET /api/lounge?creator=<uuid>
 *
 * This route exists so the browser stops issuing its own `custom_recipes` query. That put
 * pagination, search and the author join in a React effect, where the old feed simply
 * `.limit(60)`-ed and showed raw UUIDs when the profile embed came back empty.
 *
 * Never cached at the edge: unlike the recipe library, the feed changes whenever anybody
 * publishes, and a stale Lounge reads as a broken publish.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchCommunityFeed } from '../../lib/data/community-source';
import { sanitizeSearchTerm, type CommunityFeed } from '../../lib/domain/community';

const DEFAULT_LIMIT = 12;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CommunityFeed | { error: string }>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const feed = await fetchCommunityFeed({
    search: sanitizeSearchTerm(first(req.query.query)),
    creatorId: first(req.query.creator),
    limit: toInt(first(req.query.limit), DEFAULT_LIMIT),
    offset: toInt(first(req.query.offset), 0),
  });

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Liquid-Lore-Source', feed.available ? 'supabase' : 'unavailable');

  // 200 even when the cloud is down: `available: false` is a state the feed renders, not
  // an error the client has to handle. Per the error-handling contract in §5 of the plan.
  return res.status(200).json(feed);
}
