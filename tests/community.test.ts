/**
 * tests/community.test.ts
 *
 * Community recipes are the only rows in the app that a user writes directly, so this is
 * the layer where a malformed value actually reaches the UI. These tests pin the two
 * behaviours that matter: a bad row degrades to a renderable recipe rather than throwing,
 * and a raw `creator_id` never becomes an author name.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeCommunityRecipe,
  normalizePublicProfile,
  resolveAuthor,
  sanitizeSearchTerm,
  communityMetaDescription,
  profileMetaDescription,
  ANONYMOUS_AUTHOR,
  ANONYMOUS_PROFILE,
} from '../lib/domain/community';

const CREATOR = '7f3c1a20-0000-4000-8000-000000000001';

/** A well-formed row as the Studio writes it. */
function validRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1b2c3d4-0000-4000-8000-000000000002',
    creator_id: CREATOR,
    name: 'Midnight Mirage',
    story: 'Built for the last hour of a long night.',
    ingredients: [{ name: 'Mezcal', measure: '2 oz' }, { name: 'Lime juice', measure: '¾ oz' }],
    instructions: ['Shake with ice.', 'Strain into a coupe.'],
    glass: 'Coupe glass',
    garnish: 'Lime twist',
    image_url: null,
    likes_count: 4,
    created_at: '2026-08-20T18:00:00Z',
    profiles: { username: 'nightjar' },
    ...overrides,
  };
}

describe('normalizeCommunityRecipe — the happy path', () => {
  it('maps a well-formed row onto the domain shape', () => {
    const recipe = normalizeCommunityRecipe(validRow());

    expect(recipe.name).toBe('Midnight Mirage');
    expect(recipe.author).toBe('nightjar');
    expect(recipe.authorId).toBe(CREATOR);
    expect(recipe.likesCount).toBe(4);
    expect(recipe.ingredients).toEqual([
      { name: 'Mezcal', measure: '2 oz' },
      { name: 'Lime juice', measure: '¾ oz' },
    ]);
    expect(recipe.instructions).toHaveLength(2);
  });
});

describe('normalizeCommunityRecipe — malformed rows', () => {
  it('survives a row with nothing but an id', () => {
    const recipe = normalizeCommunityRecipe({ id: 'x' });

    expect(recipe.name).toBe('Untitled creation');
    expect(recipe.ingredients).toEqual([]);
    expect(recipe.instructions).toEqual([]);
    expect(recipe.likesCount).toBe(0);
    expect(recipe.author).toBe(ANONYMOUS_AUTHOR);
  });

  it('survives an empty row', () => {
    expect(() => normalizeCommunityRecipe({})).not.toThrow();
  });

  it('drops jsonb ingredients that are not objects with a name', () => {
    // `ingredients` is jsonb: a hand-edited row can legally hold any of these.
    const recipe = normalizeCommunityRecipe(validRow({
      ingredients: ['Gin', null, 42, { measure: '2 oz' }, { name: '  ' }, { name: 'Rye', measure: null }],
    }));

    expect(recipe.ingredients).toEqual([{ name: 'Rye', measure: '' }]);
  });

  it('treats a non-array ingredients value as empty', () => {
    expect(normalizeCommunityRecipe(validRow({ ingredients: 'Gin, vermouth' })).ingredients).toEqual([]);
  });

  it('drops blank instruction steps rather than rendering empty numbered rows', () => {
    const recipe = normalizeCommunityRecipe(validRow({ instructions: ['Shake.', '', '   ', 'Strain.'] }));
    expect(recipe.instructions).toEqual(['Shake.', 'Strain.']);
  });

  it('normalises blank optional text to null so the UI can skip the block', () => {
    const recipe = normalizeCommunityRecipe(validRow({ story: '   ', garnish: '', glass: null }));

    expect(recipe.story).toBeNull();
    expect(recipe.garnish).toBeNull();
    expect(recipe.glass).toBeNull();
  });

  it('never reports a negative or non-numeric like count', () => {
    expect(normalizeCommunityRecipe(validRow({ likes_count: -3 })).likesCount).toBe(0);
    expect(normalizeCommunityRecipe(validRow({ likes_count: 'lots' })).likesCount).toBe(0);
    expect(normalizeCommunityRecipe(validRow({ likes_count: null })).likesCount).toBe(0);
  });
});

