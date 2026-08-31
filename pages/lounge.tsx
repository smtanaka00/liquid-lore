/**
 * pages/lounge.tsx
 *
 * The community feed of recipes published from the Creator Studio.
 *
 * The feed itself comes from `/api/lounge` rather than a `custom_recipes` query in this
 * component. That move is what makes search and pagination possible — the previous version
 * pulled a fixed 60 rows and had no total to page against — and it keeps the author-name
 * join on the server, where the raw `creator_id` can no longer leak into the UI.
 *
 * Likes and favourites still go direct to Supabase from here, and must: both are writes
 * that depend on the signed-in user's session, which lives in this browser and not in the
 * API route. Likes go through the `toggle_recipe_like` RPC rather than a client-side
 * read-modify-write, which lost concurrent likes and let any client set the counter.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { ArrowLeft, Users, Heart, BookmarkPlus, User, Search, X, Loader2 } from 'lucide-react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { fetchLoungeFeed } from '../lib/api-client';
import type { CommunityRecipe } from '../lib/domain/community';

const PAGE_SIZE = 12;

/** Long enough that a typed word is one request, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 300;

export default function Lounge() {
    const router = useRouter();

    const [recipes, setRecipes] = useState<CommunityRecipe[]>([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [available, setAvailable] = useState(true);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const [search, setSearch] = useState('');
    const [activeSearch, setActiveSearch] = useState('');

    const [session, setSession] = useState<any>(null);
    const [likedRecipes, setLikedRecipes] = useState<string[]>([]);
    const [toast, setToast] = useState<string | null>(null);

    // Transient inline feedback. `alert()` blocks the main thread and looks like a browser
    // error dialog — the wrong register for "saved to favourites".
    const notify = useCallback((message: string) => {
        setToast(message);
        setTimeout(() => setToast(null), 2600);
    }, []);

    // ── session and likes ────────────────────────────────────────────────────
    // Per-user, so it stays client-side; the feed itself is public and comes from the API.

    useEffect(() => {
        if (!isSupabaseConfigured) return;

        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (!session) return;
            supabase.from('recipe_likes').select('recipe_id').eq('user_id', session.user.id).then(({ data }) => {
                if (data) setLikedRecipes(data.map(d => d.recipe_id));
            });
        });
    }, []);

    // ── the feed ─────────────────────────────────────────────────────────────

    useEffect(() => {
        const timer = setTimeout(() => setActiveSearch(search.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [search]);

    // A search that resolves after a newer one would overwrite it with stale results.
    const requestId = useRef(0);

    useEffect(() => {
        const id = ++requestId.current;
        setLoading(true);

        fetchLoungeFeed({ query: activeSearch, limit: PAGE_SIZE }).then(feed => {
            if (id !== requestId.current) return;
            setRecipes(feed.recipes);
            setTotal(feed.total);
            setHasMore(feed.hasMore);
            setAvailable(feed.available);
            setLoading(false);
        });
    }, [activeSearch]);

    const loadMore = async () => {
        setLoadingMore(true);
        const feed = await fetchLoungeFeed({
            query: activeSearch,
            limit: PAGE_SIZE,
            offset: recipes.length,
        });

        // De-duplicate by id: a recipe published between the two requests shifts the window
        // and would otherwise appear on both pages with the same React key.
        setRecipes(prev => {
            const seen = new Set(prev.map(r => r.id));
            return [...prev, ...feed.recipes.filter(r => !seen.has(r.id))];
        });
        setTotal(feed.total);
        setHasMore(feed.hasMore);
        setLoadingMore(false);
    };

    // ── likes and favourites ─────────────────────────────────────────────────

    const toggleLike = async (e: React.MouseEvent, recipeId: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!session) return notify('Sign in to like recipes');

        const wasLiked = likedRecipes.includes(recipeId);
        const previousRecipes = recipes;

        // Optimistic: the server is authoritative, but the heart should respond instantly.
        setLikedRecipes(prev => wasLiked ? prev.filter(id => id !== recipeId) : [...prev, recipeId]);
        setRecipes(prev => prev.map(r =>
            r.id === recipeId
                ? { ...r, likesCount: Math.max(0, r.likesCount + (wasLiked ? -1 : 1)) }
                : r
        ));

        const { data, error } = await supabase.rpc('toggle_recipe_like', { p_recipe_id: recipeId });

        if (error) {
            // Roll back to the last known-good state rather than leaving a phantom like.
            setLikedRecipes(prev => wasLiked ? [...prev, recipeId] : prev.filter(id => id !== recipeId));
            setRecipes(previousRecipes);
            notify('Could not save that like — try again');
            return;
        }

        // Reconcile against the authoritative count the function returned.
        const result = Array.isArray(data) ? data[0] : data;
        if (result) {
            setLikedRecipes(prev =>
                result.liked ? Array.from(new Set([...prev, recipeId])) : prev.filter(id => id !== recipeId)
            );
            setRecipes(prev => prev.map(r =>
                r.id === recipeId ? { ...r, likesCount: result.likes_count } : r
            ));
        }
    };

    const saveToFavorites = async (e: React.MouseEvent, recipeId: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!session) return notify('Sign in to save favourites');

        const { error } = await supabase
            .from('favorites')
            .insert({ user_id: session.user.id, drink_id: recipeId, kind: 'custom' });

        if (error) {
            notify(error.code === '23505' ? 'Already in your favourites' : 'Could not save that');
        } else {
            notify('Saved to your favourites');
        }
    };

    // ── render ───────────────────────────────────────────────────────────────

    const isSearching = activeSearch.length > 0;

    return (
        <div className="min-h-screen bg-background text-foreground p-6 pb-24 transition-colors duration-300">
            <header className="max-w-6xl mx-auto mb-12 pt-10 flex flex-col items-center text-center">
                <button onClick={() => router.push('/')} className="self-start flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors uppercase text-xs font-bold tracking-widest mb-8">
                    <ArrowLeft size={16} /> Back to Cabinet
                </button>
                <div className="inline-flex items-center justify-center p-4 bg-muted rounded-full mb-6 text-primary shadow-inner">
                    <Users size={32} />
                </div>
                <h1 className="text-5xl md:text-6xl font-serif text-primary tracking-tighter mb-4">The Lounge</h1>
                <p className="text-muted-foreground uppercase tracking-[0.3em] text-[10px] font-bold max-w-xl">Community Creations from around the world</p>
            </header>

            {/* Hidden when the feed is unavailable — a search box that cannot search is
                worse than no search box. */}
            <div className={`max-w-2xl mx-auto mb-14 ${available ? '' : 'hidden'}`}>
                <div className="relative">
                    <Search size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                        type="search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        aria-label="Search community recipes"
                        placeholder="Search creations by name or story…"
                        className="w-full bg-card border border-border rounded-2xl pl-14 pr-14 py-4 text-foreground placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-primary outline-none transition-all shadow-sm"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            aria-label="Clear search"
                            className="absolute right-5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-primary transition-colors"
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>

                {/* Announced politely so a screen reader hears the result count change
                    without the search field losing focus mid-typing. */}
                <p role="status" aria-live="polite" className="mt-4 text-center text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/70 h-4">
                    {loading ? '' : available && total > 0 ? `${total} creation${total === 1 ? '' : 's'}${isSearching ? ' found' : ''}` : ''}
                </p>
            </div>

            <main className="max-w-6xl mx-auto">
                {loading ? (
                    <div className="text-center py-20 text-primary animate-pulse flex items-center justify-center gap-3">
                        <Users size={20} /> Loading the feed...
                    </div>
                ) : !available ? (
                    <div className="text-center py-20 bg-card border border-border rounded-3xl shadow-sm max-w-lg mx-auto px-8">
                        <h3 className="text-xl font-serif text-foreground mb-2">The Lounge is offline</h3>
                        <p className="text-muted-foreground text-sm leading-relaxed">
                            Community features need a Supabase project. Add
                            {' '}<code className="text-primary font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and
                            {' '}<code className="text-primary font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
                            {' '}to <code className="text-primary font-mono text-xs">.env.local</code> to switch them on.
                            Browsing and your cabinet work without it.
                        </p>
                    </div>
                ) : recipes.length === 0 && isSearching ? (
                    <div className="text-center py-20 bg-card border border-border rounded-3xl shadow-sm">
                        <h3 className="text-xl font-serif text-foreground mb-2">Nothing matches &ldquo;{activeSearch}&rdquo;</h3>
                        <p className="text-muted-foreground mb-6">Try a shorter term, or browse the whole feed.</p>
                        <button onClick={() => setSearch('')} className="px-6 py-3 bg-muted text-foreground font-bold rounded-xl hover:bg-primary hover:text-primary-foreground transition-all uppercase tracking-widest text-[10px]">
                            Clear search
                        </button>
                    </div>
                ) : recipes.length === 0 ? (
                    <div className="text-center py-20 bg-card border border-border rounded-3xl shadow-sm">
                        <h3 className="text-xl font-serif text-foreground mb-2">It&apos;s quiet in here</h3>
                        <p className="text-muted-foreground mb-6">Be the first to create a custom drink in the Studio.</p>
                        <button onClick={() => router.push('/studio')} className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:scale-105 transition-all shadow-lg hover:shadow-primary/20">
                            Go to Creator Studio
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {recipes.map((recipe) => (
                                <div key={recipe.id} className="relative group">
                                    <Link href={`/custom-drink/${recipe.id}`} className="block">
                                        <div className="relative overflow-hidden rounded-3xl aspect-[4/5] bg-card border border-border flex flex-col justify-end p-8 transition-all duration-500 hover:border-primary/30 shadow-sm hover:shadow-2xl hover:shadow-primary/5">
                                            <div className="absolute inset-0 bg-gradient-to-tr from-black via-zinc-900/50 to-amber-900/10 grayscale group-hover:grayscale-0 transition-all duration-700 opacity-60" />
                                            <div className="relative z-10">
                                                <h3 className="text-3xl font-serif text-white mb-3 group-hover:text-primary transition-colors leading-tight">{recipe.name}</h3>
                                                {recipe.story && (
                                                    <p className="text-zinc-400 text-sm line-clamp-2 italic font-serif mb-6 opacity-0 group-hover:opacity-100 transition-opacity duration-500">&ldquo;{recipe.story}&rdquo;</p>
                                                )}
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-primary text-[9px] uppercase font-bold tracking-widest border border-primary/20 px-2.5 py-1 rounded-full bg-primary/5">Community</span>
                                                        <div className="flex items-center gap-2 text-zinc-400 group-hover:text-primary transition-colors">
                                                            <Heart size={12} fill={likedRecipes.includes(recipe.id) ? 'currentColor' : 'none'} className={likedRecipes.includes(recipe.id) ? 'text-primary' : ''} />
                                                            <span className="text-[10px] font-bold">{recipe.likesCount}</span>
                                                        </div>
                                                    </div>
                                                    <span className="text-zinc-400 text-[9px] uppercase font-bold tracking-widest truncate max-w-[45%]">
                                                        by {recipe.author}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>

                                    <div className="absolute top-6 right-6 flex flex-col gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity z-20">
                                        <button
                                            onClick={(e) => toggleLike(e, recipe.id)}
                                            aria-label={likedRecipes.includes(recipe.id) ? `Unlike ${recipe.name}` : `Like ${recipe.name}`}
                                            aria-pressed={likedRecipes.includes(recipe.id)}
                                            className={`p-3 rounded-full border backdrop-blur-md transition-all ${likedRecipes.includes(recipe.id) ? 'bg-primary border-primary/40 text-black shadow-lg shadow-primary/20' : 'bg-black/60 border-white/10 text-zinc-400 hover:text-primary shadow-xl'}`}
                                        >
                                            <Heart size={18} fill={likedRecipes.includes(recipe.id) ? 'currentColor' : 'none'} />
                                        </button>
                                        <button
                                            onClick={(e) => saveToFavorites(e, recipe.id)}
                                            aria-label={`Save ${recipe.name} to favourites`}
                                            className="p-3 rounded-full bg-black/60 border border-white/10 text-zinc-400 hover:text-primary backdrop-blur-md shadow-xl transition-all"
                                        >
                                            <BookmarkPlus size={18} />
                                        </button>
                                        {recipe.authorId && (
                                            <button
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/profile/${recipe.authorId}`); }}
                                                aria-label={`View ${recipe.author}'s profile`}
                                                className="p-3 rounded-full bg-black/60 border border-white/10 text-zinc-400 hover:text-primary backdrop-blur-md shadow-xl transition-all"
                                            >
                                                <User size={18} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {hasMore && (
                            <div className="mt-16 flex justify-center">
                                <button
                                    onClick={loadMore}
                                    disabled={loadingMore}
                                    className="px-10 py-4 bg-card border border-border rounded-2xl text-foreground font-bold uppercase tracking-[0.2em] text-[10px] hover:border-primary/50 hover:text-primary transition-all shadow-sm disabled:opacity-50 flex items-center gap-3"
                                >
                                    {loadingMore && <Loader2 size={14} className="animate-spin" />}
                                    {loadingMore ? 'Pouring…' : `Load more (${total - recipes.length} left)`}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </main>

            {toast && (
                <div
                    role="status"
                    aria-live="polite"
                    className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl bg-card border border-border shadow-2xl text-xs font-bold uppercase tracking-[0.2em] text-foreground"
                >
                    {toast}
                </div>
            )}
        </div>
    );
}
