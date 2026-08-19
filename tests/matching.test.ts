/**
 * tests/matching.test.ts
 *
 * Two layers of coverage:
 *   - unit tests over hand-built fixtures, so each rule (pantry, hierarchy, near miss,
 *     maximizer ranking) is pinned independently;
 *   - a regression test against the real shipped library, asserting the headline number
 *     that motivated this rewrite. The old engine let a cabinet holding every offered
 *     ingredient make 2.6% of the library. If that ever regresses, this fails.
 */

import { describe, it, expect } from 'vitest';
import { matchCabinet, searchLibrary, flavorVocabulary, ingredientFrequency } from '../lib/domain/matching';
import { allIngredients } from '../lib/domain/ingredient-taxonomy';
import type { Cocktail } from '../lib/domain/types';
import seed from '../data/cocktails.seed.json';

const library = (seed as any).cocktails as Cocktail[];

/** Minimal recipe fixture — only the fields matching actually reads. */
function recipe(partial: Partial<Cocktail> & { name: string; canonicalIngredients: string[] }): Cocktail {
  return {
    id: `test-${partial.name}`,
    slug: partial.name.toLowerCase().replace(/\s+/g, '-'),
    source: 'thecocktaildb',
    sourceId: null,
    sourceUrl: null,
    category: 'Cocktail',
    isAlcoholic: true,
    isClassic: false,
    glass: null,
    method: null,
    ice: null,
    garnish: null,
    difficulty: 'easy',
    flavorProfiles: [],
    vibes: [],
    lore: null,
    loreSource: null,
    proTip: null,
    steps: [],
    ingredients: [],
    optionalIngredients: [],
    photo: { url: null, thumb: null, source: null, credit: null, creditUrl: null },
    ...partial,
  } as Cocktail;
}

describe('matchCabinet — basics', () => {
  const negroni = recipe({ name: 'Negroni', canonicalIngredients: ['gin', 'campari', 'sweet-vermouth'] });
  const martini = recipe({ name: 'Martini', canonicalIngredients: ['gin', 'dry-vermouth'] });
  const daiquiri = recipe({ name: 'Daiquiri', canonicalIngredients: ['white-rum', 'lime-juice', 'simple-syrup'] });
  const fixture = [negroni, martini, daiquiri];

  it('reports a recipe as ready when every ingredient is stocked', () => {
    const result = matchCabinet(fixture, ['gin', 'campari', 'sweet-vermouth']);
    expect(result.ready.map(r => r.name)).toEqual(['Negroni']);
  });

  it('reports a recipe one ingredient short as a near miss, naming what is missing', () => {
    // Gin + Campari leaves the Negroni short of sweet vermouth (and the Martini short of
    // dry vermouth), so assert on the Negroni rather than on the size of the list.
    const result = matchCabinet(fixture, ['gin', 'campari']);
    const near = result.nearMisses.find(n => n.recipe.name === 'Negroni');
    expect(near).toBeDefined();
    expect(near!.missing).toEqual(['sweet-vermouth']);
    expect(result.nearMisses.map(n => n.recipe.name)).not.toContain('Daiquiri');
  });

  it('never counts a recipe as both ready and missing something', () => {
    const result = matchCabinet(fixture, ['gin', 'campari', 'sweet-vermouth', 'dry-vermouth']);
    const readyNames = new Set(result.ready.map(r => r.name));
    for (const near of result.nearMisses) expect(readyNames.has(near.recipe.name)).toBe(false);
  });

  it('returns empty results for an empty cabinet rather than throwing', () => {
    const result = matchCabinet(fixture, []);
    expect(result).toEqual({ ready: [], nearMisses: [], reachable: [], maximizers: [] });
  });

  it('returns empty results for an empty library rather than throwing', () => {
    expect(matchCabinet([], ['gin']).ready).toEqual([]);
  });

  it('ignores a recipe whose required ingredients could not be resolved', () => {
    // Otherwise it would count as "ready" for every cabinet, including an empty one.
    const unmatchable = recipe({ name: 'Mystery', canonicalIngredients: [] });
    expect(matchCabinet([unmatchable], ['gin']).ready).toEqual([]);
  });
});

describe('matchCabinet — pantry items never block', () => {
  it('does not treat ice or a garnish as a missing ingredient', () => {
    const margarita = recipe({
      name: 'Margarita',
      canonicalIngredients: ['tequila', 'triple-sec', 'lime-juice'],
      // Ice and salt live here, and so are excluded from the match by construction.
      optionalIngredients: ['ice', 'salt'],
    });
    const result = matchCabinet([margarita], ['tequila', 'triple-sec', 'lime-juice']);
    expect(result.ready.map(r => r.name)).toEqual(['Margarita']);
  });
});

