/**
 * tests/ingredient-taxonomy.test.ts
 *
 * The taxonomy is the load-bearing piece: if `resolveIngredient` maps a name wrongly, every
 * match involving that ingredient is wrong, silently and forever. These tests target the two
 * failure modes that matter — the brand problem that broke the old build, and substring
 * collisions where a naive matcher confuses "gin" with "ginger ale".
 */

import { describe, it, expect } from 'vitest';
import {
  resolveIngredient, expandCabinet, isPantry, labelFor, getIngredient, INGREDIENTS,
} from '../lib/domain/ingredient-taxonomy';

describe('resolveIngredient — brands', () => {
  // The original defect: recipes stored brands, cabinets stored generics, nothing matched.
  it.each([
    ["Tito's", 'vodka'],
    ['Absolut Citron', 'vodka'],
    ['Monkey 47', 'gin'],
    ['Bombay Sapphire', 'gin'],
    ['Buffalo Trace', 'bourbon'],
    ['Wild Turkey', 'bourbon'],
    ['Sazerac Rye', 'rye-whiskey'],
    ['Lagavulin', 'scotch'],
    ['Jack Daniels', 'tennessee-whiskey'],
    ['Crown Royal', 'canadian-whisky'],
    ['Patron Silver', 'tequila'],
    ['Del Maguey', 'mezcal'],
    ['Hennessy VS', 'cognac'],
    ['Fernet-Branca', 'fernet'],
    ['Chambord', 'raspberry-liqueur'],
    ['St. Germain', 'elderflower-liqueur'],
    ['Malibu rum', 'coconut-liqueur'],
  ])('%s resolves to %s', (raw, expected) => {
    expect(resolveIngredient(raw)).toBe(expected);
  });
});

describe('resolveIngredient — substring collisions', () => {
  // Each pair is one a naive `includes()` matcher gets wrong.
  it.each([
    ['Gin', 'gin'],
    ['Ginger ale', 'ginger-ale'],
    ['Ginger beer', 'ginger-beer'],
    ['Ginger', 'ginger'],
    ['Sloe gin', 'sloe-gin'],
    ['Brandy', 'brandy'],
    ['Apple brandy', 'apple-brandy'],
    ['Cherry brandy', 'cherry-liqueur'],
    ['Apricot brandy', 'apricot-brandy'],
    ['Lemonade', 'lemonade'],
    ['Lemon juice', 'lemon-juice'],
    ['Lemon-lime soda', 'lemon-lime-soda'],
    ['Maraschino cherry', 'maraschino-cherry'],
    ['Maraschino liqueur', 'maraschino-liqueur'],
    ['Irish cream', 'irish-cream'],
    ['Heavy cream', 'cream'],
    ['Coconut liqueur', 'coconut-liqueur'],
    ['Cream of coconut', 'coconut-cream'],
    ['Peach schnapps', 'peach-schnapps'],
    ['Peach Bitters', 'peach-bitters'],
    ['Peach Vodka', 'vodka'],
  ])('%s resolves to %s', (raw, expected) => {
    expect(resolveIngredient(raw)).toBe(expected);
  });
});

describe('resolveIngredient — messy source strings', () => {
  it.each([
    ['fresh lime juice', 'lime-juice'],
    ['Fresh Lemon Juice', 'lemon-juice'],
    ['splash of club soda', 'soda-water'],
    ['grapefruit soda (Jarritos or Fever-Tree)', 'lemon-lime-soda'],
    ['muddled jalapeño', 'jalapeno'],
    ['Carbonated water', 'soda-water'],
    ['Sugar syrup', 'simple-syrup'],
    ['Powdered sugar', 'sugar'],
  ])('%s resolves to %s', (raw, expected) => {
    expect(resolveIngredient(raw)).toBe(expected);
  });

  it('returns null rather than guessing at an unknown name', () => {
    expect(resolveIngredient('Kool-Aid')).toBeNull();
    expect(resolveIngredient('Jello')).toBeNull();
  });

  it('handles empty and nullish input without throwing', () => {
    expect(resolveIngredient('')).toBeNull();
    expect(resolveIngredient(null)).toBeNull();
    expect(resolveIngredient(undefined)).toBeNull();
    expect(resolveIngredient('   ')).toBeNull();
    expect(resolveIngredient('!!!')).toBeNull();
  });
});

describe('expandCabinet', () => {
  it('lets a specific bottle satisfy the general requirement', () => {
    // Owning bourbon should satisfy a recipe asking for "whiskey".
    expect(expandCabinet(['bourbon']).has('whiskey')).toBe(true);
  });

  it('lets a general bottle satisfy specific requirements', () => {
    // Someone who ticked "Whiskey" wants to be shown bourbon and rye drinks.
    const expanded = expandCabinet(['whiskey']);
    expect(expanded.has('bourbon')).toBe(true);
    expect(expanded.has('rye-whiskey')).toBe(true);
    expect(expanded.has('scotch')).toBe(true);
  });

  it('does not leak across unrelated branches', () => {
    const expanded = expandCabinet(['bourbon']);
    expect(expanded.has('gin')).toBe(false);
    expect(expanded.has('white-rum')).toBe(false);
  });

  it('applies non-hierarchical stand-ins', () => {
    // Sugar can be turned into simple syrup.
    expect(expandCabinet(['sugar']).has('simple-syrup')).toBe(true);
    expect(expandCabinet(['aquafaba']).has('egg-white')).toBe(true);
  });

  it('passes unknown slugs through instead of dropping them', () => {
    expect(expandCabinet(['not-a-real-slug']).has('not-a-real-slug')).toBe(true);
  });

  it('returns an empty set for an empty cabinet', () => {
    expect(expandCabinet([]).size).toBe(0);
  });
});

describe('taxonomy integrity', () => {
  it('has no duplicate slugs', () => {
    const slugs = INGREDIENTS.map(n => n.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('has no dangling parent references', () => {
    const slugs = new Set(INGREDIENTS.map(n => n.slug));
    for (const node of INGREDIENTS) {
      if (node.parent) expect(slugs.has(node.parent), `${node.slug} -> ${node.parent}`).toBe(true);
    }
  });

  it('has no dangling satisfiedBy references', () => {
    const slugs = new Set(INGREDIENTS.map(n => n.slug));
    for (const node of INGREDIENTS) {
      for (const other of node.satisfiedBy ?? []) {
        expect(slugs.has(other), `${node.slug} satisfiedBy ${other}`).toBe(true);
      }
    }
  });

  it('has no parent cycles', () => {
    for (const node of INGREDIENTS) {
      const seen = new Set<string>();
      let current = node.parent;
      while (current) {
        expect(seen.has(current), `cycle at ${node.slug}`).toBe(false);
        seen.add(current);
        current = getIngredient(current)?.parent;
      }
    }
  });

  it('round-trips every slug and label back to itself', () => {
    for (const node of INGREDIENTS) {
      expect(resolveIngredient(node.slug), node.slug).toBe(node.slug);
      expect(resolveIngredient(node.label), node.label).toBe(node.slug);
    }
  });

  it('marks the things nobody should be blocked on as pantry', () => {
    for (const slug of ['ice', 'water', 'salt', 'sugar', 'maraschino-cherry', 'orange']) {
      expect(isPantry(slug), slug).toBe(true);
    }
    for (const slug of ['gin', 'lime-juice', 'campari', 'mint']) {
      expect(isPantry(slug), slug).toBe(false);
    }
  });

  it('falls back to the slug when a label is missing', () => {
    expect(labelFor('gin')).toBe('Gin');
    expect(labelFor('nonexistent')).toBe('nonexistent');
  });
});
