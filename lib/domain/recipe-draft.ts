/**
 * lib/domain/recipe-draft.ts
 *
 * The Creator Studio's state object and the rules that decide when it may be published.
 *
 * The Studio used to be one long form whose only validation was the browser's `required`
 * attribute, so a recipe could be published as "Gin" with a single blank instruction and
 * land in the Lounge unreadable. Validation lives here, not in the component, for two
 * reasons: the wizard needs to ask "is *this step* complete?" to decide whether the Next
 * button is live, and the same rules have to hold at publish time regardless of which
 * step the user is standing on.
 *
 * Pure — no React, no Supabase. `toInsertRow` is the one place the draft becomes a
 * `custom_recipes` row, so trimming and blank-dropping happen once and cannot drift.
 *
 * Usage:
 *     const draft  = emptyDraft();
 *     const errors = validateStep(draft, 'essentials');   // [] when the step is done
 *     if (!firstInvalidStep(draft)) publish(toInsertRow(draft, userId));
 */

import type { CommunityIngredient } from './community';

// ── the draft ─────────────────────────────────────────────────────────────────

/** One in-progress recipe. Every field is the raw, untrimmed string the user typed. */
export interface RecipeDraft {
  name: string;
  story: string;
  ingredients: CommunityIngredient[];
  instructions: string[];
  glass: string;
  garnish: string;
  /** Tags chosen from the library's own vocabulary, so community drinks filter alike. */
  flavorProfiles: string[];
  /** Public URL of an uploaded photo, or null. Never a local blob URL. */
  imageUrl: string | null;
}

/** The wizard's steps, in order. The array *is* the order — nothing else encodes it. */
export const STUDIO_STEPS = ['essentials', 'ingredients', 'method', 'finish'] as const;

export type StudioStep = (typeof STUDIO_STEPS)[number];

export const STEP_TITLES: Record<StudioStep, string> = {
  essentials: 'The Essentials',
  ingredients: 'Ingredients',
  method: 'The Method',
  finish: 'Finishing Touches',
};

// ── limits ────────────────────────────────────────────────────────────────────
// Chosen from what the UI can actually render: a name longer than this wraps out of the
// title, and a card in the Lounge shows two lines of story.

export const LIMITS = {
  nameMin: 2,
  nameMax: 60,
  storyMax: 600,
  ingredientsMin: 1,
  ingredientsMax: 20,
  ingredientNameMax: 60,
  measureMax: 24,
  stepsMin: 1,
  stepsMax: 12,
  stepMin: 3,
  stepMax: 280,
  garnishMax: 60,
  flavorsMax: 4,
} as const;

/** A blank draft with one empty ingredient and one empty step, so the form has a row. */
export function emptyDraft(): RecipeDraft {
  return {
    name: '',
    story: '',
    ingredients: [{ name: '', measure: '' }],
    instructions: [''],
    glass: '',
    garnish: '',
    flavorProfiles: [],
    imageUrl: null,
  };
}

// ── validation ────────────────────────────────────────────────────────────────

/** Rows the user started and then abandoned are ignored, not treated as errors. */
function filledIngredients(draft: RecipeDraft): CommunityIngredient[] {
  return draft.ingredients.filter(i => i.name.trim().length > 0);
}

function filledSteps(draft: RecipeDraft): string[] {
  return draft.instructions.filter(s => s.trim().length > 0);
}

/**
 * Everything wrong with one step of the wizard.
 *
 * Args:
 *     draft: the current draft.
 *     step:  which step to judge.
 *
 * Returns: human-readable messages, most important first. An empty array means the step
 * is complete. Never throws — a malformed draft yields messages, not an exception.
 */
