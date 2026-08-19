/**
 * lib/data/seed-source.ts
 *
 * The local recipe library — the fallback that keeps Liquid Lore useful with no backend.
 *
 * SERVER ONLY. The seed is ~1 MB; shipping it to the browser is precisely the problem
 * this rewrite removes (the previous build bundled a 2 MB recipe module into every page).
 * It is imported by API routes and `getServerSideProps`, never by a component.
 *
 * The file is a static import rather than an `fs.readFile` so Next's output tracing
 * includes it in the deployment bundle without extra configuration.
 */

import seed from '../../data/cocktails.seed.json';
import type { Cocktail } from '../domain/types';

interface SeedFile {
  version: number;
  total: number;
  sources: Record<string, number>;
  cocktails: Cocktail[];
}

const LIBRARY = (seed as unknown as SeedFile).cocktails as Cocktail[];

const BY_ID = new Map<string, Cocktail>();
const BY_SLUG = new Map<string, Cocktail>();
for (const recipe of LIBRARY) {
  BY_ID.set(recipe.id, recipe);
  BY_SLUG.set(recipe.slug, recipe);
}

/** Every recipe in the shipped library. */
export function seedLibrary(): Cocktail[] {
  return LIBRARY;
}

/**
 * Find one recipe by id or slug.
 *
 * Accepting both means a URL can be either `/drink/cdb-11007` or `/drink/negroni`, and
 * old bookmarks keep working after the id scheme changed.
 *
 * Returns: the recipe, or `null` when nothing matches.
 */
export function seedFindOne(idOrSlug: string): Cocktail | null {
  return BY_ID.get(idOrSlug) ?? BY_SLUG.get(idOrSlug) ?? null;
}

export function seedStats() {
  return {
    total: LIBRARY.length,
    classics: LIBRARY.filter(c => c.isClassic).length,
    withLore: LIBRARY.filter(c => c.lore).length,
  };
}
