/**
 * lib/domain/matching.ts
 *
 * The "What Can I Make?" engine. Pure functions over the domain types — no I/O, no React,
 * no Supabase — so it can be unit-tested directly and run on either side of the wire.
 *
 * WHAT WAS WRONG BEFORE
 * The old engine compared a cabinet of display strings against recipe ingredient strings
 * with a pair of regexes built at runtime, per ingredient, per recipe. Two problems:
 *
 *   1. No shared vocabulary. Recipes said "Tito's"; cabinets said "Vodka". A cabinet
 *      holding all 54 offered ingredients matched 27 of 1,050 recipes.
 *   2. Everything blocked. Ice and a lemon twist counted against a match exactly as much
 *      as the base spirit.
 *
 * Both are fixed upstream of this file — the taxonomy gives every ingredient one canonical
 * slug and marks pantry items — which lets matching here reduce to set containment.
 *
 * Usage:
 *     import { matchCabinet } from './matching';
 *     const result = matchCabinet(library, ['gin', 'campari', 'sweet-vermouth']);
 *     result.ready.map(r => r.name)   // -> ['Negroni', 'Americano', …]
 */

import { expandCabinet, labelFor, categoryFor, getIngredient } from './ingredient-taxonomy';
import type { CabinetMatch, Cocktail, CocktailSummary, MaximizerSuggestion, NearMiss } from './types';

/** Recipes missing this many ingredients or fewer show up as "reachable". */
const REACHABLE_LIMIT = 3;
/** How many purchase suggestions the Maximizer returns. */
const MAXIMIZER_COUNT = 5;

export function toSummary(recipe: Cocktail): CocktailSummary {
  return {
    id: recipe.id,
    slug: recipe.slug,
    name: recipe.name,
    image: recipe.photo.thumb ?? recipe.photo.url,
    glass: recipe.glass,
    category: recipe.category,
    isClassic: recipe.isClassic,
    hasLore: Boolean(recipe.lore),
    flavorProfiles: recipe.flavorProfiles,
    vibes: recipe.vibes,
    canonicalIngredients: recipe.canonicalIngredients,
  };
}

/**
 * Ingredients a recipe needs that the cabinet doesn't cover.
 *
 * `cabinet` must already be expanded (see `expandCabinet`) — this is called once per
 * recipe, so the closure is computed by the caller rather than re-derived here.
 */
function missingFrom(recipe: Cocktail, cabinet: Set<string>): string[] {
  const missing: string[] = [];
  for (const slug of recipe.canonicalIngredients) {
    if (!cabinet.has(slug)) missing.push(slug);
  }
  return missing;
}

/**
 * Sort recipes so the most rewarding ones surface first: classics, then drinks with a
 * real story, then alphabetically for a stable order across reloads.
 */
