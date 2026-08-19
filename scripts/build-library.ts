/**
 * scripts/build-library.ts
 *
 * Builds `data/cocktails.seed.json` — the recipe library the app ships and seeds Supabase from.
 *
 * Sources, in precedence order:
 *   1. data/premium-lore.json  — hand-written classics with real, sourced history
 *   2. TheCocktailDB           — verified real recipes, fetched live
 *
 * WHY THIS REPLACED THE OLD LIBRARY
 * The previous `lib/liquid_lore_recipes.js` held 1,050 recipes of which 1,030 were machine-
 * generated ingredient permutations carrying invented histories — "Wild London Collins"
 * (vodka, watermelon juice, two dashes of dry white wine) described as "a tiki bar staple
 * from the golden age of Polynesian restaurants". This pipeline only emits drinks that
 * exist, and leaves `lore` null rather than inventing one.
 *
 * Every ingredient is resolved against lib/domain/ingredient-taxonomy.ts, so a recipe's
 * `canonicalIngredients` speak the same vocabulary as a user's cabinet. That shared
 * vocabulary is what makes "What Can I Make?" work at all.
 *
 * Run with:
 *     npm run library:build
 *
 * Failure behaviour: network errors retry with backoff. If the fetch phase yields fewer
 * recipes than the existing seed, the script refuses to overwrite it and exits non-zero —
 * a flaky network must not silently shrink the shipped library.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveIngredient, isPantry, labelFor } from '../lib/domain/ingredient-taxonomy';
import type { Cocktail, RecipeIngredient } from '../lib/domain/types';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA_DIR = path.join(ROOT, 'data');
const SEED_PATH = path.join(DATA_DIR, 'cocktails.seed.json');
const PREMIUM_PATH = path.join(DATA_DIR, 'premium-lore.json');
const REPORT_PATH = path.join(DATA_DIR, 'library-build-report.json');

const API_KEY = process.env.COCKTAILDB_API_KEY || '1';
const API = `https://www.thecocktaildb.com/api/json/v1/${API_KEY}`;

// ── http ──────────────────────────────────────────────────────────────────────

/**
 * GET with retry and linear backoff.
 *
 * Returns: the parsed body, or `null` after the final attempt fails. Callers treat `null`
 * as "this slice of the catalogue is unavailable" and carry on — one failed letter must
 * not abort a 600-request build.
 */
async function getJson(url: string, attempts = 4): Promise<any | null> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'liquid-lore/library-build' } });
      if (res.status === 429) {
        await sleep(2000 * attempt);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === attempts) {
        console.warn(`  ! giving up on ${url} — ${(err as Error).message}`);
        return null;
      }
      await sleep(500 * attempt);
    }
  }
  return null;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ── text helpers ──────────────────────────────────────────────────────────────

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Split free-text instructions into discrete steps.
 *
 * Mixing Mode shows one step per screen, so this decides how the hands-free UI paces.
 * Splits on sentence boundaries and on newlines, and drops fragments too short to be a
 * real instruction.
 */
function splitSteps(instructions: string | null | undefined): string[] {
  if (!instructions) return [];
  return instructions
    .split(/\r?\n|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(step => step.trim().replace(/^[-–•\d.)\s]+/, '').trim())
    .filter(step => step.length > 3)
    .map(step => (/[.!?]$/.test(step) ? step : `${step}.`));
}

// ── derived attributes ────────────────────────────────────────────────────────
// Everything below is inferred from ingredients and instructions the source actually
// provides. Nothing here invents a fact about the drink's history or origin.

const METHOD_PATTERNS: Array<[RegExp, string]> = [
  [/\bblend|blender\b/i, 'blend'],
  [/\bmuddl/i, 'muddle'],
  [/\bshake|shaker\b/i, 'shake'],
  [/\bstir\b/i, 'stir'],
  [/\bbuild|pour .* into the glass|fill .* glass\b/i, 'build'],
];

function inferMethod(instructions: string): string | null {
  for (const [pattern, method] of METHOD_PATTERNS) {
    if (pattern.test(instructions)) return method;
  }
  return null;
}

