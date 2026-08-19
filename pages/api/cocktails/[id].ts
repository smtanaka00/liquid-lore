/**
 * pages/api/cocktails/[id].ts
 *
 * One recipe in full, by id or slug.
 *
 *   GET /api/cocktails/negroni
 *   GET /api/cocktails/cdb-11007
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCocktail } from '../../../lib/data/repository';
import type { Cocktail } from '../../../lib/domain/types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ cocktail: Cocktail; degraded: boolean } | { error: string }>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing recipe id' });

  const { data, source, notes } = await getCocktail(id);

  if (!data) {
    // A genuine 404 — both Supabase and the bundled library were consulted.
    return res.status(404).json({ error: `No recipe matches "${id}"` });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.setHeader('X-Liquid-Lore-Source', source);

  return res.status(200).json({ cocktail: data, degraded: notes.length > 0 });
}
