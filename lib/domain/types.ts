/**
 * lib/domain/types.ts
 *
 * The shapes every layer agrees on. The API routes, the repository, the seed file and
 * the React components all speak these types — there is no per-layer reshaping.
 *
 * Nothing here imports from outside the domain, so this module is safe to pull into a
 * Node script, an API route, or the browser bundle alike.
 */

// ── ingredients ───────────────────────────────────────────────────────────────

export type IngredientCategory =
  | 'Base Spirits'
  | 'Liqueurs'
  | 'Amari & Aperitifs'
  | 'Fortified Wine'
  | 'Wine & Beer'
  | 'Juices'
  | 'Sodas & Mixers'
  | 'Syrups & Sweeteners'
  | 'Bitters & Aromatics'
  | 'Dairy & Eggs'
  | 'Fruit & Produce'
  | 'Pantry & Garnish';

/**
 * One canonical ingredient.
 *
 * `slug` is the only identity that matters — cabinets store slugs, recipes store slugs,
 * and matching compares slugs. Every raw string the outside world produces ("Tito's",
 * "fresh lime juice", "Lime Juice") resolves down to one of these.
 */
export interface IngredientNode {
  slug: string;
  label: string;
  category: IngredientCategory;
  /** Broader ingredient this is a kind of. Bourbon's parent is whiskey. */
  parent?: string;
  /** Raw source strings and brand names that mean this ingredient. */
  aliases?: string[];
  /**
   * Other slugs that can stand in for this one. Distinct from `parent`: a lime can be
   * squeezed into lime juice, but a lime is not a kind of lime juice.
   */
  satisfiedBy?: string[];
  /**
   * Assumed present in any kitchen. Pantry ingredients never block a match — a recipe
   * is not "missing" ice. They are still listed on the recipe.
   */
  pantry?: boolean;
  /** Offered in the Quick Stock shortcuts on the cabinet screen. */
  essential?: boolean;
}

// ── recipes ───────────────────────────────────────────────────────────────────

export type RecipeSource = 'thecocktaildb' | 'liquid_lore_premium';

export interface RecipeIngredient {
  /** As printed on the recipe — "Fresh lime juice". */
  name: string;
  /** Canonical slug used for matching, or null when nothing in the taxonomy fits. */
  canonical: string | null;
  /** As printed — "2 oz", "¾ oz", "2 dashes". Never parsed at rest. */
  amount: string;
  notes?: string | null;
  /** Garnish or pantry item: listed, but does not block a cabinet match. */
  optional?: boolean;
}

export interface RecipePhoto {
  url: string | null;
  thumb: string | null;
  source: string | null;
  credit: string | null;
  creditUrl: string | null;
}

/**
 * A recipe as the app consumes it.
 *
 * `lore` is nullable on purpose. A drink with no documented history gets `null` and the
 * UI says so, rather than being given an invented one — the previous library attached
 * fabricated origin stories to machine-generated drinks, which is the failure this type
 * is shaped to prevent. `loreSource` records where a story came from.
 */
export interface Cocktail {
  id: string;
  slug: string;
  name: string;

  source: RecipeSource;
  sourceId: string | null;
  sourceUrl: string | null;

  category: string | null;
  isAlcoholic: boolean;
  isClassic: boolean;

  glass: string | null;
  method: string | null;
  ice: string | null;
  garnish: string | null;
  difficulty: string | null;

  flavorProfiles: string[];
  vibes: string[];

  lore: string | null;
  loreSource: string | null;
  proTip: string | null;

  steps: string[];
  ingredients: RecipeIngredient[];

  /** Slugs that must be in the cabinet. Excludes optional/pantry items. */
  canonicalIngredients: string[];
  /** Slugs the recipe mentions but that never block a match. */
  optionalIngredients: string[];

  photo: RecipePhoto;
}

/** The trimmed shape used for grids and lists — no steps, no lore. */
export interface CocktailSummary {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  glass: string | null;
  category: string | null;
  isClassic: boolean;
  hasLore: boolean;
  flavorProfiles: string[];
  vibes: string[];
  canonicalIngredients: string[];
}

// ── matching ──────────────────────────────────────────────────────────────────

/** A recipe the cabinet can't quite make, plus what's standing in the way. */
export interface NearMiss {
  recipe: CocktailSummary;
  missing: string[];
}

/** A purchase suggestion, ranked by how many new recipes it unlocks. */
export interface MaximizerSuggestion {
  slug: string;
  label: string;
  category: IngredientCategory;
  /** Recipes that become makeable if this one ingredient is added. */
  unlocks: number;
  /** A few example recipe names, for the UI to show what you'd gain. */
  examples: string[];
}

export interface CabinetMatch {
  /** Every required ingredient is in the cabinet. */
  ready: CocktailSummary[];
  /** Exactly one required ingredient is missing. */
  nearMisses: NearMiss[];
  /** Two or three missing — worth showing as aspiration, not as a result. */
  reachable: NearMiss[];
  /** Best single purchases, most-unlocking first. */
  maximizers: MaximizerSuggestion[];
}

// ── data layer ────────────────────────────────────────────────────────────────

export type DataSourceName = 'supabase' | 'seed';

/**
 * Every repository call returns this. It never throws and it never hides a fallback:
 * `source` says where the data actually came from and `notes` explains any degradation,
 * so a caller can surface "showing offline library" instead of silently lying.
 */
export interface DataResult<T> {
  data: T;
  source: DataSourceName;
  notes: string[];
}
