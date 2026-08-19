/**
 * pages/api/ingredients.ts
 *
 * The stockable ingredient vocabulary for the cabinet screen.
 *
 *   GET /api/ingredients
 *   -> { groups: [{ category, items: [{ slug, label, recipes }] }], essentials: [...] }
 *
 * Two things make this better than the list the old build derived from raw recipe strings:
 * every entry is a canonical slug the matcher understands, and `recipes` is the real count
 * from the current library — so the picker can be ordered by usefulness and never offers a
 * bottle that unlocks nothing.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getLibrary } from '../../lib/data/repository';
import { ingredientFrequency, usedIngredientSlugs } from '../../lib/domain/matching';
import { stockableByCategory, essentialIngredients } from '../../lib/domain/ingredient-taxonomy';
import type { IngredientCategory } from '../../lib/domain/types';

export interface IngredientOption {
  slug: string;
  label: string;
  category: IngredientCategory;
  /** Recipes in the current library that require this ingredient. */
  recipes: number;
}

export interface IngredientsResponse {
  groups: Array<{ category: IngredientCategory; items: IngredientOption[] }>;
  essentials: IngredientOption[];
  degraded: boolean;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<IngredientsResponse | { error: string }>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data: library, source, notes } = await getLibrary();
  const frequency = ingredientFrequency(library);
  const used = usedIngredientSlugs(library);

  const groups = stockableByCategory()
    .map(group => ({
      category: group.category,
      items: group.items
        // Hide vocabulary the current library never calls for — a cabinet slot that can
        // never unlock a drink is a dead control.
        .filter(node => used.has(node.slug))
        .map(node => ({
          slug: node.slug,
          label: node.label,
          category: node.category,
          recipes: frequency.get(node.slug) ?? 0,
        }))
        .sort((a, b) => b.recipes - a.recipes || a.label.localeCompare(b.label)),
    }))
    .filter(group => group.items.length > 0);

  const essentials = essentialIngredients().map(node => ({
    slug: node.slug,
    label: node.label,
    category: node.category,
    recipes: frequency.get(node.slug) ?? 0,
  })).sort((a, b) => b.recipes - a.recipes);

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.setHeader('X-Liquid-Lore-Source', source);

  return res.status(200).json({ groups, essentials, degraded: notes.length > 0 });
}