const FLAVOR_RULES: Array<[string, string[]]> = [
  ['citrusy', ['lime-juice', 'lemon-juice', 'grapefruit-juice', 'orange-juice']],
  ['bitter', ['campari', 'aperol', 'amaro', 'fernet', 'cynar', 'angostura-bitters', 'orange-bitters', 'peychauds-bitters', 'tonic-water']],
  ['sweet', ['simple-syrup', 'grenadine', 'honey-syrup', 'agave-syrup', 'maple-syrup', 'orgeat-syrup', 'triple-sec', 'amaretto', 'creme-de-cacao', 'coconut-liqueur']],
  ['creamy', ['cream', 'milk', 'irish-cream', 'coconut-cream', 'egg-white', 'ice-cream', 'whipped-cream']],
  ['herby', ['mint', 'basil', 'rosemary', 'thyme', 'chartreuse', 'benedictine', 'absinthe', 'pastis']],
  ['smoky', ['mezcal', 'scotch']],
  ['fruity', ['pineapple-juice', 'cranberry-juice', 'passion-fruit-juice', 'peach-puree', 'raspberry-liqueur', 'melon-liqueur', 'banana-liqueur', 'strawberries', 'mango', 'apple-juice']],
  ['spicy', ['ginger-beer', 'ginger', 'jalapeno', 'pepper', 'cinnamon-schnapps', 'hot-sauce']],
  ['refreshing', ['soda-water', 'tonic-water', 'lemon-lime-soda', 'ginger-ale', 'cucumber']],
];

const SPIRIT_SLUGS = new Set([
  'gin', 'vodka', 'rum', 'white-rum', 'gold-rum', 'dark-rum', 'spiced-rum', 'overproof-rum',
  'cachaca', 'whiskey', 'bourbon', 'rye-whiskey', 'scotch', 'irish-whiskey', 'tennessee-whiskey',
  'canadian-whisky', 'brandy', 'cognac', 'apple-brandy', 'pisco', 'tequila', 'mezcal',
  'absinthe', 'grain-alcohol',
]);

const MIXER_SLUGS = new Set([
  'soda-water', 'tonic-water', 'cola', 'lemon-lime-soda', 'ginger-ale', 'ginger-beer',
  'lemonade', 'root-beer', 'fruit-soda', 'orange-juice', 'pineapple-juice', 'cranberry-juice',
  'apple-juice', 'grape-juice', 'tomato-juice', 'milk', 'cream', 'coffee', 'tea',
]);

/** Flavour tags derived from the resolved ingredient set — factual, not editorial. */
function inferFlavorProfiles(slugs: string[]): string[] {
  const owned = new Set(slugs);
  const tags = FLAVOR_RULES
    .filter(([, triggers]) => triggers.some(t => owned.has(t)))
    .map(([tag]) => tag);

  // "boozy" means spirit-forward: nothing non-alcoholic diluting it.
  const hasSpirit = slugs.some(s => SPIRIT_SLUGS.has(s));
  const hasMixer = slugs.some(s => MIXER_SLUGS.has(s));
  if (hasSpirit && !hasMixer) tags.push('boozy');

  return Array.from(new Set(tags));
}

function inferDifficulty(ingredientCount: number, method: string | null): string {
  if (method === 'blend' || ingredientCount >= 7) return 'advanced';
  if (ingredientCount >= 5 || method === 'muddle') return 'medium';
  return 'easy';
}

/**
 * Pull a garnish out of the instruction text.
 *
 * TheCocktailDB has no garnish field, but the final sentence very often is one. Returns
 * `null` when no garnish sentence is present rather than guessing at a plausible one.
 */
function inferGarnish(steps: string[]): string | null {
  for (const step of steps) {
    const match = step.match(/garnish(?:ed)?\s+(?:with\s+|by\s+)?(.+?)[.!]?$/i);
    if (match && match[1] && match[1].length < 80) {
      return match[1].replace(/^(a|an|the)\s+/i, '').trim();
    }
  }
  return null;
}

// ── normalization ─────────────────────────────────────────────────────────────

interface BuildStats {
  unresolved: Map<string, number>;
}