describe('matchCabinet — hierarchy', () => {
  const oldFashioned = recipe({ name: 'Old Fashioned', canonicalIngredients: ['bourbon', 'simple-syrup', 'angostura-bitters'] });

  it('lets a general bottle satisfy a specific requirement', () => {
    const result = matchCabinet([oldFashioned], ['whiskey', 'simple-syrup', 'angostura-bitters']);
    expect(result.ready).toHaveLength(1);
  });

  it('lets a specific bottle satisfy a general requirement', () => {
    const generic = recipe({ name: 'Highball', canonicalIngredients: ['whiskey', 'soda-water'] });
    const result = matchCabinet([generic], ['rye-whiskey', 'soda-water']);
    expect(result.ready).toHaveLength(1);
  });
});

describe('maximizers', () => {
  it('ranks the purchase that completes the most recipes first', () => {
    const fixture = [
      recipe({ name: 'A', canonicalIngredients: ['gin', 'lime-juice'] }),
      recipe({ name: 'B', canonicalIngredients: ['gin', 'lime-juice', 'simple-syrup'] }),
      recipe({ name: 'C', canonicalIngredients: ['gin', 'campari'] }),
    ];
    // With gin + simple-syrup: A and B each need lime juice; C needs Campari.
    const result = matchCabinet(fixture, ['gin', 'simple-syrup']);

    expect(result.maximizers[0].slug).toBe('lime-juice');
    expect(result.maximizers[0].unlocks).toBe(2);
    expect(result.maximizers[0].examples).toContain('A');
  });

  it('counts only recipes a single purchase completes outright', () => {
    // This recipe is two ingredients away, so neither counts toward a maximizer —
    // suggesting a bottle that still leaves the drink unmakeable is noise.
    const fixture = [recipe({ name: 'Far', canonicalIngredients: ['gin', 'campari', 'sweet-vermouth'] })];
    expect(matchCabinet(fixture, ['gin']).maximizers).toEqual([]);
  });
});

describe('searchLibrary', () => {
  it('ranks an exact name match above an ingredient mention', () => {
    const results = searchLibrary(library, 'negroni', 10);
    expect(results[0].name.toLowerCase()).toBe('negroni');
  });

  it('finds recipes by ingredient', () => {
    expect(searchLibrary(library, 'campari', 20).length).toBeGreaterThan(0);
  });

  it('returns nothing for an empty query instead of the whole library', () => {
    expect(searchLibrary(library, '')).toEqual([]);
    expect(searchLibrary(library, '   ')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(searchLibrary(library, 'gin', 5).length).toBeLessThanOrEqual(5);
  });
});

describe('shipped library — regression guards', () => {
  it('contains a substantial library', () => {
    expect(library.length).toBeGreaterThan(500);
  });

  it('gives a fully-stocked bar access to the whole library', () => {
    // The headline regression. Before the taxonomy, this figure was 2.6%.
    const everything = allIngredients().filter(n => !n.pantry).map(n => n.slug);
    const result = matchCabinet(library, everything);
    expect(result.ready.length / library.length).toBeGreaterThan(0.99);
  });

  it('makes a realistic twelve-bottle home bar genuinely useful', () => {
    const homeBar = [
      'gin', 'vodka', 'bourbon', 'white-rum', 'tequila', 'lime-juice',
      'lemon-juice', 'simple-syrup', 'sweet-vermouth', 'campari',
      'angostura-bitters', 'soda-water',
    ];
    const result = matchCabinet(library, homeBar);
    expect(result.ready.length).toBeGreaterThan(30);
    expect(result.nearMisses.length).toBeGreaterThan(50);
    expect(result.maximizers.length).toBeGreaterThan(0);
  });

  it('makes a Negroni from a Negroni kit', () => {
    const result = matchCabinet(library, ['gin', 'campari', 'sweet-vermouth']);
    expect(result.ready.map(r => r.name)).toContain('Negroni');
  });

  it('never presents an invented story as fact', () => {
    // Lore must be either genuinely sourced or absent. This is the content-integrity
    // guarantee the rebuild exists to enforce.
    for (const drink of library) {
      if (drink.lore) expect(drink.loreSource, drink.name).toBeTruthy();
    }
  });

  it('gives every recipe its own photograph', () => {
    // The previous library reused 41 images across 1,050 recipes.
    const photos = new Set(library.map(c => c.photo.url).filter(Boolean));
    expect(photos.size).toBeGreaterThan(library.length * 0.95);
  });

  it('derives flavour tags that all match at least one recipe', () => {
    // The old UI shipped a "Strong" chip that matched zero of 1,050 recipes.
    for (const { tag, count } of flavorVocabulary(library)) {
      expect(count, tag).toBeGreaterThan(0);
    }
  });

  it('resolves ingredients for every recipe', () => {
    const unmatchable = library.filter(c => c.canonicalIngredients.length === 0);
    expect(unmatchable.map(c => c.name)).toEqual([]);
  });

  it('uses each essential ingredient in a meaningful number of recipes', () => {
    const frequency = ingredientFrequency(library);
    for (const node of allIngredients().filter(n => n.essential)) {
      expect(frequency.get(node.slug) ?? 0, node.label).toBeGreaterThan(4);
    }
  });
});
