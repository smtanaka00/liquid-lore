/**
 * tests/recipe-draft.test.ts
 *
 * The Studio's rules. The old form's only validation was the browser's `required`
 * attribute, so a recipe could be published as a name plus one blank step — these tests
 * pin what "publishable" now means, and pin that abandoned rows are ignored rather than
 * treated as errors, which is the difference between a helpful wizard and an annoying one.
 */

import { describe, it, expect } from 'vitest';
import {
  emptyDraft,
  validateStep,
  firstInvalidStep,
  isPublishable,
  toInsertRow,
  STUDIO_STEPS,
  LIMITS,
  type RecipeDraft,
} from '../lib/domain/recipe-draft';

const USER = '7f3c1a20-0000-4000-8000-000000000001';

/** A draft that passes every step; individual tests spoil one thing at a time. */
function validDraft(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    name: 'Midnight Mirage',
    story: 'Built for the last hour of a long night.',
    ingredients: [
      { name: 'Mezcal', measure: '2 oz' },
      { name: 'Lime juice', measure: '¾ oz' },
    ],
    instructions: ['Shake hard with ice.', 'Strain into a chilled coupe.'],
    glass: 'Coupe glass',
    garnish: 'Lime twist',
    flavorProfiles: ['smoky', 'citrusy'],
    imageUrl: null,
    ...overrides,
  };
}

describe('emptyDraft', () => {
  it('starts with a row to type into, and is not publishable', () => {
    const draft = emptyDraft();

    expect(draft.ingredients).toHaveLength(1);
    expect(draft.instructions).toHaveLength(1);
    expect(isPublishable(draft)).toBe(false);
    expect(firstInvalidStep(draft)).toBe('essentials');
  });
});

describe('validateStep — essentials', () => {
  it('accepts a named drink', () => {
    expect(validateStep(validDraft(), 'essentials')).toEqual([]);
  });

  it('requires a name', () => {
    expect(validateStep(validDraft({ name: '   ' }), 'essentials')).toContain('Give your drink a name.');
  });

  it('rejects a one-character name', () => {
    expect(validateStep(validDraft({ name: 'G' }), 'essentials')).toHaveLength(1);
  });

  it('treats the story as optional — a blank one is honest, not an error', () => {
    expect(validateStep(validDraft({ story: '' }), 'essentials')).toEqual([]);
  });

  it('bounds the story', () => {
    expect(validateStep(validDraft({ story: 'x'.repeat(LIMITS.storyMax + 1) }), 'essentials')).toHaveLength(1);
  });
});

describe('validateStep — ingredients', () => {
  it('accepts a measured list', () => {
    expect(validateStep(validDraft(), 'ingredients')).toEqual([]);
  });

  it('requires at least one ingredient', () => {
    const draft = validDraft({ ingredients: [{ name: '', measure: '' }] });
    expect(validateStep(draft, 'ingredients')).toContain('Add at least one ingredient.');
  });

  it('ignores rows the user started and abandoned', () => {
    // Clicking "+" and then changing your mind must not fail the step.
    const draft = validDraft({
      ingredients: [{ name: 'Mezcal', measure: '2 oz' }, { name: '', measure: '' }],
    });
    expect(validateStep(draft, 'ingredients')).toEqual([]);
  });

  it('requires a measure on every listed ingredient', () => {
    // "gin" with no amount is the single most common thing missing from the old form.
    const draft = validDraft({ ingredients: [{ name: 'Gin', measure: '  ' }] });
    expect(validateStep(draft, 'ingredients')).toContain('Every ingredient needs a measure.');
  });

  it('catches the same ingredient listed twice, whatever the casing', () => {
    const draft = validDraft({
      ingredients: [{ name: 'Gin', measure: '2 oz' }, { name: ' gin ', measure: '1 oz' }],
    });
    expect(validateStep(draft, 'ingredients')).toContain('The same ingredient is listed twice.');
  });

  it('bounds the list length', () => {
    const many = Array.from({ length: LIMITS.ingredientsMax + 1 }, (_, i) => ({
      name: `Ingredient ${i}`, measure: '1 oz',
    }));
    expect(validateStep(validDraft({ ingredients: many }), 'ingredients')).toHaveLength(1);
  });
});

describe('validateStep — method', () => {
  it('accepts real steps', () => {
    expect(validateStep(validDraft(), 'method')).toEqual([]);
  });

  it('requires at least one instruction', () => {
    expect(validateStep(validDraft({ instructions: ['   '] }), 'method'))
      .toContain('Write at least one instruction.');
  });

  it('rejects a step too short to follow', () => {
    expect(validateStep(validDraft({ instructions: ['Do'] }), 'method'))
      .toContain('One of the steps is too short to follow.');
  });

  it('ignores blank rows between real ones', () => {
    const draft = validDraft({ instructions: ['Shake with ice.', '', 'Strain.'] });
    expect(validateStep(draft, 'method')).toEqual([]);
  });
});

describe('validateStep — finish', () => {
  it('is satisfied by an empty step; everything on it is optional', () => {
    const draft = validDraft({ glass: '', garnish: '', flavorProfiles: [], imageUrl: null });
    expect(validateStep(draft, 'finish')).toEqual([]);
  });

  it('bounds the number of flavour tags', () => {
    const draft = validDraft({ flavorProfiles: ['a', 'b', 'c', 'd', 'e'] });
    expect(validateStep(draft, 'finish')).toHaveLength(1);
  });
});

describe('firstInvalidStep', () => {
  it('returns null for a complete draft', () => {
    expect(firstInvalidStep(validDraft())).toBeNull();
  });

  it('names the earliest broken step, so the wizard can jump the user to the real problem', () => {
    const draft = validDraft({ name: '', instructions: [''] });
    expect(firstInvalidStep(draft)).toBe('essentials');
    expect(firstInvalidStep(validDraft({ instructions: [''] }))).toBe('method');
  });

  it('walks the steps in declared order', () => {
    expect(STUDIO_STEPS).toEqual(['essentials', 'ingredients', 'method', 'finish']);
  });
});

describe('toInsertRow', () => {
  it('trims, drops abandoned rows, and nulls empty optional text', () => {
    const draft = validDraft({
      name: '  Midnight Mirage  ',
      story: '   ',
      garnish: '',
      glass: '',
      ingredients: [{ name: ' Mezcal ', measure: ' 2 oz ' }, { name: '', measure: '1 oz' }],
      instructions: ['  Shake.  ', '', 'Strain.'],
    });

    expect(toInsertRow(draft, USER)).toEqual({
      creator_id: USER,
      name: 'Midnight Mirage',
      story: null,
      ingredients: [{ name: 'Mezcal', measure: '2 oz' }],
      instructions: ['Shake.', 'Strain.'],
      glass: null,
      garnish: null,
      flavor_profiles: ['smoky', 'citrusy'],
      image_url: null,
    });
  });

  it('carries an uploaded photo through unchanged', () => {
    const url = 'https://example.test/storage/v1/object/public/recipe-images/x/1.jpg';
    expect(toInsertRow(validDraft({ imageUrl: url }), USER).image_url).toBe(url);
  });
});