export function validateStep(draft: RecipeDraft, step: StudioStep): string[] {
  const errors: string[] = [];

  if (step === 'essentials') {
    const name = draft.name.trim();
    if (name.length === 0) errors.push('Give your drink a name.');
    else if (name.length < LIMITS.nameMin) errors.push('That name is too short to be a drink.');
    else if (name.length > LIMITS.nameMax) errors.push(`Keep the name under ${LIMITS.nameMax} characters.`);

    // The story is optional: an honest blank beats a padded one. It is only bounded.
    if (draft.story.trim().length > LIMITS.storyMax) {
      errors.push(`The story is over ${LIMITS.storyMax} characters — trim it a little.`);
    }
  }

  if (step === 'ingredients') {
    const filled = filledIngredients(draft);

    if (filled.length < LIMITS.ingredientsMin) errors.push('Add at least one ingredient.');
    if (filled.length > LIMITS.ingredientsMax) errors.push(`That is more than ${LIMITS.ingredientsMax} ingredients.`);

    if (filled.some(i => i.name.trim().length > LIMITS.ingredientNameMax)) {
      errors.push('One of the ingredient names is far too long.');
    }
    if (filled.some(i => i.measure.trim().length > LIMITS.measureMax)) {
      errors.push('One of the measures is far too long — "2 oz", not a paragraph.');
    }
    // A measure is required per ingredient: "gin" without an amount is not a recipe
    // anyone can follow, and it is the single most common thing missing from the old form.
    if (filled.some(i => i.measure.trim().length === 0)) {
      errors.push('Every ingredient needs a measure.');
    }

    const names = filled.map(i => i.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) errors.push('The same ingredient is listed twice.');
  }

  if (step === 'method') {
    const steps = filledSteps(draft);

    if (steps.length < LIMITS.stepsMin) errors.push('Write at least one instruction.');
    if (steps.length > LIMITS.stepsMax) errors.push(`That is more than ${LIMITS.stepsMax} steps.`);
    if (steps.some(s => s.trim().length < LIMITS.stepMin)) errors.push('One of the steps is too short to follow.');
    if (steps.some(s => s.trim().length > LIMITS.stepMax)) errors.push('One of the steps is very long — try splitting it.');
  }

  if (step === 'finish') {
    // Everything on this step is optional; only the bounds are enforced.
    if (draft.garnish.trim().length > LIMITS.garnishMax) errors.push('That garnish description is too long.');
    if (draft.flavorProfiles.length > LIMITS.flavorsMax) errors.push(`Pick at most ${LIMITS.flavorsMax} flavour tags.`);
  }

  return errors;
}

/**
 * The first step that is not yet publishable.
 *
 * Returns: a `StudioStep`, or `null` when the whole draft is valid. The publish button
 * uses this instead of asking each step in turn, and the wizard uses it to jump the user
 * back to the actual problem rather than just refusing.
 */
export function firstInvalidStep(draft: RecipeDraft): StudioStep | null {
  return STUDIO_STEPS.find(step => validateStep(draft, step).length > 0) ?? null;
}

/** Whether the draft can be published at all. */
export function isPublishable(draft: RecipeDraft): boolean {
  return firstInvalidStep(draft) === null;
}

// ── persistence ───────────────────────────────────────────────────────────────

/**
 * Turn a valid draft into a `custom_recipes` row.
 *
 * Trimming and blank-dropping happen here and nowhere else, so what the Lounge reads back
 * is exactly what validation judged. Optional text becomes `null` rather than `''`, which
 * is what `normalizeCommunityRecipe` expects on the way out.
 *
 * Args:
 *     draft:     a draft that has passed `isPublishable`.
 *     creatorId: the signed-in user's id.
 *
 * Returns: a row ready for `insert`. Callers should still check `isPublishable` first;
 * this function does not re-validate, it only normalises.
 */
export function toInsertRow(draft: RecipeDraft, creatorId: string): Record<string, unknown> {
  return {
    creator_id: creatorId,
    name: draft.name.trim(),
    story: draft.story.trim() || null,
    ingredients: filledIngredients(draft).map(i => ({
      name: i.name.trim(),
      measure: i.measure.trim(),
    })),
    instructions: filledSteps(draft).map(s => s.trim()),
    glass: draft.glass.trim() || null,
    garnish: draft.garnish.trim() || null,
    flavor_profiles: draft.flavorProfiles,
    image_url: draft.imageUrl,
  };
}
