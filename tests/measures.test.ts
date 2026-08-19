/**
 * tests/measures.test.ts
 *
 * The old converter used `parseFloat`, so it produced `NaN` for every unicode fraction —
 * and the library is written in `¾ oz` and `1½ oz`. The unit toggle looked functional and
 * silently did nothing on most recipes. These tests pin the parsing table.
 */

import { describe, it, expect } from 'vitest';
import { parseQuantity, convertMeasure, hasConvertibleMeasures } from '../lib/domain/measures';

describe('parseQuantity', () => {
  it.each([
    ['2 oz', 2],
    ['1.5 oz', 1.5],
    ['¾ oz', 0.75],
    ['½ oz', 0.5],
    ['¼ oz', 0.25],
    ['1½ oz', 1.5],
    ['1¾ oz', 1.75],
    ['1 1/2 oz', 1.5],
    ['3/4 oz', 0.75],
    ['2 dashes', 2],
  ])('reads %s as %s', (input, expected) => {
    expect(parseQuantity(input)?.value).toBeCloseTo(expected, 5);
  });

  it('uses the lower bound of a range', () => {
    // "1-2 dashes" has no single correct conversion; the lower bound is honest.
    expect(parseQuantity('1-2 dashes')?.value).toBe(1);
  });

  it('returns null when there is no leading quantity', () => {
    expect(parseQuantity('to taste')).toBeNull();
    expect(parseQuantity('splash')).toBeNull();
    expect(parseQuantity('')).toBeNull();
  });
});

describe('convertMeasure — volumes', () => {
  it.each([
    ['2 oz', 'ml', '60 ml'],
    ['¾ oz', 'ml', '23 ml'],
    ['1½ oz', 'ml', '45 ml'],
    ['3 cl', 'ml', '30 ml'],
    ['30 ml', 'oz', '1 oz'],
    ['2 oz', 'parts', '2 parts'],
    ['¾ oz', 'parts', '0.75 parts'],
    ['1 oz', 'parts', '1 part'],
  ] as const)('%s in %s is %s', (input, unit, expected) => {
    expect(convertMeasure(input, unit)).toBe(expected);
  });

  it('is a no-op when the requested unit is already in use', () => {
    expect(convertMeasure('2 oz', 'oz')).toBe('2 oz');
  });

  it('preserves any trailing qualifier', () => {
    expect(convertMeasure('1 oz (chilled)', 'ml')).toBe('30 ml (chilled)');
  });
});

describe('convertMeasure — leaves non-volumes alone', () => {
  it.each([
    ['2 dashes', 'ml'],
    ['1 pinch', 'ml'],
    ['10-12 leaves', 'oz'],
    ['to taste', 'ml'],
    ['1 (optional)', 'parts'],
  ] as const)('%s is returned unchanged', (input, unit) => {
    // Converting "2 dashes" into millilitres would be false precision.
    expect(convertMeasure(input, unit)).toBe(input);
  });

  it('handles empty input without throwing', () => {
    expect(convertMeasure('', 'ml')).toBe('');
  });
});

describe('hasConvertibleMeasures', () => {
  it('is true when at least one measure is a volume', () => {
    expect(hasConvertibleMeasures(['2 oz', '2 dashes'])).toBe(true);
  });

  it('is false when nothing can convert, so the toggle can be hidden', () => {
    expect(hasConvertibleMeasures(['2 dashes', '1 pinch', 'to taste'])).toBe(false);
    expect(hasConvertibleMeasures([])).toBe(false);
  });
});
