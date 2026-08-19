/**
 * lib/data/supabase-source.ts
 *
 * Reads the recipe library out of Supabase and maps rows onto the domain `Cocktail`.
 *
 * SERVER ONLY. Every function returns `null` on any failure — unconfigured project,
 * network error, RLS denial, malformed row — so the repository can fall through to the
 * local seed. Nothing here throws; a database outage degrades the app, it does not break it.
 */

import { getServerClient } from '../supabase/server';
import type { Cocktail } from '../domain/types';

/** Column list kept explicit so a schema change surfaces as a query error, not silent nulls. */
const COLUMNS = `
  id, slug, name, source, source_id, source_url, category, is_alcoholic, is_classic,
  glass, method, ice, garnish, difficulty, flavor_profiles, vibes, lore, lore_source,
  pro_tip, steps, ingredients, canonical_ingredients, optional_ingredients, photo
`;

function rowToCocktail(row: any): Cocktail {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    source: row.source,
    sourceId: row.source_id ?? null,
    sourceUrl: row.source_url ?? null,
    category: row.category ?? null,
    isAlcoholic: row.is_alcoholic ?? true,
    isClassic: row.is_classic ?? false,
    glass: row.glass ?? null,
    method: row.method ?? null,
    ice: row.ice ?? null,
    garnish: row.garnish ?? null,
    difficulty: row.difficulty ?? null,
    flavorProfiles: row.flavor_profiles ?? [],
    vibes: row.vibes ?? [],
    lore: row.lore ?? null,
    loreSource: row.lore_source ?? null,
    proTip: row.pro_tip ?? null,
    steps: row.steps ?? [],
    ingredients: row.ingredients ?? [],
    canonicalIngredients: row.canonical_ingredients ?? [],
    optionalIngredients: row.optional_ingredients ?? [],
    photo: row.photo ?? { url: null, thumb: null, source: null, credit: null, creditUrl: null },
  };
}

/** The inverse mapping, used by the seeding script. */
export function cocktailToRow(recipe: Cocktail): Record<string, unknown> {
  return {
    id: recipe.id,
    slug: recipe.slug,
    name: recipe.name,
    source: recipe.source,
    source_id: recipe.sourceId,
    source_url: recipe.sourceUrl,
    category: recipe.category,
    is_alcoholic: recipe.isAlcoholic,
    is_classic: recipe.isClassic,
    glass: recipe.glass,
    method: recipe.method,
    ice: recipe.ice,
    garnish: recipe.garnish,
    difficulty: recipe.difficulty,
    flavor_profiles: recipe.flavorProfiles,
    vibes: recipe.vibes,
    lore: recipe.lore,
    lore_source: recipe.loreSource,
    pro_tip: recipe.proTip,
    steps: recipe.steps,
    ingredients: recipe.ingredients,
    canonical_ingredients: recipe.canonicalIngredients,
    optional_ingredients: recipe.optionalIngredients,
    photo: recipe.photo,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Fetch the whole library.
 *
 * Paged in 1,000-row batches because PostgREST caps a single response, and the library is
 * expected to outgrow one page as more recipes are added.
 *
 * Returns: every recipe, or `null` if Supabase is unavailable or the table is empty.
 * An empty table is treated as unavailable on purpose — a project that has been migrated
 * but not yet seeded should serve the local library rather than an empty app.
 */
export async function fetchLibrary(): Promise<Cocktail[] | null> {
  const client = getServerClient();
  if (!client) return null;

  try {
    const all: Cocktail[] = [];
    const pageSize = 1000;

    for (let page = 0; ; page++) {
      const { data, error } = await client
        .from('cocktails')
        .select(COLUMNS)
        .order('name', { ascending: true })
        .range(page * pageSize, page * pageSize + pageSize - 1);

      if (error) return null;
      if (!data || data.length === 0) break;

      all.push(...data.map(rowToCocktail));
      if (data.length < pageSize) break;
    }

    return all.length > 0 ? all : null;
  } catch {
    return null;
  }
}

/**
 * Fetch a single recipe by id or slug.
 *
 * Returns: the recipe, or `null` when Supabase is unavailable OR the recipe genuinely
 * does not exist. The repository resolves that ambiguity by consulting the seed; a caller
 * should not treat `null` here as "no such drink".
 */
export async function fetchOne(idOrSlug: string): Promise<Cocktail | null> {
  const client = getServerClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('cocktails')
      .select(COLUMNS)
      .or(`id.eq.${idOrSlug},slug.eq.${idOrSlug}`)
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return rowToCocktail(data);
  } catch {
    return null;
  }
}