describe('resolveAuthor', () => {
  it('reads the embedded profile whether PostgREST returns an object or a single-element array', () => {
    expect(resolveAuthor({ username: 'nightjar' })).toBe('nightjar');
    expect(resolveAuthor([{ username: 'nightjar' }])).toBe('nightjar');
  });

  it('falls back to the anonymous label instead of exposing a UUID', () => {
    // The feed used to print `creator_id` here whenever the join came back empty.
    expect(resolveAuthor(null)).toBe(ANONYMOUS_AUTHOR);
    expect(resolveAuthor([])).toBe(ANONYMOUS_AUTHOR);
    expect(resolveAuthor({ username: null })).toBe(ANONYMOUS_AUTHOR);
    expect(resolveAuthor({ username: '  ' })).toBe(ANONYMOUS_AUTHOR);
    expect(resolveAuthor(CREATOR)).toBe(ANONYMOUS_AUTHOR);
  });
});

describe('normalizePublicProfile', () => {
  it('maps the public columns and nothing else', () => {
    const profile = normalizePublicProfile({
      id: CREATOR,
      username: 'nightjar',
      bio: 'Mostly agave.',
      avatar_url: 'https://example.test/a.jpg',
      cabinet: ['gin', 'campari'],
    });

    expect(profile).toEqual({
      id: CREATOR,
      username: 'nightjar',
      bio: 'Mostly agave.',
      avatarUrl: 'https://example.test/a.jpg',
    });
    // The cabinet is its owner's business and must not travel to a public page.
    expect(profile).not.toHaveProperty('cabinet');
  });

  it('gives a profile with no username a printable label', () => {
    expect(normalizePublicProfile({ id: CREATOR }).username).toBe(ANONYMOUS_PROFILE);
    expect(normalizePublicProfile({ id: CREATOR, username: '  ' }).username).toBe(ANONYMOUS_PROFILE);
  });
});

describe('communityMetaDescription', () => {
  it('prefers the author’s own story', () => {
    const recipe = normalizeCommunityRecipe(validRow());
    expect(communityMetaDescription(recipe)).toBe('Built for the last hour of a long night.');
  });

  it('describes the actual build when there is no story, rather than inventing one', () => {
    const recipe = normalizeCommunityRecipe(validRow({ story: null }));
    const description = communityMetaDescription(recipe);

    expect(description).toContain('Mezcal');
    expect(description).toContain('nightjar');
    expect(description).toContain('coupe glass');
  });

  it('still produces a shareable line for a recipe with nothing in it', () => {
    const recipe = normalizeCommunityRecipe({ id: 'x', name: 'Ghost' });
    expect(communityMetaDescription(recipe)).toBe(`A community creation by ${ANONYMOUS_AUTHOR} on Liquid Lore.`);
  });

  it('stays inside the length a share card will show', () => {
    const recipe = normalizeCommunityRecipe(validRow({ story: 'x'.repeat(600) }));
    expect(communityMetaDescription(recipe)).toHaveLength(200);
  });
});

describe('profileMetaDescription', () => {
  const profile = normalizePublicProfile({ id: CREATOR, username: 'nightjar' });

  it('prefers the bio', () => {
    const withBio = normalizePublicProfile({ id: CREATOR, username: 'nightjar', bio: 'Mostly agave.' });
    expect(profileMetaDescription(withBio, 4)).toBe('Mostly agave.');
  });

  it('counts published recipes when there is no bio, and gets the plural right', () => {
    expect(profileMetaDescription(profile, 1)).toContain('1 signature recipe');
    expect(profileMetaDescription(profile, 4)).toContain('4 signature recipes');
  });

  it('says nothing about counts for a profile that has published nothing', () => {
    expect(profileMetaDescription(profile, 0)).toBe('nightjar on Liquid Lore.');
  });
});

describe('sanitizeSearchTerm', () => {
  it('passes ordinary searches through unchanged', () => {
    expect(sanitizeSearchTerm('mezcal')).toBe('mezcal');
    expect(sanitizeSearchTerm('  old fashioned  ')).toBe('old fashioned');
  });

  it('strips the characters that would restructure a PostgREST or() filter', () => {
    // A comma would start a new filter clause and `)` would close the group early.
    expect(sanitizeSearchTerm('gin,story.ilike.*')).toBe('gin story.ilike.');
    expect(sanitizeSearchTerm('a)or(b')).toBe('a or b');
    expect(sanitizeSearchTerm('100%')).toBe('100');
  });

  it('returns an empty term for anything unsearchable, which callers read as "no filter"', () => {
    expect(sanitizeSearchTerm('')).toBe('');
    expect(sanitizeSearchTerm('   ')).toBe('');
    expect(sanitizeSearchTerm(undefined)).toBe('');
    expect(sanitizeSearchTerm(['a', 'b'])).toBe('');
  });

  it('bounds the length of the term it will pass on', () => {
    expect(sanitizeSearchTerm('x'.repeat(500))).toHaveLength(80);
  });
});
