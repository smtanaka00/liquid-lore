/**
 * pages/api/cabinet/match.ts
 *
 * The "What Can I Make?" endpoint.
 *
 *   POST /api/cabinet/match   { "cabinet": ["gin", "campari", "sweet-vermouth"] }
 *   -> { ready: [...], nearMisses: [...], reachable: [...], maximizers: [...] }
 *
 * POST rather than GET because a well-stocked cabinet is longer than a URL should be, and
 * a cabinet is arguably personal data that has no business sitting in access logs.
 *
 * The match itself runs here rather than in the browser so the 1 MB library never crosses
 * the wire — the client sends a list of slugs and receives only what it can make.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getLibrary } from '../../../lib/data/repository';
import { matchCabinet } from '../../../lib/domain/matching';
import { getIngredient, resolveIngredient } from '../../../lib/domain/ingredient-taxonomy';
import type { CabinetMatch } from '../../../lib/domain/types';

/** Guards against a pathological or hostile payload. No real cabinet is this big. */
const MAX_CABINET = 400;

export interface MatchResponse extends CabinetMatch {
  cabinetSize: number;
  /** Slugs sent by the client that aren't in the taxonomy — surfaced so a stale cabinet
   *  in localStorage is visible rather than silently degrading every match. */
  unknown: string[];
  degraded: boolean;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MatchResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  const raw = body?.cabinet;

  if (!Array.isArray(raw)) {
    return res.status(400).json({ error: 'Body must be { cabinet: string[] }' });
  }

  const cabinet = Array.from(
    new Set(raw.filter((s: unknown): s is string => typeof s === 'string' && s.length > 0))
  ).slice(0, MAX_CABINET);

  // lib/cabinet.ts migrates legacy display names to slugs before they get here, but a
  // stale tab or an old cached bundle can still POST "Sweet Vermouth". Resolving as a
  // fallback means that user sees their bar instead of an inexplicably empty app.
  const known: string[] = [];
  const unknown: string[] = [];

  for (const entry of cabinet) {
    if (getIngredient(entry)) {
      known.push(entry);
      continue;
    }
    const resolved = resolveIngredient(entry);
    if (resolved) known.push(resolved);
    else unknown.push(entry);
  }

  const { data: library, source, notes } = await getLibrary();
  const match = matchCabinet(library, Array.from(new Set(known)));

  // A cabinet is user state, so this response must never be cached by a shared proxy.
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Liquid-Lore-Source', source);

  return res.status(200).json({
    ...match,
    cabinetSize: known.length,
    unknown,
    degraded: notes.length > 0,
  });
}

function safeParse(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
