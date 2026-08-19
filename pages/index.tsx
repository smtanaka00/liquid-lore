/**
 * pages/index.tsx
 *
 * The home screen: stock your bar on the left, see what you can make on the right.
 *
 * This page holds no business logic and no recipe data. It reads the ingredient catalogue
 * and the cabinet match from `/api`, and delegates cabinet persistence to lib/cabinet.
 * The previous version imported a 2 MB recipe module and ran the matching engine in the
 * browser on every keystroke; the library now stays server-side.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { LogIn, LogOut, Search, Plus, X, Sparkles, Moon, Sun, Wine, Check, CloudOff } from 'lucide-react';
import { useTheme } from 'next-themes';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { Auth } from '../components/Auth';
import { DrinkCard } from '../components/DrinkCard';
import {
  fetchCocktails, fetchIngredients, fetchCabinetMatch,
  type IngredientCatalogue, type IngredientOption, type CabinetMatchResult,
} from '../lib/api-client';
import { readLocalCabinet, saveCabinet, fetchRemoteCabinet, mergeCabinets } from '../lib/cabinet';
import { labelFor, categoryFor } from '../lib/domain/ingredient-taxonomy';
import type { CocktailSummary } from '../lib/domain/types';

const EMPTY_MATCH: CabinetMatchResult = {
  ready: [], nearMisses: [], reachable: [], maximizers: [],
  cabinetSize: 0, unknown: [], degraded: false,
};

/** Below this, results are too thin to be interesting — show the stocking screen instead. */
const MIN_CABINET_FOR_RESULTS = 2;