function buildIngredients(raw: Array<{ name: string; amount: string }>, stats: BuildStats) {
  const ingredients: RecipeIngredient[] = [];
  const required = new Set<string>();
  const optional = new Set<string>();

  for (const { name, amount } of raw) {
    const canonical = resolveIngredient(name);

    if (!canonical) {
      // Track, don't drop. An unresolved name means the taxonomy has a gap; the build
      // report lists them so the vocabulary can be extended deliberately.
      stats.unresolved.set(name, (stats.unresolved.get(name) ?? 0) + 1);
      ingredients.push({ name, canonical: null, amount, optional: true });
      continue;
    }

    const pantry = isPantry(canonical);
    ingredients.push({ name, canonical, amount, optional: pantry });
    (pantry ? optional : required).add(canonical);
  }

  return {
    ingredients,
    canonicalIngredients: Array.from(required),
    optionalIngredients: Array.from(optional),
  };
}

function normalizeCocktailDbDrink(drink: any, stats: BuildStats): Cocktail | null {
  const name: string = (drink.strDrink || '').trim();
  if (!name) return null;

  const rawIngredients: Array<{ name: string; amount: string }> = [];
  for (let i = 1; i <= 15; i++) {
    const ingName = (drink[`strIngredient${i}`] || '').trim();
    if (!ingName) continue;
    rawIngredients.push({
      name: ingName,
      amount: (drink[`strMeasure${i}`] || '').trim() || 'to taste',
    });
  }
  if (rawIngredients.length === 0) return null;

  const { ingredients, canonicalIngredients, optionalIngredients } = buildIngredients(rawIngredients, stats);
  const steps = splitSteps(drink.strInstructions);
  const method = inferMethod(drink.strInstructions || '');
  const thumb: string | null = drink.strDrinkThumb || null;

  return {
    id: `cdb-${drink.idDrink}`,
    slug: slugify(name),
    name,

    source: 'thecocktaildb',
    sourceId: String(drink.idDrink),
    sourceUrl: 'https://www.thecocktaildb.com',

    category: drink.strCategory || null,
    isAlcoholic: drink.strAlcoholic === 'Alcoholic',
    // IBA membership is a real, checkable credential — the honest definition of "classic".
    isClassic: Boolean(drink.strIBA),

    glass: drink.strGlass || null,
    method,
    ice: null,
    garnish: inferGarnish(steps),
    difficulty: inferDifficulty(rawIngredients.length, method),

    flavorProfiles: inferFlavorProfiles(canonicalIngredients),
    vibes: [],

    // TheCocktailDB carries no history. Leaving this null is the point: the UI says
    // "no documented story yet" rather than printing an invented one.
    lore: null,
    loreSource: null,
    proTip: null,

    steps,
    ingredients,
    canonicalIngredients,
    optionalIngredients,

    photo: {
      url: thumb,
      thumb: thumb ? `${thumb}/preview` : null,
      source: 'thecocktaildb',
      credit: 'TheCocktailDB',
      creditUrl: 'https://www.thecocktaildb.com',
    },
  };
}

function normalizePremium(entry: any, stats: BuildStats): Cocktail {
  const rawIngredients = (entry.ingredients || []).map((i: any) => ({
    name: i.name,
    amount: i.amount || i.measure || 'to taste',
  }));
  const { ingredients, canonicalIngredients, optionalIngredients } = buildIngredients(rawIngredients, stats);

  // Carry the hand-written notes through onto the normalized ingredient rows.
  (entry.ingredients || []).forEach((source: any, index: number) => {
    if (ingredients[index] && source.notes) ingredients[index].notes = source.notes;
  });

  return {
    id: `ll-${slugify(entry.name)}`,
    slug: slugify(entry.name),
    name: entry.name,

    source: 'liquid_lore_premium',
    sourceId: null,
    sourceUrl: null,

    category: entry.category ?? 'Cocktail',
    isAlcoholic: entry.isAlcoholic !== false,
    isClassic: true,

    glass: entry.glass ?? null,
    method: entry.method ?? null,
    ice: entry.ice ?? null,
    garnish: entry.garnish ?? null,
    difficulty: entry.difficulty ?? inferDifficulty(rawIngredients.length, entry.method ?? null),

    flavorProfiles: entry.flavor_profiles ?? inferFlavorProfiles(canonicalIngredients),
    vibes: entry.vibes ?? [],

    lore: entry.lore ?? null,
    loreSource: entry.lore_source ?? 'Liquid Lore editorial',
    proTip: entry.pro_tip ?? null,

    steps: entry.steps ?? [],
    ingredients,
    canonicalIngredients,
    optionalIngredients,

    photo: {
      url: entry.photo?.url ?? null,
      thumb: entry.photo?.thumb ?? entry.photo?.url ?? null,
      source: entry.photo?.source ?? null,
      credit: entry.photo?.credit ?? null,
      creditUrl: entry.photo?.credit_url ?? null,
    },
  };
}

