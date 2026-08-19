/**
 * lib/domain/measures.ts
 *
 * Parsing and converting the amounts printed on a recipe.
 *
 * WHY THIS EXISTS
 * The old converter did `parseFloat` on the numeric part of a measure. The library writes
 * amounts as unicode fractions — `¾ oz`, `1½ oz` — and `parseFloat('¾')` is `NaN`, so the
 * ml and parts toggles silently did nothing on most of the library while appearing to work.
 *
 * Pure and dependency-free, so the conversion table is unit-testable on its own.
 *
 * Usage:
 *     convertMeasure('1½ oz', 'ml')     // -> '45 ml'
 *     convertMeasure('¾ oz', 'parts')   // -> '0.75 parts'
 *     convertMeasure('2 dashes', 'ml')  // -> '2 dashes'   (nothing to convert)
 */

export type MeasureUnit = 'oz' | 'ml' | 'parts';

/** Unicode vulgar fractions that appear in recipe text. */
const VULGAR_FRACTIONS: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅐': 1 / 7, '⅛': 0.125, '⅜': 0.375,
  '⅝': 0.625, '⅞': 0.875, '⅑': 1 / 9, '⅒': 0.1,
};

/** The bartending convention, not the pharmacist's 29.5735 — recipes are written in 30s. */
const ML_PER_OZ = 30;
const ML_PER_CL = 10;

/**
 * Read a quantity out of the front of a measure string.
 *
 * Handles plain decimals ("1.5"), ASCII fractions ("3/4"), unicode fractions ("¾"),
 * mixed forms ("1½", "1 1/2") and ranges ("1-2", where the lower bound is used).
 *
 * Returns: `{ value, rest }` where `rest` is everything after the number, or `null` when
 * the string does not begin with a quantity at all ("to taste", "splash").
 */
export function parseQuantity(measure: string): { value: number; rest: string } | null {
  if (!measure) return null;

  const trimmed = measure.trim();
  // Leading run of digits, dots, slashes, hyphens, spaces and vulgar fractions.
  const match = trimmed.match(/^([\d./\-\s¼-¾⅐-⅞]+)(.*)$/);
  if (!match) return null;

  const [, numericPart, rest] = match;
  const value = evaluateQuantity(numericPart);
  if (value === null) return null;

  return { value, rest: rest.trim() };
}

function evaluateQuantity(raw: string): number | null {
  // A range ("1-2 dashes") converts on its lower bound; showing "1-2" converted to a
  // single number would misrepresent the recipe.
  const text = raw.split('-')[0].trim();
  if (!text) return null;

  let total = 0;
  let sawNumber = false;

  for (const token of text.split(/\s+/)) {
    if (!token) continue;

    // A token can mix an integer and a vulgar fraction with no space: "1½".
    let remainder = token;
    for (const [glyph, fractionValue] of Object.entries(VULGAR_FRACTIONS)) {
      if (remainder.includes(glyph)) {
        total += fractionValue;
        sawNumber = true;
        remainder = remainder.split(glyph).join('');
      }
    }
    if (!remainder) continue;

    if (remainder.includes('/')) {
      const [numerator, denominator] = remainder.split('/');
      const n = Number.parseFloat(numerator);
      const d = Number.parseFloat(denominator);
      if (Number.isFinite(n) && Number.isFinite(d) && d !== 0) {
        total += n / d;
        sawNumber = true;
      }
      continue;
    }

    const plain = Number.parseFloat(remainder);
    if (Number.isFinite(plain)) {
      total += plain;
      sawNumber = true;
    }
  }

  return sawNumber ? total : null;
}

/** Round to at most two decimals and drop a trailing `.0`. */
function tidy(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * Render a measure in the requested unit.
 *
 * Only volume units convert. Dashes, barspoons, leaves, pinches and "to taste" are
 * returned untouched — converting "2 dashes" to millilitres would be false precision.
 *
 * Returns: the converted string, or the original when there is nothing to convert. Never
 * throws and never returns an empty string for non-empty input.
 */
export function convertMeasure(measure: string, unit: MeasureUnit): string {
  if (!measure) return measure;

  const parsed = parseQuantity(measure);
  if (!parsed) return measure;

  const { value, rest } = parsed;
  const lower = rest.toLowerCase();

  let ounces: number | null = null;
  if (/^oz\b/.test(lower)) ounces = value;
  else if (/^cl\b/.test(lower)) ounces = (value * ML_PER_CL) / ML_PER_OZ;
  else if (/^ml\b/.test(lower)) ounces = value / ML_PER_OZ;

  // Not a volume we recognise — leave the recipe's own wording alone.
  if (ounces === null) return measure;

  // Whatever followed the unit ("oz (chilled)") is preserved.
  const suffix = rest.replace(/^(oz|cl|ml)\b\.?/i, '').trim();
  const tail = suffix ? ` ${suffix}` : '';

  switch (unit) {
    case 'ml':
      return `${Math.round(ounces * ML_PER_OZ)} ml${tail}`;
    case 'parts':
      return `${tidy(ounces)} ${ounces === 1 ? 'part' : 'parts'}${tail}`;
    case 'oz':
    default:
      return `${tidy(ounces)} oz${tail}`;
  }
}

/**
 * Whether any ingredient in the list carries a convertible volume.
 *
 * Used to hide the unit toggle on recipes where it would be inert — a control that never
 * changes anything reads as broken.
 */
export function hasConvertibleMeasures(measures: string[]): boolean {
  return measures.some(measure => {
    const parsed = parseQuantity(measure);
    return parsed !== null && /^(oz|cl|ml)\b/i.test(parsed.rest);
  });
}
