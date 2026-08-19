/**
 * tests/cabinet.test.ts
 *
 * Cabinet normalization is a migration path: existing users have display strings ("Gin",
 * "Lime Juice") stored in localStorage and in `profiles.cabinet`. If normalization drops
 * or mangles them, a real user opens the app to an empty bar. That is the case these
 * tests protect.
 */

import { describe, it, expect } from 'vitest';
import { normalizeCabinet, mergeCabinets } from '../lib/cabinet';

describe('normalizeCabinet', () => {
  it('upgrades legacy display names to canonical slugs', () => {
    const legacy = ['Gin', 'Lime Juice', 'Sweet Vermouth', 'Angostura Bitters', 'Campari'];
    expect(normalizeCabinet(legacy)).toEqual([
      'gin', 'lime-juice', 'sweet-vermouth', 'angostura-bitters', 'campari',
    ]);
  });

  it('leaves an already-canonical cabinet untouched', () => {
    const current = ['gin', 'campari', 'sweet-vermouth'];
    expect(normalizeCabinet(current)).toEqual(current);
  });

  it('handles a mixed cabinet saved across the format change', () => {
    expect(normalizeCabinet(['gin', 'Lime Juice'])).toEqual(['gin', 'lime-juice']);
  });

  it('collapses entries that resolve to the same ingredient', () => {
    // "Gin" and "London Dry Gin" are one bottle, and must not become two rows.
    expect(normalizeCabinet(['Gin', 'London Dry Gin', 'gin'])).toEqual(['gin']);
  });

  it('drops entries nothing can be done with', () => {
    // Keeping them would mean a cabinet row that can never match and can never be explained.
    expect(normalizeCabinet(['Gin', 'Kool-Aid', ''])).toEqual(['gin']);
  });

  it('survives junk input instead of throwing', () => {
    expect(normalizeCabinet(null)).toEqual([]);
    expect(normalizeCabinet(undefined)).toEqual([]);
    expect(normalizeCabinet('not an array')).toEqual([]);
    expect(normalizeCabinet([1, 2, null, {}])).toEqual([]);
  });
});

describe('mergeCabinets', () => {
  it('unions local and remote so signing in never loses a guest cabinet', () => {
    expect(mergeCabinets(['gin'], ['campari']).sort()).toEqual(['campari', 'gin']);
  });

  it('keeps the local cabinet when there is no remote one', () => {
    expect(mergeCabinets(['gin'], null)).toEqual(['gin']);
  });

  it('does not let an empty local cabinet wipe the cloud one', () => {
    // Signing in on a fresh device must not clear the user's bar.
    expect(mergeCabinets([], ['gin', 'campari'])).toEqual(['gin', 'campari']);
  });

  it('does not duplicate ingredients present in both', () => {
    expect(mergeCabinets(['gin'], ['gin', 'campari']).sort()).toEqual(['campari', 'gin']);
  });
});
