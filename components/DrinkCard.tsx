/**
 * components/DrinkCard.tsx
 *
 * The recipe tile used across the home screen and browse grids.
 *
 * Extracted from a bare render function in pages/index.tsx so that the "one bottle away"
 * treatment — naming the missing ingredient and offering to add it — lives in one place
 * rather than being duplicated per result section.
 *
 * Usage:
 *     <DrinkCard drink={summary} />
 *     <DrinkCard drink={summary} missing={['Dry Vermouth']} onAddMissing={handler} />
 */

import Link from 'next/link';
import { Sparkles, Plus } from 'lucide-react';
import type { CocktailSummary } from '../lib/domain/types';

interface DrinkCardProps {
  drink: CocktailSummary;
  /** Display labels of ingredients the user is short. Renders the near-miss treatment. */
  missing?: string[];
  /** Adds every missing ingredient to the cabinet. Omit to hide the shortcut. */
  onAddMissing?: () => void;
}

export function DrinkCard({ drink, missing, onAddMissing }: DrinkCardProps) {
  const isNearMiss = Boolean(missing && missing.length > 0);

  return (
    <article className="relative group">
      <Link href={`/drink/${drink.slug}`} className="block">
        <div className="relative overflow-hidden rounded-3xl aspect-[4/5] bg-card border border-border shadow-sm group-hover:shadow-2xl group-hover:shadow-primary/10 transition-all duration-500">
          {drink.image ? (
            <img
              src={drink.image}
              alt={drink.name}
              loading="lazy"
              className="w-full h-full object-cover grayscale group-hover:grayscale-0 scale-100 group-hover:scale-105 transition-all duration-700"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-tr from-zinc-900 to-amber-900/20" />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent opacity-70 group-hover:opacity-95 transition-opacity" />

          <div className="absolute bottom-0 w-full p-6">
            <h3 className="text-xl font-serif text-white group-hover:text-primary transition-colors">
              {drink.name}
            </h3>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              {drink.isClassic && (
                <span className="text-primary text-[9px] uppercase font-bold tracking-widest">
                  Classic
                </span>
              )}
              {drink.hasLore && (
                <span className="text-primary text-[9px] uppercase font-bold tracking-widest flex items-center gap-1">
                  <Sparkles size={10} /> Lore
                </span>
              )}
              {drink.flavorProfiles.slice(0, 2).map(tag => (
                <span key={tag} className="text-zinc-300 text-[9px] uppercase tracking-widest">
                  {tag}
                </span>
              ))}
            </div>

            {isNearMiss && (
              <p className="mt-3 text-[10px] text-amber-300 font-bold uppercase tracking-widest">
                Missing {missing!.join(' + ')}
              </p>
            )}
          </div>
        </div>
      </Link>

      {/* Rendered outside the Link: a button nested in an anchor is invalid markup and
          swallows keyboard activation. */}
      {isNearMiss && onAddMissing && (
        <button
          onClick={onAddMissing}
          aria-label={`Add ${missing!.join(' and ')} to your bar`}
          className="absolute top-4 right-4 p-2.5 rounded-full bg-black/60 border border-white/10 text-white hover:bg-primary hover:text-primary-foreground backdrop-blur-md shadow-xl transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          <Plus size={16} />
        </button>
      )}
    </article>
  );
}