function byInterest(a: CocktailSummary, b: CocktailSummary): number {
  if (a.isClassic !== b.isClassic) return a.isClassic ? -1 : 1;
  if (a.hasLore !== b.hasLore) return a.hasLore ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/**
 * Match a cabinet against the library.
 *
 * Args:
 *   library — every recipe to consider.
 *   cabinetSlugs — canonical ingredient slugs the user owns. Display strings will not work.
 *
 * Returns: `CabinetMatch` with ready / nearMisses / reachable / maximizers. An empty
 * cabinet yields empty lists rather than an error — the caller decides what to render.
 */
export function matchCabinet(library: Cocktail[], cabinetSlugs: string[]): CabinetMatch {
  const empty: CabinetMatch = { ready: [], nearMisses: [], reachable: [], maximizers: [] };
  if (!library.length || !cabinetSlugs.length) return empty;

  const cabinet = expandCabinet(cabinetSlugs);

  const ready: CocktailSummary[] = [];
  const nearMisses: NearMiss[] = [];
  const reachable: NearMiss[] = [];

  // slug -> recipes that this single purchase would complete. Only populated from
  // one-ingredient-away recipes, because that is what "buy this next" actually means.
  const unlockedBy = new Map<string, Cocktail[]>();

  for (const recipe of library) {
    // A recipe with no resolvable required ingredients can't be reasoned about; showing
    // it as "ready" for any cabinet would be a lie.
    if (recipe.canonicalIngredients.length === 0) continue;

    const missing = missingFrom(recipe, cabinet);

    if (missing.length === 0) {
      ready.push(toSummary(recipe));
      continue;
    }

    if (missing.length === 1) {
      nearMisses.push({ recipe: toSummary(recipe), missing });
      const slug = missing[0];
      const list = unlockedBy.get(slug) ?? [];
      list.push(recipe);
      unlockedBy.set(slug, list);
      continue;
    }

    if (missing.length <= REACHABLE_LIMIT) {
      reachable.push({ recipe: toSummary(recipe), missing });
    }
  }

  ready.sort(byInterest);
  nearMisses.sort((a, b) => byInterest(a.recipe, b.recipe));
  reachable.sort((a, b) => a.missing.length - b.missing.length || byInterest(a.recipe, b.recipe));

  return {
    ready,
    nearMisses,
    reachable,
    maximizers: buildMaximizers(unlockedBy),
  };
}

/**
 * Rank single purchases by how many recipes each one unlocks.
 *
 * Counts only recipes that the purchase completes outright. A suggestion that merely
 * moves a drink from "three missing" to "two missing" isn't something worth a trip to
 * the shop, and counting those made the old suggestions read as noise.
 */
function buildMaximizers(unlockedBy: Map<string, Cocktail[]>): MaximizerSuggestion[] {
  return Array.from(unlockedBy.entries())
    .map(([slug, recipes]) => ({
      slug,
      label: labelFor(slug),
      category: categoryFor(slug),
      unlocks: recipes.length,
      examples: recipes
        .slice()
        .sort(byInterest as any)
        .slice(0, 3)
        .map(r => r.name),
    }))
    .sort((a, b) => b.unlocks - a.unlocks || a.label.localeCompare(b.label))
    .slice(0, MAXIMIZER_COUNT);
}

/**
 * Free-text search over recipe names and ingredients.
 *
 * Ranking is deliberate rather than alphabetical: an exact name match must beat a recipe
 * that merely lists the query as an ingredient, or searching "Negroni" buries the Negroni.
 */
export function searchLibrary(library: Cocktail[], query: string, limit = 25): CocktailSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: Array<{ recipe: Cocktail; score: number }> = [];

  for (const recipe of library) {
    const name = recipe.name.toLowerCase();
    let score = 0;

    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else if (recipe.ingredients.some(i => i.name.toLowerCase().includes(q))) score = 30;
    else if (recipe.canonicalIngredients.some(s => s.includes(q))) score = 25;
    else if (recipe.flavorProfiles.some(f => f === q) || recipe.vibes.some(v => v.toLowerCase() === q)) score = 20;

    if (score === 0) continue;

    // Nudge classics and drinks with a real story up within a score band.
    if (recipe.isClassic) score += 5;
    if (recipe.lore) score += 3;

    scored.push({ recipe, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name))
    .slice(0, limit)
    .map(s => toSummary(s.recipe));
}

/**
 * Every flavour tag actually present in the library, with counts.
 *
 * The old UI hardcoded four filter chips — one of which ("Strong") matched zero recipes,
 * because it was never reconciled with the vocabulary in the data. Deriving the chips
 * from the library makes that class of bug impossible.
 */
export function flavorVocabulary(library: Cocktail[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const recipe of library) {
    for (const tag of recipe.flavorProfiles) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

/** Ingredient slugs the library actually uses, so the cabinet never offers a dead option. */
export function usedIngredientSlugs(library: Cocktail[]): Set<string> {
  const used = new Set<string>();
  for (const recipe of library) {
    for (const slug of recipe.canonicalIngredients) used.add(slug);
    for (const slug of recipe.optionalIngredients) used.add(slug);
  }
  return used;
}

/**
 * How many recipes each ingredient appears in — used to order the cabinet picker so the
 * most useful bottles are the easiest to find.
 */
export function ingredientFrequency(library: Cocktail[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const recipe of library) {
    for (const slug of recipe.canonicalIngredients) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  return counts;
}

/** True when the slug is a real entry in the taxonomy. Used to sanitise stored cabinets. */
export function isKnownIngredient(slug: string): boolean {
  return getIngredient(slug) !== undefined;
}