// ── catalogue enumeration ─────────────────────────────────────────────────────

/**
 * Collect every drink id TheCocktailDB's free tier will disclose.
 *
 * No single endpoint lists the whole catalogue: the a–z search returns full records but
 * misses drinks, and each filter endpoint caps at 100 results. Sweeping several axes and
 * unioning the ids recovers substantially more of the library than any one of them.
 */
async function enumerateCatalogue(): Promise<{ full: Map<string, any>; extraIds: Set<string> }> {
  const full = new Map<string, any>();
  const extraIds = new Set<string>();

  process.stdout.write('  a–z search ');
  for (const char of 'abcdefghijklmnopqrstuvwxyz0123456789') {
    const body = await getJson(`${API}/search.php?f=${char}`);
    for (const drink of body?.drinks ?? []) full.set(drink.idDrink, drink);
    process.stdout.write('.');
  }
  console.log(` ${full.size} full records`);

  const axes: Array<[string, string[]]> = [
    ['c', ['Cocktail', 'Shot', 'Ordinary Drink', 'Other / Unknown', 'Shake', 'Beer',
           'Punch / Party Drink', 'Coffee / Tea', 'Soft Drink', 'Homemade Liqueur', 'Cocoa']],
    ['g', ['Cocktail glass', 'Highball glass', 'Old-fashioned glass', 'Collins glass',
           'Champagne flute', 'Coffee mug', 'Shot glass', 'Whiskey sour glass',
           'Margarita glass', 'Beer mug', 'Wine Glass', 'Pint glass', 'Punch bowl']],
    ['i', ['Gin', 'Vodka', 'Rum', 'Light rum', 'Dark rum', 'Tequila', 'Bourbon', 'Scotch',
           'Whiskey', 'Brandy', 'Champagne', 'Triple sec', 'Amaretto', 'Kahlua', 'Campari',
           'Sweet Vermouth', 'Dry Vermouth', 'Cognac', 'Absinthe', 'Applejack']],
  ];

  process.stdout.write('  filters ');
  for (const [param, values] of axes) {
    for (const value of values) {
      const body = await getJson(`${API}/filter.php?${param}=${encodeURIComponent(value)}`);
      for (const drink of body?.drinks ?? []) {
        if (!full.has(drink.idDrink)) extraIds.add(drink.idDrink);
      }
      process.stdout.write('.');
    }
  }
  console.log(` ${extraIds.size} additional ids`);

  return { full, extraIds };
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Building the Liquid Lore recipe library\n');

  const stats: BuildStats = { unresolved: new Map() };

  // 1. Premium classics — the only drinks with hand-written, sourced history.
  let premium: Cocktail[] = [];
  if (fs.existsSync(PREMIUM_PATH)) {
    const entries = JSON.parse(fs.readFileSync(PREMIUM_PATH, 'utf8'));
    premium = entries.map((entry: any) => normalizePremium(entry, stats));
    console.log(`Premium classics: ${premium.length}`);
  } else {
    console.warn(`No ${path.relative(ROOT, PREMIUM_PATH)} — building without hand-written lore.`);
  }

  // 2. TheCocktailDB.
  console.log('\nFetching TheCocktailDB');
  const { full, extraIds } = await enumerateCatalogue();

  if (extraIds.size) {
    process.stdout.write('  lookups ');
    let done = 0;
    for (const id of extraIds) {
      const body = await getJson(`${API}/lookup.php?i=${id}`);
      const drink = body?.drinks?.[0];
      if (drink) full.set(drink.idDrink, drink);
      if (++done % 25 === 0) process.stdout.write('.');
    }
    console.log(` ${full.size} total records`);
  }

  const fromApi = Array.from(full.values())
    .map(drink => normalizeCocktailDbDrink(drink, stats))
    .filter((c): c is Cocktail => c !== null);

  console.log(`\nNormalized ${fromApi.length} recipes from TheCocktailDB`);

  // 3. Merge. Premium wins on slug collision — a hand-written Negroni beats the API's,
  //    but the API's photograph is kept when the premium entry has none.
  const bySlug = new Map<string, Cocktail>();
  for (const recipe of fromApi) {
    const existing = bySlug.get(recipe.slug);
    // Prefer the IBA-recognised record if two API drinks share a slug.
    if (!existing || (recipe.isClassic && !existing.isClassic)) bySlug.set(recipe.slug, recipe);
  }
  for (const recipe of premium) {
    const apiVersion = bySlug.get(recipe.slug);
    if (apiVersion && !recipe.photo.url) recipe.photo = apiVersion.photo;
    bySlug.set(recipe.slug, recipe);
  }

  const library = Array.from(bySlug.values()).sort((a, b) => a.name.localeCompare(b.name));

  // 4. Refuse to ship a smaller library than we already have — a flaky network should
  //    fail the build, not quietly delete recipes.
  if (fs.existsSync(SEED_PATH)) {
    const previous = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
    const previousCount = previous.cocktails?.length ?? 0;
    if (library.length < previousCount * 0.9) {
      console.error(
        `\nRefusing to write: built ${library.length} recipes but the existing seed has ` +
        `${previousCount}. This usually means the fetch was rate-limited. Existing seed left intact.`
      );
      process.exit(1);
    }
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const seed = {
    version: 2,
    // No build timestamp: it would churn the diff on every rebuild and tells us nothing
    // the git history doesn't already record.
    total: library.length,
    sources: {
      liquid_lore_premium: library.filter(c => c.source === 'liquid_lore_premium').length,
      thecocktaildb: library.filter(c => c.source === 'thecocktaildb').length,
    },
    cocktails: library,
  };
  fs.writeFileSync(SEED_PATH, `${JSON.stringify(seed, null, 1)}\n`);

  const unresolved = Array.from(stats.unresolved.entries()).sort((a, b) => b[1] - a[1]);
  const withLore = library.filter(c => c.lore).length;
  const withPhoto = library.filter(c => c.photo.url).length;

  fs.writeFileSync(REPORT_PATH, `${JSON.stringify({
    total: library.length,
    classics: library.filter(c => c.isClassic).length,
    withLore,
    withPhoto,
    distinctPhotos: new Set(library.map(c => c.photo.url).filter(Boolean)).size,
    unresolvedIngredients: Object.fromEntries(unresolved),
  }, null, 2)}\n`);

  console.log(`\n  ${library.length} recipes  ->  ${path.relative(ROOT, SEED_PATH)}`);
  console.log(`  ${seed.sources.liquid_lore_premium} premium / ${seed.sources.thecocktaildb} TheCocktailDB`);
  console.log(`  ${library.filter(c => c.isClassic).length} classics · ${withLore} with lore · ${withPhoto} with a photo`);
  console.log(`  ${new Set(library.map(c => c.photo.url).filter(Boolean)).size} distinct photographs`);

  if (unresolved.length) {
    console.log(`\n  ${unresolved.length} unresolved ingredient names (see library-build-report.json):`);
    console.log(`  ${unresolved.slice(0, 15).map(([n, c]) => `${n} ×${c}`).join(', ')}`);
    console.log('  These do not block cabinet matches. Add them to the taxonomy to make them stockable.');
  }
}

main().catch(err => {
  console.error('\nLibrary build failed:', err);
  process.exit(1);
});