export default function Home() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const [session, setSession] = useState<any>(null);
  const [showAuth, setShowAuth] = useState(false);

  const [cabinet, setCabinet] = useState<string[]>([]);
  const [cabinetLoaded, setCabinetLoaded] = useState(false);
  const [catalogue, setCatalogue] = useState<IngredientCatalogue>({ groups: [], essentials: [], degraded: false });
  const [match, setMatch] = useState<CabinetMatchResult>(EMPTY_MATCH);
  const [matching, setMatching] = useState(false);

  const [classics, setClassics] = useState<CocktailSummary[]>([]);
  const [flavors, setFlavors] = useState<Array<{ tag: string; count: number }>>([]);
  const [activeFlavor, setActiveFlavor] = useState<string | null>(null);

  const [searchMode, setSearchMode] = useState<'ingredient' | 'recipe'>('ingredient');
  const [searchQuery, setSearchQuery] = useState('');
  const [recipeResults, setRecipeResults] = useState<CocktailSummary[]>([]);
  // `null` until the cabinet has loaded and we can decide which screen a returning user
  // should land on. Once set, only an explicit click changes it — ticking a bottle must
  // never yank someone out of the stocking screen mid-selection.
  const [isStocking, setIsStocking] = useState<boolean | null>(null);

  useEffect(() => setMounted(true), []);

  /**
   * Union the cloud cabinet with whatever this browser has, then write the result back.
   * Signing in must never cost a user the bottles they added as a guest.
   */
  const syncFromCloud = useCallback(async (userId: string) => {
    const remote = await fetchRemoteCabinet(userId);
    const merged = mergeCabinets(readLocalCabinet(), remote);
    setCabinet(merged);
    await saveCabinet(merged, userId);
  }, []);

  // ── bootstrap ───────────────────────────────────────────────────────────────

  useEffect(() => {
    // Local cabinet first, so the sidebar paints without waiting on the network.
    const stored = readLocalCabinet();
    setCabinet(stored);
    setCabinetLoaded(true);
    // A returning user with a stocked bar goes straight to results; a new one starts by
    // stocking. Decided once, here, so a later toggle can't move the goalposts mid-selection.
    setIsStocking(stored.length < MIN_CABINET_FOR_RESULTS);

    fetchIngredients().then(setCatalogue);
    fetchCocktails({ classic: true, limit: 6 }).then(res => {
      setClassics(res.cocktails);
      setFlavors(res.flavors);
    });

    if (!isSupabaseConfigured) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) void syncFromCloud(data.session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) void syncFromCloud(next.user.id);
    });

    return () => subscription.unsubscribe();
  }, [syncFromCloud]);

  // ── matching ────────────────────────────────────────────────────────────────

  // A ref, not state: it exists only to cancel the in-flight request, and putting it in
  // state would re-render on every keystroke for no visible benefit.
  const matchAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!cabinetLoaded) return;

    if (cabinet.length === 0) {
      setMatch(EMPTY_MATCH);
      return;
    }

    matchAbort.current?.abort();
    const controller = new AbortController();
    matchAbort.current = controller;

    setMatching(true);
    const timer = setTimeout(() => {
      fetchCabinetMatch(cabinet, controller.signal).then(result => {
        if (controller.signal.aborted) return;
        setMatch(result);
        setMatching(false);
      });
    }, 180); // absorbs a burst of toggles into a single request

    return () => { clearTimeout(timer); controller.abort(); };
  }, [cabinet, cabinetLoaded]);

  // ── search ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (searchMode !== 'recipe' || !searchQuery.trim()) {
      setRecipeResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchCocktails({ query: searchQuery, limit: 8, signal: controller.signal })
        .then(res => setRecipeResults(res.cocktails));
    }, 250);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [searchQuery, searchMode]);

  /** Ingredient autocomplete runs against the already-loaded catalogue — no round trip. */
  const ingredientSuggestions = useMemo<IngredientOption[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (searchMode !== 'ingredient' || !q) return [];

    return catalogue.groups
      .flatMap(g => g.items)
      .filter(item => item.label.toLowerCase().includes(q) && !cabinet.includes(item.slug))
      .slice(0, 8);
  }, [searchQuery, searchMode, catalogue, cabinet]);

  // ── cabinet mutation ────────────────────────────────────────────────────────

  const toggleIngredient = useCallback((slug: string) => {
    setCabinet(prev => {
      const next = prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug];
      void saveCabinet(next, session?.user?.id ?? null);
      return next;
    });
  }, [session]);

  const addAll = useCallback((slugs: string[]) => {
    setCabinet(prev => {
      const next = Array.from(new Set([...prev, ...slugs]));
      void saveCabinet(next, session?.user?.id ?? null);
      return next;
    });
  }, [session]);

  // ── derived view state ──────────────────────────────────────────────────────

  /** The cabinet grouped for display, using the taxonomy for labels and categories. */
  const cabinetByCategory = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const slug of cabinet) {
      const category = categoryFor(slug);
      const list = groups.get(category) ?? [];
      list.push(slug);
      groups.set(category, list);
    }
    return Array.from(groups.entries())
      .map(([category, slugs]) => ({
        category,
        slugs: slugs.sort((a, b) => labelFor(a).localeCompare(labelFor(b))),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [cabinet]);

  const matchesFlavor = useCallback(
    (drink: CocktailSummary) => !activeFlavor || drink.flavorProfiles.includes(activeFlavor),
    [activeFlavor]
  );

  const readyFiltered = match.ready.filter(matchesFlavor);
  const nearFiltered = match.nearMisses.filter(m => matchesFlavor(m.recipe));
  const reachableFiltered = match.reachable.filter(m => matchesFlavor(m.recipe));

  const showStocking = isStocking === true;

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground p-6 relative transition-colors duration-300">
      <Head>
        <title>Liquid Lore — What can you make tonight?</title>
        <meta
          name="description"
          content="Tell Liquid Lore what's on your shelf and it tells you what you can pour, what you're one bottle away from, and the story behind each drink."
        />
      </Head>

      {showAuth && <Auth onLogin={() => setShowAuth(false)} />}

      <header className="max-w-6xl mx-auto mb-16 pt-10 flex flex-wrap gap-6 justify-between items-start">
        <div>
          <h1 className="text-6xl font-serif text-primary tracking-tighter">Liquid Lore</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <p className="text-muted-foreground uppercase tracking-[0.4em] text-[10px] font-bold">
              The Premium Mixology Suite
            </p>
            <span className="w-1 h-1 rounded-full bg-border" />
            <p className="text-primary/60 uppercase tracking-[0.2em] text-[9px] font-bold">
              Every recipe verified
            </p>
          </div>
        </div>

        <nav className="flex items-center gap-6">
          <Link href="/lounge" className="text-muted-foreground hover:text-primary transition-colors text-sm font-bold uppercase tracking-widest">
            Lounge
          </Link>
          {session && (
            <>
              <Link href="/studio" className="text-muted-foreground hover:text-primary transition-colors text-sm font-bold uppercase tracking-widest">
                Studio
              </Link>
              <Link href="/profile" className="text-muted-foreground hover:text-primary transition-colors text-sm font-bold uppercase tracking-widest">
                Profile
              </Link>
            </>
          )}

          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle colour theme"
            className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"
          >
            {mounted && (theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />)}
          </button>

          {isSupabaseConfigured && (
            session ? (
              <button
                onClick={() => supabase.auth.signOut()}
                className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors text-sm font-bold uppercase tracking-widest"
              >
                <LogOut size={16} /> Sign Out
              </button>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors text-sm font-bold uppercase tracking-widest"
              >
                <LogIn size={16} /> Login
              </button>
            )
          )}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto grid lg:grid-cols-[320px_1fr] gap-12">
        {/* ── sidebar: the bar ─────────────────────────────────────────────── */}
        <aside className="space-y-8">
          {match.maximizers.length > 0 && (
            <section className="bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 p-6 rounded-[40px] shadow-xl">
              <h2 className="text-primary uppercase text-[10px] font-bold tracking-[0.2em] mb-2 flex items-center gap-2">
                <Sparkles size={12} /> Buy This Next
              </h2>
              <p className="text-[10px] text-muted-foreground mb-5 leading-relaxed">
                One bottle, ranked by how many new drinks it unlocks.
              </p>
              <ul className="space-y-4">
                {match.maximizers.slice(0, 3).map(suggestion => (
                  <li key={suggestion.slug} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-foreground text-sm font-medium">{suggestion.label}</p>
                      <p className="text-primary text-[9px] uppercase tracking-tight font-bold">
                        Unlocks {suggestion.unlocks} {suggestion.unlocks === 1 ? 'recipe' : 'recipes'}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {suggestion.examples.join(', ')}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleIngredient(suggestion.slug)}
                      aria-label={`Add ${suggestion.label} to your bar`}
                      className="p-1.5 hover:bg-primary hover:text-primary-foreground rounded-full border border-border transition-all shadow-sm flex-shrink-0"
                    >
                      <Plus size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="bg-card border border-border p-6 rounded-3xl shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-primary font-serif text-2xl flex items-center gap-2">
                <Wine size={24} /> Your Bar
              </h2>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                {cabinet.length} stocked
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-6">
              {session ? 'Synced to your account' : 'Saved in this browser'}
            </p>

            <div className="flex bg-muted rounded-xl p-1 mb-6">
              <button
                onClick={() => { setSearchMode('ingredient'); setSearchQuery(''); }}
                className={`flex-1 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${searchMode === 'ingredient' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'}`}
              >
                Add Bottles
              </button>
              <button
                onClick={() => { setSearchMode('recipe'); setSearchQuery(''); }}
                className={`flex-1 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${searchMode === 'recipe' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'}`}
              >
                Find a Drink
              </button>
            </div>

            <div className="relative mb-8">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input
                type="search"
                aria-label={searchMode === 'ingredient' ? 'Search ingredients' : 'Search recipes'}
                placeholder={searchMode === 'ingredient' ? 'Gin, Campari, lime…' : 'Negroni, Daiquiri…'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-background border border-border rounded-xl py-3 pl-10 pr-4 text-xs focus:ring-2 focus:ring-primary outline-none transition-all shadow-sm"
              />

              {ingredientSuggestions.length > 0 && (
                <ul className="absolute top-full left-0 w-full mt-2 bg-popover border border-border rounded-xl overflow-hidden z-30 shadow-2xl">
                  {ingredientSuggestions.map(item => (
                    <li key={item.slug}>
                      <button
                        onClick={() => { toggleIngredient(item.slug); setSearchQuery(''); }}
                        className="w-full text-left px-4 py-3 text-xs hover:bg-muted transition-colors flex items-center justify-between gap-2 group"
                      >
                        <span>{item.label}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-[9px] text-muted-foreground">{item.recipes}</span>
                          <Plus size={14} className="text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {searchMode === 'recipe' && recipeResults.length > 0 && (
                <ul className="absolute top-full left-0 w-full mt-2 bg-popover border border-border rounded-xl overflow-hidden z-30 shadow-2xl max-h-[400px] overflow-y-auto">
                  {recipeResults.map(drink => (
                    <li key={drink.id}>
                      <Link
                        href={`/drink/${drink.slug}`}
                        className="w-full text-left px-4 py-3 text-xs hover:bg-muted transition-colors flex items-center gap-3 border-b border-border last:border-0"
                      >
                        <span className="w-8 h-8 rounded-full bg-muted overflow-hidden flex-shrink-0">
                          {drink.image && <img src={drink.image} alt="" className="w-full h-full object-cover" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="font-bold block truncate">{drink.name}</span>
                          {drink.hasLore && (
                            <span className="text-[8px] text-primary uppercase font-bold tracking-widest">✨ Lore</span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {cabinet.length === 0 ? (
              <div className="py-8 text-center border-2 border-dashed border-border rounded-2xl">
                <p className="text-[10px] text-muted-foreground italic px-4">
                  Your bar is empty. Add a few bottles and Liquid Lore will do the rest.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {cabinetByCategory.map(({ category, slugs }) => (
                  <div key={category} className="space-y-2">
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                      {category}
                    </h3>
                    <ul className="space-y-1.5">
                      {slugs.map(slug => (
                        <li
                          key={slug}
                          className="group flex items-center justify-between p-2.5 rounded-2xl bg-muted/50 border border-transparent hover:border-border hover:bg-muted transition-all"
                        >
                          <span className="flex items-center gap-3 text-xs text-foreground">
                            <Check size={12} strokeWidth={4} className="text-primary" />
                            {labelFor(slug)}
                          </span>
                          <button
                            onClick={() => toggleIngredient(slug)}
                            aria-label={`Remove ${labelFor(slug)} from your bar`}
                            className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
                          >
                            <X size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {catalogue.essentials.length > 0 && (
              <div className="mt-10 pt-6 border-t border-border">
                <h3 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-4">
                  Quick Stock
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {catalogue.essentials
                    .filter(item => !cabinet.includes(item.slug))
                    .slice(0, 10)
                    .map(item => (
                      <button
                        key={item.slug}
                        onClick={() => toggleIngredient(item.slug)}
                        className="px-2.5 py-1.5 rounded-lg text-[9px] border border-border text-muted-foreground hover:border-primary hover:text-primary transition-all bg-muted/20"
                      >
                        {item.label}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {cabinet.length > 0 && (
              <button
                onClick={() => setIsStocking(current => !current)}
                className="mt-8 w-full py-3 rounded-xl border border-border text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary hover:border-primary/50 transition-all"
              >
                {isStocking ? 'Done Stocking' : 'Browse All Ingredients'}
              </button>
            )}
          </section>
        </aside>

        {/* ── results ──────────────────────────────────────────────────────── */}
        <section>
          {showStocking ? (
            <StockingScreen
              catalogue={catalogue}
              cabinet={cabinet}
              onToggle={toggleIngredient}
              onDone={() => setIsStocking(false)}
              signedIn={Boolean(session)}
              onSignIn={() => setShowAuth(true)}
              canSignIn={isSupabaseConfigured}
            />
          ) : (
            <>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                  <h2 className="text-3xl font-serif text-foreground">Tonight&rsquo;s Options</h2>
                  <p className="text-muted-foreground text-xs mt-1">
                    {match.ready.length} ready · {match.nearMisses.length} one bottle away
                  </p>
                </div>

                {flavors.length > 0 && (
                  <div className="flex flex-wrap gap-1 bg-muted border border-border rounded-full p-1 shadow-inner">
                    <FlavorChip label="All" active={!activeFlavor} onClick={() => setActiveFlavor(null)} />
                    {/* Chips come from the library's real vocabulary, so none of them can
                        match zero recipes the way the old hardcoded "Strong" chip did. */}
                    {flavors.slice(0, 6).map(({ tag }) => (
                      <FlavorChip
                        key={tag}
                        label={tag}
                        active={activeFlavor === tag}
                        onClick={() => setActiveFlavor(activeFlavor === tag ? null : tag)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {match.degraded && (
                <p className="mb-8 flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                  <CloudOff size={12} /> Offline library
                </p>
              )}

              <div className="space-y-16">
                {matching && match.ready.length === 0 && (
                  <p className="text-primary text-sm animate-pulse flex items-center gap-2">
                    <Sparkles size={14} /> Checking your bar…
                  </p>
                )}

                {readyFiltered.length > 0 && (
                  <ResultGroup
                    title="Ready to Make"
                    dotClass="bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"
                    count={readyFiltered.length}
                  >
                    {readyFiltered.slice(0, 24).map(drink => <DrinkCard key={drink.id} drink={drink} />)}
                  </ResultGroup>
                )}

                {nearFiltered.length > 0 && (
                  <ResultGroup
                    title="One Bottle Away"
                    dotClass="bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]"
                    count={nearFiltered.length}
                  >
                    {nearFiltered.slice(0, 12).map(({ recipe, missing }) => (
                      <DrinkCard
                        key={recipe.id}
                        drink={recipe}
                        missing={missing.map(labelFor)}
                        onAddMissing={() => addAll(missing)}
                      />
                    ))}
                  </ResultGroup>
                )}

                {reachableFiltered.length > 0 && (
                  <ResultGroup
                    title="Within Reach"
                    dotClass="bg-muted-foreground/40"
                    count={reachableFiltered.length}
                  >
                    {reachableFiltered.slice(0, 9).map(({ recipe, missing }) => (
                      <DrinkCard key={recipe.id} drink={recipe} missing={missing.map(labelFor)} />
                    ))}
                  </ResultGroup>
                )}

                {!matching && readyFiltered.length === 0 && nearFiltered.length === 0 && reachableFiltered.length === 0 && (
                  <div className="py-20 text-center text-muted-foreground border border-dashed border-border rounded-[40px] bg-card">
                    <p className="font-serif italic text-lg mb-2">
                      {activeFlavor
                        ? `Nothing ${activeFlavor} with what you have.`
                        : 'Nothing matches your bar yet.'}
                    </p>
                    <p className="text-xs">
                      {activeFlavor ? 'Try another flavour, or add a bottle.' : 'Add a couple more bottles to open things up.'}
                    </p>
                  </div>
                )}

                {classics.length > 0 && (
                  <div className="pt-16 border-t border-border">
                    <h2 className="text-primary uppercase text-xs font-bold tracking-widest mb-2 flex items-center gap-2">
                      <Sparkles size={14} /> Regardless of your bar
                    </h2>
                    <h3 className="text-4xl font-serif text-foreground mb-2">The Classics</h3>
                    <p className="text-muted-foreground text-sm mb-8 max-w-md">
                      IBA-recognised standards and the drinks worth learning first.
                    </p>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {classics.map(drink => <DrinkCard key={drink.id} drink={drink} />)}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────

function FlavorChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
        active ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function ResultGroup({
  title, dotClass, count, children,
}: { title: string; dotClass: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-primary uppercase text-[10px] font-bold tracking-[0.2em] mb-4 flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${dotClass}`} />
        {title}
        <span className="text-muted-foreground">({count})</span>
      </h3>
      <div className="grid md:grid-cols-2 gap-6">{children}</div>
    </div>
  );
}

function StockingScreen({
  catalogue, cabinet, onToggle, onDone, signedIn, onSignIn, canSignIn,
}: {
  catalogue: IngredientCatalogue;
  cabinet: string[];
  onToggle: (slug: string) => void;
  onDone: () => void;
  signedIn: boolean;
  onSignIn: () => void;
  canSignIn: boolean;
}) {
  return (
    <div className="space-y-12">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="text-5xl font-serif text-foreground mb-4">Stock Your Bar</h2>
        <p className="text-muted-foreground leading-relaxed">
          Tick what you actually own. Liquid Lore matches your shelf against every recipe in
          the library — including near misses, so you always know what one more bottle buys you.
        </p>
      </div>

      {catalogue.groups.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground animate-pulse">Loading the catalogue…</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-8">
          {catalogue.groups.map(group => (
            <section key={group.category} className="bg-card border border-border p-8 rounded-[40px] shadow-sm">
              <h3 className="text-primary uppercase text-[10px] font-bold tracking-[0.3em] mb-6 flex items-center gap-2">
                <Sparkles size={14} /> {group.category}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {/* Top 12 per category, ordered by how many recipes use them. The long tail
                    is reachable through search; a wall of 40 checkboxes is where people quit. */}
                {group.items.slice(0, 12).map(item => {
                  const owned = cabinet.includes(item.slug);
                  return (
                    <button
                      key={item.slug}
                      onClick={() => onToggle(item.slug)}
                      aria-pressed={owned}
                      className={`text-left p-3.5 rounded-2xl border transition-all text-xs flex items-center justify-between gap-2 ${
                        owned
                          ? 'bg-primary border-primary text-primary-foreground shadow-lg'
                          : 'bg-background border-border text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      <span className="font-medium truncate">{item.label}</span>
                      {owned
                        ? <Check size={14} className="flex-shrink-0" />
                        : <span className="text-[9px] opacity-60 flex-shrink-0">{item.recipes}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="flex flex-col items-center gap-6 pt-12 border-t border-border">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${cabinet.length >= MIN_CABINET_FOR_RESULTS ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-muted'}`} />
          <p className="text-sm font-medium">{cabinet.length} selected</p>
        </div>

        <button
          onClick={onDone}
          disabled={cabinet.length === 0}
          className="px-10 py-5 bg-primary text-primary-foreground rounded-2xl font-bold uppercase tracking-widest text-sm shadow-xl shadow-primary/20 hover:scale-105 transition-all disabled:opacity-40 disabled:hover:scale-100"
        >
          Show Me What I Can Make
        </button>

        {!signedIn && canSignIn && (
          <button
            onClick={onSignIn}
            className="text-muted-foreground hover:text-primary text-[10px] font-bold uppercase tracking-widest border-b border-transparent hover:border-primary transition-all"
          >
            Sign in to keep your bar on every device
          </button>
        )}
      </div>
    </div>
  );
}
